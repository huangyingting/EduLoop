import { hashPassword, verifyPassword } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export type PasswordChangeResult = "INVALID_PASSWORD" | "NOT_FOUND" | "UNCHANGED" | "UPDATED";

export async function changeAccountPassword(userId: string, currentPassword: string, nextPassword: string): Promise<PasswordChangeResult> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { passwordHash: true } });
  if (!user) return "NOT_FOUND";
  if (!await verifyPassword(currentPassword, user.passwordHash)) return "INVALID_PASSWORD";
  if (await verifyPassword(nextPassword, user.passwordHash)) return "UNCHANGED";

  const passwordHash = await hashPassword(nextPassword);
  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { passwordHash } }),
    prisma.authSession.deleteMany({ where: { userId } }),
  ]);
  return "UPDATED";
}

export async function deleteAccount(userId: string, currentPassword: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { passwordHash: true } });
  if (!user || !await verifyPassword(currentPassword, user.passwordHash)) return false;

  const [, deleted] = await prisma.$transaction([
    prisma.learnerProfile.deleteMany({ where: { userId } }),
    prisma.user.deleteMany({ where: { id: userId } }),
  ]);
  return deleted.count > 0;
}
