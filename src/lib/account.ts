import { hashPassword, verifyPassword } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { claimAuthenticatedSecurityState } from "@/lib/security-state";

export type PasswordChangeResult = "INVALID_PASSWORD" | "NOT_FOUND" | "UNCHANGED" | "CONFLICT" | "UPDATED" | "PASSWORD_SET" | "PASSWORD_SET_VERIFICATION_REQUIRED";
export type AccountDeletionResult = "NOT_FOUND" | "INVALID_CONFIRMATION" | "CONFLICT" | "DELETED";
export type AccountSessionRevocationResult = "CONFLICT" | "REVOKED";
export type LearningDataDeletionResult = "CONFLICT" | "DELETED" | "EMPTY";

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

export async function changeAccountPassword(
  userId: string,
  expectedSessionVersion: number,
  currentPassword: string | undefined,
  nextPassword: string,
): Promise<PasswordChangeResult> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { emailVerified: true, passwordHash: true, sessionVersion: true },
  });
  if (!user) return "NOT_FOUND";
  if (user.sessionVersion !== expectedSessionVersion) return "CONFLICT";
  if (user.passwordHash && (!currentPassword || !await verifyPassword(currentPassword, user.passwordHash))) return "INVALID_PASSWORD";
  if (user.passwordHash && await verifyPassword(nextPassword, user.passwordHash)) return "UNCHANGED";

  const passwordHash = await hashPassword(nextPassword);
  return prisma.$transaction(async (transaction) => {
    const updated = await transaction.user.updateMany({
      where: {
        id: userId,
        passwordHash: user.passwordHash,
        sessionVersion: expectedSessionVersion,
      },
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
  expectedSessionVersion: number,
  confirmation: string | { currentPassword?: string; emailConfirmation?: string },
): Promise<AccountDeletionResult> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, passwordHash: true, sessionVersion: true },
  });
  if (!user) return "NOT_FOUND";
  if (user.sessionVersion !== expectedSessionVersion) return "CONFLICT";
  const values = typeof confirmation === "string" ? { currentPassword: confirmation } : confirmation;
  const confirmed = user.passwordHash
    ? Boolean(values.currentPassword && await verifyPassword(values.currentPassword, user.passwordHash))
    : values.emailConfirmation?.trim().toLowerCase() === user.email;
  if (!confirmed) return "INVALID_CONFIRMATION";

  // Deleting User is one atomic database statement; provider identities,
  // sessions, proof tokens, consent, and the personal learner graph cascade.
  // A database trigger anonymizes learner reports before that cascade so open
  // moderation work and its audit actions survive without reporter identity or
  // free text. The snapshot guard prevents an older confirmation from racing a
  // password, email, provider, or other security-state-changing operation.
  const deleted = await prisma.user.deleteMany({
    where: {
      id: userId,
      passwordHash: user.passwordHash,
      sessionVersion: expectedSessionVersion,
    },
  });
  return deleted.count ? "DELETED" : "CONFLICT";
}

export async function deleteLearningData(
  userId: string,
  expectedSessionVersion: number,
): Promise<LearningDataDeletionResult> {
  return prisma.$transaction(async (transaction) => {
    const claimed = await claimAuthenticatedSecurityState(transaction, {
      userId,
      sessionVersion: expectedSessionVersion,
    });
    if (!claimed) return "CONFLICT";
    const removed = await transaction.learnerProfile.deleteMany({ where: { userId } });
    return removed.count ? "DELETED" : "EMPTY";
  });
}
