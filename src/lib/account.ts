import { hashPassword, verifyPassword } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export type PasswordChangeResult = "INVALID_PASSWORD" | "NOT_FOUND" | "UNCHANGED" | "CONFLICT" | "UPDATED" | "PASSWORD_SET";

export async function changeAccountPassword(userId: string, currentPassword: string | undefined, nextPassword: string): Promise<PasswordChangeResult> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { passwordHash: true } });
  if (!user) return "NOT_FOUND";
  if (user.passwordHash && (!currentPassword || !await verifyPassword(currentPassword, user.passwordHash))) return "INVALID_PASSWORD";
  if (user.passwordHash && await verifyPassword(nextPassword, user.passwordHash)) return "UNCHANGED";

  const passwordHash = await hashPassword(nextPassword);
  return prisma.$transaction(async (transaction) => {
    const updated = await transaction.user.updateMany({
      where: { id: userId, passwordHash: user.passwordHash },
      data: {
        passwordHash,
        emailVerified: user.passwordHash ? undefined : new Date(),
        sessionVersion: { increment: 1 },
      },
    });
    if (!updated.count) return "CONFLICT";

    await transaction.session.deleteMany({ where: { userId } });
    await transaction.emailVerificationToken.deleteMany({ where: { userId } });
    await transaction.emailChangeToken.deleteMany({ where: { userId } });
    await transaction.passwordResetToken.deleteMany({ where: { userId } });
    return user.passwordHash ? "UPDATED" : "PASSWORD_SET";
  });
}

export async function deleteAccount(
  userId: string,
  confirmation: string | { currentPassword?: string; emailConfirmation?: string },
) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, passwordHash: true } });
  if (!user) return false;
  const values = typeof confirmation === "string" ? { currentPassword: confirmation } : confirmation;
  const confirmed = user.passwordHash
    ? Boolean(values.currentPassword && await verifyPassword(values.currentPassword, user.passwordHash))
    : values.emailConfirmation?.trim().toLowerCase() === user.email;
  if (!confirmed) return false;

  const [, deleted] = await prisma.$transaction([
    prisma.learnerProfile.deleteMany({ where: { userId } }),
    prisma.user.deleteMany({ where: { id: userId } }),
  ]);
  return deleted.count > 0;
}
