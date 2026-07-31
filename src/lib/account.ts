import { hashPassword, verifyPassword } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export type PasswordChangeResult = "INVALID_PASSWORD" | "NOT_FOUND" | "UNCHANGED" | "CONFLICT" | "UPDATED" | "PASSWORD_SET" | "PASSWORD_SET_VERIFICATION_REQUIRED";
export type AccountDeletionResult = "NOT_FOUND" | "INVALID_CONFIRMATION" | "CONFLICT" | "DELETED";
export type AccountSessionRevocationResult = "CONFLICT" | "REVOKED";

export async function revokeAccountSessions(
  userId: string,
  sessionVersion: number,
): Promise<AccountSessionRevocationResult> {
  return prisma.$transaction(async (transaction) => {
    const updated = await transaction.user.updateMany({
      where: { id: userId, sessionVersion },
      data: { sessionVersion: { increment: 1 } },
    });
    if (!updated.count) return "CONFLICT";
    await transaction.session.deleteMany({ where: { userId } });
    await transaction.emailVerificationToken.deleteMany({ where: { userId } });
    await transaction.emailChangeToken.deleteMany({ where: { userId } });
    await transaction.passwordResetToken.deleteMany({ where: { userId } });
    return "REVOKED";
  });
}

export async function changeAccountPassword(userId: string, currentPassword: string | undefined, nextPassword: string): Promise<PasswordChangeResult> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { emailVerified: true, passwordHash: true },
  });
  if (!user) return "NOT_FOUND";
  if (user.passwordHash && (!currentPassword || !await verifyPassword(currentPassword, user.passwordHash))) return "INVALID_PASSWORD";
  if (user.passwordHash && await verifyPassword(nextPassword, user.passwordHash)) return "UNCHANGED";

  const passwordHash = await hashPassword(nextPassword);
  return prisma.$transaction(async (transaction) => {
    const updated = await transaction.user.updateMany({
      where: { id: userId, passwordHash: user.passwordHash },
      data: {
        passwordHash,
        sessionVersion: { increment: 1 },
      },
    });
    if (!updated.count) return "CONFLICT";

    await transaction.session.deleteMany({ where: { userId } });
    await transaction.emailVerificationToken.deleteMany({ where: { userId } });
    await transaction.emailChangeToken.deleteMany({ where: { userId } });
    await transaction.passwordResetToken.deleteMany({ where: { userId } });
    if (user.passwordHash) return "UPDATED";
    return user.emailVerified ? "PASSWORD_SET" : "PASSWORD_SET_VERIFICATION_REQUIRED";
  });
}

export async function deleteAccount(
  userId: string,
  confirmation: string | { currentPassword?: string; emailConfirmation?: string },
): Promise<AccountDeletionResult> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, passwordHash: true, sessionVersion: true },
  });
  if (!user) return "NOT_FOUND";
  const values = typeof confirmation === "string" ? { currentPassword: confirmation } : confirmation;
  const confirmed = user.passwordHash
    ? Boolean(values.currentPassword && await verifyPassword(values.currentPassword, user.passwordHash))
    : values.emailConfirmation?.trim().toLowerCase() === user.email;
  if (!confirmed) return "INVALID_CONFIRMATION";

  // Deleting User is one atomic database statement; provider identities,
  // sessions, proof tokens, consent, and the complete learner graph cascade.
  // The snapshot guard prevents an older confirmation from racing a password,
  // email, provider, or other session-version-changing security operation.
  const deleted = await prisma.user.deleteMany({
    where: {
      id: userId,
      passwordHash: user.passwordHash,
      sessionVersion: user.sessionVersion,
    },
  });
  return deleted.count ? "DELETED" : "CONFLICT";
}
