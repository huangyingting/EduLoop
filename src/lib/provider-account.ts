import { Prisma } from "@prisma/client";
import type { AdapterAccount } from "next-auth/adapters";
import { prisma } from "@/lib/prisma";
import type { SocialProviderId } from "@/lib/social-providers";

const PROVIDER_ACCOUNT_TYPES = ["oauth", "oidc"];
const MAX_DISCONNECT_ATTEMPTS = 3;

class ConcurrentProviderChange extends Error {
  constructor() {
    super("Provider security state changed concurrently.");
  }
}

export type ProviderDisconnectResult =
  | { status: "CONFLICT" }
  | { status: "LAST_LOGIN_METHOD" }
  | { status: "NOT_CONNECTED" }
  | { status: "NOT_FOUND" }
  | { status: "DISCONNECTED"; email: string };

export type ProviderAuthenticationSnapshot = {
  userId: string;
  sessionVersion: number;
};

export async function providerAuthenticationSnapshot(
  provider: string,
  providerAccountId: string,
): Promise<ProviderAuthenticationSnapshot | null> {
  const account = await prisma.account.findUnique({
    where: { provider_providerAccountId: { provider, providerAccountId } },
    select: {
      userId: true,
      user: { select: { sessionVersion: true } },
    },
  });
  return account
    ? { userId: account.userId, sessionVersion: account.user.sessionVersion }
    : null;
}

export function providerSessionVersionForAuthentication(
  snapshot: ProviderAuthenticationSnapshot | null | undefined,
  userId: string,
  isNewUser: boolean,
  currentSessionVersion: number,
) {
  if (snapshot) {
    return snapshot.userId === userId && snapshot.sessionVersion === currentSessionVersion
      ? snapshot.sessionVersion
      : null;
  }
  // A provider identity has no prior security state only during creation of a
  // genuinely new account. Existing and signed-in accounts must have been
  // observed explicitly by the sign-in callback.
  return isNewUser && currentSessionVersion === 0 ? 0 : null;
}

export async function linkProviderAccountSafely(
  account: AdapterAccount,
  expectedSessionVersion: number | undefined,
) {
  return prisma.$transaction(async (transaction) => {
    // Auth.js calls signIn before linkAccount. For an authenticated link, bind
    // persistence to the exact session version that signIn validated. Without
    // such a snapshot, permit only the untouched state of a genuinely new
    // social account; existing accounts must link from a recent session.
    const claimed = await transaction.user.updateMany({
      where: expectedSessionVersion === undefined
        ? {
          id: account.userId,
          role: "LEARNER",
          emailVerified: null,
          passwordHash: null,
          sessionVersion: 0,
          accounts: { none: {} },
        }
        : { id: account.userId, sessionVersion: expectedSessionVersion },
      data: { sessionVersion: { increment: 0 } },
    });
    if (!claimed.count) throw new ConcurrentProviderChange();
    return transaction.account.create({
      data: account,
    }) as unknown as AdapterAccount;
  });
}

function retryableConflict(error: unknown) {
  return error instanceof ConcurrentProviderChange
    || (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034");
}

export async function disconnectProviderAccount(
  userId: string,
  expectedSessionVersion: number,
  provider: SocialProviderId,
): Promise<ProviderDisconnectResult> {
  for (let attempt = 0; attempt < MAX_DISCONNECT_ATTEMPTS; attempt += 1) {
    try {
      return await prisma.$transaction(async (transaction) => {
        const user = await transaction.user.findUnique({
          where: { id: userId },
          select: {
            email: true,
            emailVerified: true,
            passwordHash: true,
            sessionVersion: true,
            accounts: {
              where: { type: { in: PROVIDER_ACCOUNT_TYPES } },
              select: { provider: true },
            },
          },
        });
        if (!user) return { status: "NOT_FOUND" } as const;
        if (user.sessionVersion !== expectedSessionVersion) return { status: "CONFLICT" } as const;

        const connectedProviders = new Set(user.accounts.map((account) => account.provider));
        if (!connectedProviders.has(provider)) return { status: "NOT_CONNECTED" } as const;
        if (!(user.passwordHash && user.emailVerified) && connectedProviders.size <= 1) {
          return { status: "LAST_LOGIN_METHOD" } as const;
        }

        // Claim the version authenticated by this request before deleting
        // credentials. Two concurrent disconnects may both observe two
        // providers, but only one can advance that version; the stale loser
        // must fail instead of adopting the winner's newer security state.
        const claimed = await transaction.user.updateMany({
          where: { id: userId, sessionVersion: expectedSessionVersion },
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
