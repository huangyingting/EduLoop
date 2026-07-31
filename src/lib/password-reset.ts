import { createHash, randomBytes } from "node:crypto";
import { hashPassword, verifyPassword } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const PASSWORD_RESET_TTL_MS = 30 * 60_000;
export type PasswordResetResult = "INVALID" | "UNCHANGED" | "UPDATED";

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
    select: { id: true, userId: true, expiresAt: true, user: { select: { passwordHash: true } } },
  });
  if (!record || record.expiresAt <= now) return "INVALID";
  if (record.user.passwordHash && await verifyPassword(nextPassword, record.user.passwordHash)) return "UNCHANGED";

  const passwordHash = await hashPassword(nextPassword);
  return prisma.$transaction(async (transaction) => {
    const claimed = await transaction.passwordResetToken.deleteMany({
      where: { id: record.id, tokenHash, expiresAt: { gt: now } },
    });
    if (!claimed.count) return "INVALID";
    await transaction.user.update({
      where: { id: record.userId },
      data: {
        passwordHash,
        emailVerified: now,
        sessionVersion: { increment: 1 },
      },
    });
    await transaction.session.deleteMany({ where: { userId: record.userId } });
    await transaction.emailVerificationToken.deleteMany({ where: { userId: record.userId } });
    await transaction.emailChangeToken.deleteMany({ where: { userId: record.userId } });
    await transaction.passwordResetToken.deleteMany({ where: { userId: record.userId } });
    return "UPDATED";
  });
}
