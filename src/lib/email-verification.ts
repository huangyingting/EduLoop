import { createHash, randomBytes } from "node:crypto";
import { Prisma } from "@prisma/client";
import { verifyPassword } from "@/lib/auth";
import { sendEmailVerificationEmail } from "@/lib/email";
import { prisma } from "@/lib/prisma";

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
    select: { id: true, email: true, emailVerified: true, passwordHash: true },
  });
  if (!user || user.emailVerified || !user.passwordHash) return null;

  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashEmailVerificationToken(token);
  const expiresAt = new Date(now.getTime() + EMAIL_VERIFICATION_TTL_MS);
  const record = await prisma.$transaction(async (transaction) => {
    await transaction.emailVerificationToken.deleteMany({ where: { userId: user.id } });
    return transaction.emailVerificationToken.create({
      data: { userId: user.id, tokenHash, expiresAt },
      select: { id: true },
    });
  });
  return { ...record, email: user.email, token, tokenHash, expiresAt };
}

export async function revokeEmailVerificationToken(id: string) {
  await prisma.emailVerificationToken.deleteMany({ where: { id } });
}

export async function deliverEmailVerification(email: string, origin: string) {
  const issued = await issueEmailVerificationToken(email);
  if (!issued) return;
  const verificationUrl = `${origin}/verify-email#token=${encodeURIComponent(issued.token)}`;
  try {
    await sendEmailVerificationEmail(issued.email, verificationUrl);
  } catch (error) {
    await revokeEmailVerificationToken(issued.id);
    console.error(JSON.stringify({
      level: "error",
      event: "email_verification_delivery_failed",
      message: error instanceof Error ? error.message : "Unknown email delivery error",
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
          data: { sessionVersion: { increment: 1 } },
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
