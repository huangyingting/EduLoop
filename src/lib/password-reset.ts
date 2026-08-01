import { createHash, randomBytes } from "node:crypto";
import { Prisma } from "@prisma/client";
import { hashPassword, verifyPassword } from "@/lib/auth";
import { sendPasswordResetEmail } from "@/lib/email";
import { finalizeEmailProofDelivery, nextEmailProofCreatedAt } from "@/lib/email-proof";
import { errorLogMetadata } from "@/lib/logging";
import { prisma } from "@/lib/prisma";
import { deleteExpiredUnusedRegistration, proofExpiration } from "@/lib/retention";

export const PASSWORD_RESET_TTL_MS = 30 * 60_000;
export type PasswordResetResult =
  | { status: "CONFLICT" }
  | { status: "INVALID" }
  | { status: "UNCHANGED" }
  | { status: "UPDATED"; email: string; providersDisconnected: number };

class ConcurrentPasswordReset extends Error {}
class InvalidPasswordResetToken extends Error {}

function transactionConflict(error: unknown) {
  return error instanceof ConcurrentPasswordReset
    || (error instanceof Prisma.PrismaClientKnownRequestError && ["P1008", "P2034"].includes(error.code))
    || (error instanceof Prisma.PrismaClientUnknownRequestError
      && /(?:40P01|deadlock detected)/i.test(error.message));
}

export function hashPasswordResetToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function issuePasswordResetToken(email: string, now = new Date()) {
  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      emailVerified: true,
      passwordHash: true,
      registrationExpiresAt: true,
      sessionVersion: true,
    },
  });
  if (!user) return null;
  if (
    !user.emailVerified
    && user.registrationExpiresAt
    && user.registrationExpiresAt <= now
    && await deleteExpiredUnusedRegistration(email, now)
  ) return null;

  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashPasswordResetToken(token);
  const expiresAt = proofExpiration(
    now,
    PASSWORD_RESET_TTL_MS,
    !user.emailVerified
      && user.registrationExpiresAt
      && user.registrationExpiresAt > now
      ? user.registrationExpiresAt
      : null,
  );
  const record = await prisma.$transaction(async (transaction) => {
    const claimed = await transaction.user.updateMany({
      where: {
        id: user.id,
        passwordHash: user.passwordHash,
        registrationExpiresAt: user.registrationExpiresAt,
        sessionVersion: user.sessionVersion,
      },
      data: { sessionVersion: { increment: 0 } },
    });
    if (!claimed.count) return null;
    const latest = await transaction.passwordResetToken.findFirst({
      where: { userId: user.id },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: { createdAt: true },
    });
    return transaction.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt,
        createdAt: nextEmailProofCreatedAt(now, latest?.createdAt),
      },
      select: { id: true },
    });
  });
  if (!record) return null;
  return { ...record, userId: user.id, email: user.email, token, tokenHash, expiresAt };
}

export async function revokePasswordResetToken(id: string) {
  await prisma.passwordResetToken.deleteMany({ where: { id } });
}

