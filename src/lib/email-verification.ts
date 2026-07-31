import { createHash, randomBytes } from "node:crypto";
import { sendEmailVerificationEmail } from "@/lib/email";
import { prisma } from "@/lib/prisma";

export const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60_000;

export function hashEmailVerificationToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function issueEmailVerificationToken(email: string, now = new Date()) {
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, emailVerified: true },
  });
  if (!user || user.emailVerified) return null;

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

export async function verifyEmailWithToken(token: string, now = new Date()) {
  const tokenHash = hashEmailVerificationToken(token);
  const record = await prisma.emailVerificationToken.findUnique({
    where: { tokenHash },
    select: { id: true, userId: true, expiresAt: true },
  });
  if (!record || record.expiresAt <= now) return false;

  return prisma.$transaction(async (transaction) => {
    const claimed = await transaction.emailVerificationToken.deleteMany({
      where: { id: record.id, tokenHash, expiresAt: { gt: now } },
    });
    if (!claimed.count) return false;
    await transaction.user.update({
      where: { id: record.userId },
      data: { emailVerified: now },
    });
    await transaction.emailVerificationToken.deleteMany({ where: { userId: record.userId } });
    return true;
  });
}
