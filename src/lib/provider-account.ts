import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { SocialProviderId } from "@/lib/social-providers";

const PROVIDER_ACCOUNT_TYPES = ["oauth", "oidc"];
const MAX_DISCONNECT_ATTEMPTS = 3;

class ConcurrentProviderChange extends Error {}

export type ProviderDisconnectResult =
  | { status: "CONFLICT" }
  | { status: "LAST_LOGIN_METHOD" }
  | { status: "NOT_CONNECTED" }
  | { status: "NOT_FOUND" }
  | { status: "DISCONNECTED"; email: string };

function retryableConflict(error: unknown) {
  return error instanceof ConcurrentProviderChange
    || (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034");
}

export async function disconnectProviderAccount(
  userId: string,
  provider: SocialProviderId,
): Promise<ProviderDisconnectResult> {
  for (let attempt = 0; attempt < MAX_DISCONNECT_ATTEMPTS; attempt += 1) {
    try {
      return await prisma.$transaction(async (transaction) => {
        const user = await transaction.user.findUnique({
          where: { id: userId },
          select: {
            email: true,
            passwordHash: true,
            sessionVersion: true,
            accounts: {
              where: { type: { in: PROVIDER_ACCOUNT_TYPES } },
              select: { provider: true },
            },
          },
        });
        if (!user) return { status: "NOT_FOUND" } as const;

        const connectedProviders = new Set(user.accounts.map((account) => account.provider));
        if (!connectedProviders.has(provider)) return { status: "NOT_CONNECTED" } as const;
        if (!user.passwordHash && connectedProviders.size <= 1) {
          return { status: "LAST_LOGIN_METHOD" } as const;
        }

        // Claim this version before deleting credentials. Two concurrent
        // disconnects may both observe two providers, but only one can update
        // the same version; the loser retries against the remaining method.
        const claimed = await transaction.user.updateMany({
          where: { id: userId, sessionVersion: user.sessionVersion },
          data: { sessionVersion: { increment: 1 } },
        });
        if (claimed.count !== 1) throw new ConcurrentProviderChange();

        const deleted = await transaction.account.deleteMany({
          where: {
            userId,
            provider,
            type: { in: PROVIDER_ACCOUNT_TYPES },
          },
        });
        if (!deleted.count) throw new ConcurrentProviderChange();

        await transaction.session.deleteMany({ where: { userId } });
        await transaction.emailVerificationToken.deleteMany({ where: { userId } });
        await transaction.emailChangeToken.deleteMany({ where: { userId } });
        await transaction.passwordResetToken.deleteMany({ where: { userId } });
        return { status: "DISCONNECTED", email: user.email } as const;
      });
    } catch (error) {
      if (!retryableConflict(error)) throw error;
      if (attempt === MAX_DISCONNECT_ATTEMPTS - 1) return { status: "CONFLICT" };
    }
  }
  return { status: "CONFLICT" };
}
