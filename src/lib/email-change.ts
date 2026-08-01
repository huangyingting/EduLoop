import { createHash, randomBytes } from "node:crypto";
import { Prisma } from "@prisma/client";
import { sendEmailChangeVerificationEmail } from "@/lib/email";
import { finalizeEmailProofDelivery, nextEmailProofCreatedAt } from "@/lib/email-proof";
import { errorLogMetadata } from "@/lib/logging";
import { prisma } from "@/lib/prisma";

export const EMAIL_CHANGE_TTL_MS = 60 * 60_000;

export function hashEmailChangeToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export type EmailChangeIssueResult =
  | { status: "CONFLICT" }
  | { status: "SECURITY_CONFLICT" }
  | { status: "NOT_FOUND" }
  | { status: "UNCHANGED" }
  | {
    status: "ISSUED";
    id: string;
    userId: string;
    newEmail: string;
    token: string;
    tokenHash: string;
    expiresAt: Date;
  };

export async function issueEmailChangeToken(
  userId: string,
  newEmail: string,
  expectedSessionVersion: number,
  now = new Date(),
): Promise<EmailChangeIssueResult> {
  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashEmailChangeToken(token);
  const expiresAt = new Date(now.getTime() + EMAIL_CHANGE_TTL_MS);
  return prisma.$transaction(async (transaction) => {
    const user = await transaction.user.findUnique({
      where: { id: userId },
      select: { email: true, sessionVersion: true },
    });
    if (!user) return { status: "NOT_FOUND" };
    if (user.sessionVersion !== expectedSessionVersion) return { status: "SECURITY_CONFLICT" };

    // Lock the exact security snapshot authorized by the request before a
    // token can be persisted. If password recovery, session revocation, email
    // verification, or another security mutation wins first, this stale
    // request must not recreate a proof after that mutation cleared old ones.
    const claimed = await transaction.user.updateMany({
      where: {
        id: userId,
        email: user.email,
        sessionVersion: expectedSessionVersion,
      },
      data: { sessionVersion: { increment: 0 } },
    });
    if (!claimed.count) return { status: "SECURITY_CONFLICT" };
    if (user.email === newEmail) return { status: "UNCHANGED" };
    if (await transaction.user.findUnique({ where: { email: newEmail }, select: { id: true } })) {
      return { status: "CONFLICT" };
    }

    const latest = await transaction.emailChangeToken.findFirst({
      where: { userId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: { createdAt: true },
    });
    const record = await transaction.emailChangeToken.create({
      data: {
        userId,
        newEmail,
        tokenHash,
        expiresAt,
        createdAt: nextEmailProofCreatedAt(now, latest?.createdAt),
      },
      select: { id: true },
    });
    return { status: "ISSUED", ...record, userId, newEmail, token, tokenHash, expiresAt };
  });
}

export async function revokeEmailChangeToken(id: string, tokenHash: string) {
  await prisma.emailChangeToken.deleteMany({ where: { id, tokenHash } });
}

export async function finalizeEmailChangeDelivery(
  issued: Extract<EmailChangeIssueResult, { status: "ISSUED" }>,
  deliveredAt = new Date(),
) {
  return finalizeEmailProofDelivery(issued.userId, issued.id, {
    markDelivered: (transaction) => transaction.emailChangeToken.updateMany({
      where: {
        id: issued.id,
        userId: issued.userId,
        tokenHash: issued.tokenHash,
        deliveredAt: null,
      },
      data: { deliveredAt },
    }),
    findLatestDelivered: (transaction) => transaction.emailChangeToken.findFirst({
      where: { userId: issued.userId, deliveredAt: { not: null } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: { id: true },
    }),
    removeSuperseded: (transaction, retainedId) => transaction.emailChangeToken.deleteMany({
      where: {
        userId: issued.userId,
        id: { not: retainedId },
        deliveredAt: { not: null },
      },
    }),
  });
}

export async function deliverEmailChangeVerification(
  issued: Extract<EmailChangeIssueResult, { status: "ISSUED" }>,
  origin: string,
) {
  const verificationUrl = `${origin}/change-email#token=${encodeURIComponent(issued.token)}`;
  try {
    await sendEmailChangeVerificationEmail(issued.newEmail, verificationUrl);
  } catch (error) {
    console.error(JSON.stringify({
      level: "error",
      event: "email_change_delivery_failed",
      ...errorLogMetadata(error),
    }));
    try {
      await revokeEmailChangeToken(issued.id, issued.tokenHash);
    } catch (cleanupError) {
      console.error(JSON.stringify({
        level: "error",
        event: "email_change_delivery_cleanup_failed",
        ...errorLogMetadata(cleanupError),
      }));
    }
    return;
  }
  try {
    await finalizeEmailChangeDelivery(issued);
  } catch (error) {
    // The provider accepted this email. Keep its proof usable if delivery
    // bookkeeping is temporarily unavailable, and alert operators to investigate.
    console.error(JSON.stringify({
      level: "error",
      event: "email_change_delivery_finalize_failed",
      ...errorLogMetadata(error),
    }));
  }
}

export type EmailChangeCompletionResult =
  | { status: "CONFLICT" }
  | { status: "INVALID" }
  | { status: "UPDATED"; oldEmail: string; newEmail: string };

class ConcurrentEmailChange extends Error {}
class InvalidEmailChangeToken extends Error {}

function transactionConflict(error: unknown) {
  return error instanceof ConcurrentEmailChange
    || (error instanceof Prisma.PrismaClientKnownRequestError && ["P1008", "P2034"].includes(error.code))
    || (error instanceof Prisma.PrismaClientUnknownRequestError
      && /(?:40P01|deadlock detected)/i.test(error.message));
}

export async function completeEmailChange(
  token: string,
  now = new Date(),
): Promise<EmailChangeCompletionResult> {
  const tokenHash = hashEmailChangeToken(token);
  const record = await prisma.emailChangeToken.findUnique({
    where: { tokenHash },
    select: {
      id: true,
      userId: true,
      newEmail: true,
      expiresAt: true,
      user: { select: { email: true, sessionVersion: true } },
    },
  });
  if (!record || record.expiresAt <= now) {
    if (record) await revokeEmailChangeToken(record.id, tokenHash);
    return { status: "INVALID" };
  }

  try {
    return await prisma.$transaction(async (transaction) => {
      const locked = await transaction.user.updateMany({
        where: {
          id: record.userId,
          email: record.user.email,
          sessionVersion: record.user.sessionVersion,
        },
        data: { sessionVersion: { increment: 0 } },
      });
      if (!locked.count) throw new ConcurrentEmailChange();

      const claimed = await transaction.emailChangeToken.deleteMany({
        where: { id: record.id, tokenHash, expiresAt: { gt: now } },
      });
      if (!claimed.count) throw new InvalidEmailChangeToken();
      await transaction.user.update({
        where: { id: record.userId },
        data: {
          email: record.newEmail,
          emailVerified: now,
          registrationExpiresAt: null,
          sessionVersion: { increment: 1 },
        },
      });
      await transaction.session.deleteMany({ where: { userId: record.userId } });
      await transaction.emailVerificationToken.deleteMany({ where: { userId: record.userId } });
      await transaction.passwordResetToken.deleteMany({ where: { userId: record.userId } });
      await transaction.emailChangeToken.deleteMany({ where: { userId: record.userId } });
      return { status: "UPDATED", oldEmail: record.user.email, newEmail: record.newEmail } as const;
    });
  } catch (error) {
    if (error instanceof InvalidEmailChangeToken) return { status: "INVALID" };
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      await revokeEmailChangeToken(record.id, tokenHash);
      return { status: "CONFLICT" };
    }
    if (transactionConflict(error)) return { status: "CONFLICT" };
    throw error;
  }
}
