import { createHash, randomBytes } from "node:crypto";
import { Prisma } from "@prisma/client";
import { hashPassword, verifyPassword } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

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
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true, email: true } });
  if (!user) return null;

  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashPasswordResetToken(token);
  const expiresAt = new Date(now.getTime() + PASSWORD_RESET_TTL_MS);
  const record = await prisma.$transaction(async (transaction) => {
    await transaction.passwordResetToken.deleteMany({ where: { userId: user.id } });
    return transaction.passwordResetToken.create({
      data: { userId: user.id, tokenHash, expiresAt },
      select: { id: true },
    });
  });
  return { ...record, email: user.email, token, tokenHash, expiresAt };
}

export async function revokePasswordResetToken(id: string) {
  await prisma.passwordResetToken.deleteMany({ where: { id } });
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
