import { createHash, randomBytes } from "node:crypto";
import { Prisma } from "@prisma/client";
import { verifyPassword } from "@/lib/auth";
import { sendEmailVerificationEmail } from "@/lib/email";
import { finalizeEmailProofDelivery, nextEmailProofCreatedAt } from "@/lib/email-proof";
import { errorLogMetadata } from "@/lib/logging";
import { prisma } from "@/lib/prisma";
import { deleteExpiredUnusedRegistration, proofExpiration } from "@/lib/retention";

export const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60_000;

export type EmailVerificationResult =
  | { status: "CONFLICT" }
  | { status: "INVALID" }
  | { status: "INVALID_PASSWORD" }
  | { status: "VERIFIED"; providersDisconnected: number };

class ConcurrentEmailVerification extends Error {}
class InvalidEmailVerificationToken extends Error {}

function transactionConflict(error: unknown) {
  return error instanceof ConcurrentEmailVerification
    || (error instanceof Prisma.PrismaClientKnownRequestError && ["P1008", "P2034"].includes(error.code))
    || (error instanceof Prisma.PrismaClientUnknownRequestError
      && /(?:40P01|deadlock detected)/i.test(error.message));
}

export function hashEmailVerificationToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function issueEmailVerificationToken(email: string, now = new Date()) {
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
  if (!user || user.emailVerified || !user.passwordHash) return null;
  if (
    user.registrationExpiresAt
    && user.registrationExpiresAt <= now
    && await deleteExpiredUnusedRegistration(email, now)
  ) return null;

  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashEmailVerificationToken(token);
  const expiresAt = proofExpiration(
    now,
    EMAIL_VERIFICATION_TTL_MS,
    user.registrationExpiresAt && user.registrationExpiresAt > now
      ? user.registrationExpiresAt
      : null,
  );
  const record = await prisma.$transaction(async (transaction) => {
    const claimed = await transaction.user.updateMany({
      where: {
        id: user.id,
        emailVerified: null,
        passwordHash: user.passwordHash,
        registrationExpiresAt: user.registrationExpiresAt,
        sessionVersion: user.sessionVersion,
      },
      data: { sessionVersion: { increment: 0 } },
    });
    if (!claimed.count) return null;
    const latest = await transaction.emailVerificationToken.findFirst({
      where: { userId: user.id },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: { createdAt: true },
    });
    return transaction.emailVerificationToken.create({
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

export async function revokeEmailVerificationToken(id: string) {
  await prisma.emailVerificationToken.deleteMany({ where: { id } });
}

export async function finalizeEmailVerificationDelivery(
  issued: { id: string; userId: string; tokenHash: string },
  deliveredAt = new Date(),
) {
  return finalizeEmailProofDelivery(issued.userId, issued.id, {
    markDelivered: (transaction) => transaction.emailVerificationToken.updateMany({
      where: {
        id: issued.id,
        userId: issued.userId,
        tokenHash: issued.tokenHash,
        deliveredAt: null,
      },
      data: { deliveredAt },
    }),
    findLatestDelivered: (transaction) => transaction.emailVerificationToken.findFirst({
      where: { userId: issued.userId, deliveredAt: { not: null } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: { id: true },
    }),
    removeSuperseded: (transaction, retainedId) => transaction.emailVerificationToken.deleteMany({
      where: {
        userId: issued.userId,
        id: { not: retainedId },
        deliveredAt: { not: null },
      },
    }),
  });
}

export async function deliverEmailVerification(email: string, origin: string) {
  const issued = await issueEmailVerificationToken(email);
  if (!issued) return;
  const verificationUrl = `${origin}/verify-email#token=${encodeURIComponent(issued.token)}`;
  try {
    await sendEmailVerificationEmail(issued.email, verificationUrl);
  } catch (error) {
    console.error(JSON.stringify({
      level: "error",
      event: "email_verification_delivery_failed",
      ...errorLogMetadata(error),
    }));
    try {
      await revokeEmailVerificationToken(issued.id);
    } catch (cleanupError) {
      console.error(JSON.stringify({
        level: "error",
        event: "email_verification_delivery_cleanup_failed",
        ...errorLogMetadata(cleanupError),
      }));
    }
    return;
  }
  try {
    await finalizeEmailVerificationDelivery(issued);
  } catch (error) {
    // Resend already accepted the message. Leave this unconfirmed row usable
    // rather than revoking the link that is now on its way to the learner.
    console.error(JSON.stringify({
      level: "error",
      event: "email_verification_delivery_finalize_failed",
      ...errorLogMetadata(error),
    }));
  }
}

export async function verifyEmailWithToken(
  token: string,
  password: string,
  now = new Date(),
): Promise<EmailVerificationResult> {
  const tokenHash = hashEmailVerificationToken(token);
  const record = await prisma.emailVerificationToken.findUnique({
    where: { tokenHash },
    select: {
      id: true,
      userId: true,
      expiresAt: true,
      user: {
        select: {
          passwordHash: true,
          sessionVersion: true,
        },
      },
    },
  });
  if (!record || record.expiresAt <= now || !record.user.passwordHash) {
    return { status: "INVALID" };
  }
  if (!await verifyPassword(password, record.user.passwordHash)) {
    return { status: "INVALID_PASSWORD" };
  }

  try {
    return await prisma.$transaction(async (transaction) => {
      // Every account-proof transaction locks the user snapshot before its
      // token row. A shared lock order prevents verification and recovery from
      // deadlocking while each tries to invalidate the other's proof.
      const locked = await transaction.user.updateMany({
        where: {
          id: record.userId,
          passwordHash: record.user.passwordHash,
          sessionVersion: record.user.sessionVersion,
        },
        data: { sessionVersion: { increment: 0 } },
      });
      if (!locked.count) throw new ConcurrentEmailVerification();

      const claimed = await transaction.emailVerificationToken.deleteMany({
        where: { id: record.id, tokenHash, expiresAt: { gt: now } },
      });
      if (!claimed.count) throw new InvalidEmailVerificationToken();

      const transitioned = await transaction.user.updateMany({
        where: {
          id: record.userId,
          emailVerified: null,
          passwordHash: record.user.passwordHash,
          sessionVersion: record.user.sessionVersion,
        },
        data: {
          emailVerified: now,
          registrationExpiresAt: null,
          sessionVersion: { increment: 1 },
        },
      });

      if (!transitioned.count) {
        const current = await transaction.user.findUnique({
          where: { id: record.userId },
          select: { emailVerified: true, passwordHash: true, sessionVersion: true },
        });
        if (
          !current?.emailVerified
          || current.passwordHash !== record.user.passwordHash
          || current.sessionVersion !== record.user.sessionVersion
        ) {
          throw new ConcurrentEmailVerification();
        }
        const rotated = await transaction.user.updateMany({
          where: {
            id: record.userId,
            emailVerified: { not: null },
            passwordHash: record.user.passwordHash,
            sessionVersion: record.user.sessionVersion,
          },
          data: { registrationExpiresAt: null, sessionVersion: { increment: 1 } },
        });
        if (!rotated.count) throw new ConcurrentEmailVerification();
        await transaction.session.deleteMany({ where: { userId: record.userId } });
        await transaction.emailChangeToken.deleteMany({ where: { userId: record.userId } });
        await transaction.passwordResetToken.deleteMany({ where: { userId: record.userId } });
        await transaction.emailVerificationToken.deleteMany({ where: { userId: record.userId } });
        return { status: "VERIFIED", providersDisconnected: 0 } as const;
      }

      const disconnected = await transaction.account.deleteMany({
        where: { userId: record.userId },
      });
      await transaction.session.deleteMany({ where: { userId: record.userId } });
      await transaction.emailChangeToken.deleteMany({ where: { userId: record.userId } });
      await transaction.passwordResetToken.deleteMany({ where: { userId: record.userId } });
      await transaction.emailVerificationToken.deleteMany({ where: { userId: record.userId } });
      return {
        status: "VERIFIED",
        providersDisconnected: disconnected.count,
      } as const;
    });
  } catch (error) {
    if (error instanceof InvalidEmailVerificationToken) return { status: "INVALID" };
    if (transactionConflict(error)) return { status: "CONFLICT" };
    throw error;
  }
}