export async function finalizePasswordResetDelivery(
  issued: { id: string; userId: string; tokenHash: string },
  deliveredAt = new Date(),
) {
  return finalizeEmailProofDelivery(issued.userId, issued.id, {
    markDelivered: (transaction) => transaction.passwordResetToken.updateMany({
      where: {
        id: issued.id,
        userId: issued.userId,
        tokenHash: issued.tokenHash,
        deliveredAt: null,
      },
      data: { deliveredAt },
    }),
    findLatestDelivered: (transaction) => transaction.passwordResetToken.findFirst({
      where: { userId: issued.userId, deliveredAt: { not: null } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: { id: true },
    }),
    removeSuperseded: (transaction, retainedId) => transaction.passwordResetToken.deleteMany({
      where: {
        userId: issued.userId,
        id: { not: retainedId },
        deliveredAt: { not: null },
      },
    }),
  });
}

export async function deliverPasswordReset(email: string, origin: string) {
  const issued = await issuePasswordResetToken(email);
  if (!issued) return;
  const resetUrl = `${origin}/reset-password#token=${encodeURIComponent(issued.token)}`;
  try {
    await sendPasswordResetEmail(issued.email, resetUrl);
  } catch (error) {
    console.error(JSON.stringify({
      level: "error",
      event: "password_reset_email_failed",
      ...errorLogMetadata(error),
    }));
    try {
      await revokePasswordResetToken(issued.id);
    } catch (cleanupError) {
      console.error(JSON.stringify({
        level: "error",
        event: "password_reset_delivery_cleanup_failed",
        ...errorLogMetadata(cleanupError),
      }));
    }
    return;
  }
  try {
    await finalizePasswordResetDelivery(issued);
  } catch (error) {
    // The provider accepted this email. Keep its proof usable if delivery
    // bookkeeping is temporarily unavailable, and alert operators to investigate.
    console.error(JSON.stringify({
      level: "error",
      event: "password_reset_delivery_finalize_failed",
      ...errorLogMetadata(error),
    }));
  }
}

export async function resetPasswordWithToken(
  token: string,
  nextPassword: string,
  now = new Date(),
): Promise<PasswordResetResult> {
  const tokenHash = hashPasswordResetToken(token);
  const record = await prisma.passwordResetToken.findUnique({
    where: { tokenHash },
    select: {
      id: true,
      userId: true,
      expiresAt: true,
      user: {
        select: {
          email: true,
          passwordHash: true,
          sessionVersion: true,
        },
      },
    },
  });
  if (!record || record.expiresAt <= now) return { status: "INVALID" };
  if (record.user.passwordHash && await verifyPassword(nextPassword, record.user.passwordHash)) {
    return { status: "UNCHANGED" };
  }

  const passwordHash = await hashPassword(nextPassword);
  try {
    return await prisma.$transaction(async (transaction) => {
      // Match email verification's lock order: user security state first,
      // proof token second. This serializes competing ownership claims without
      // allowing the two token tables to form a PostgreSQL deadlock cycle.
      const locked = await transaction.user.updateMany({
        where: {
          id: record.userId,
          passwordHash: record.user.passwordHash,
          sessionVersion: record.user.sessionVersion,
        },
        data: { sessionVersion: { increment: 0 } },
      });
      if (!locked.count) throw new ConcurrentPasswordReset();

      const claimed = await transaction.passwordResetToken.deleteMany({
        where: { id: record.id, tokenHash, expiresAt: { gt: now } },
      });
      if (!claimed.count) throw new InvalidPasswordResetToken();

      const ownershipTransition = await transaction.user.updateMany({
        where: {
          id: record.userId,
          emailVerified: null,
          passwordHash: record.user.passwordHash,
          sessionVersion: record.user.sessionVersion,
        },
        data: {
          passwordHash,
          emailVerified: now,
          registrationExpiresAt: null,
          sessionVersion: { increment: 1 },
        },
      });
      if (!ownershipTransition.count) {
        const updated = await transaction.user.updateMany({
          where: {
            id: record.userId,
            emailVerified: { not: null },
            passwordHash: record.user.passwordHash,
            sessionVersion: record.user.sessionVersion,
          },
          data: {
            passwordHash,
            registrationExpiresAt: null,
            sessionVersion: { increment: 1 },
          },
        });
        if (!updated.count) throw new ConcurrentPasswordReset();
      }

      const disconnected = ownershipTransition.count
        ? await transaction.account.deleteMany({ where: { userId: record.userId } })
        : { count: 0 };
      await transaction.session.deleteMany({ where: { userId: record.userId } });
      await transaction.emailVerificationToken.deleteMany({ where: { userId: record.userId } });
      await transaction.emailChangeToken.deleteMany({ where: { userId: record.userId } });
      await transaction.passwordResetToken.deleteMany({ where: { userId: record.userId } });
      return {
        status: "UPDATED",
        email: record.user.email,
        providersDisconnected: disconnected.count,
      } as const;
    });
  } catch (error) {
    if (error instanceof InvalidPasswordResetToken) return { status: "INVALID" };
    if (transactionConflict(error)) return { status: "CONFLICT" };
    throw error;
  }
}
