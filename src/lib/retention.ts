import { prisma } from "./prisma";

export type ExpiredSecurityArtifactCleanup = {
  adapterSessions: number;
  authVerificationTokens: number;
  emailVerificationTokens: number;
  emailChangeTokens: number;
  passwordResetTokens: number;
  rateLimitBuckets: number;
};

export async function cleanupExpiredSecurityArtifacts(
  now = new Date(),
): Promise<ExpiredSecurityArtifactCleanup> {
  if (!Number.isFinite(now.getTime())) throw new RangeError("Cleanup time must be valid.");

  const [
    adapterSessions,
    authVerificationTokens,
    emailVerificationTokens,
    emailChangeTokens,
    passwordResetTokens,
    rateLimitBuckets,
  ] = await prisma.$transaction([
    prisma.session.deleteMany({ where: { expires: { lte: now } } }),
    prisma.verificationToken.deleteMany({ where: { expires: { lte: now } } }),
    prisma.emailVerificationToken.deleteMany({ where: { expiresAt: { lte: now } } }),
    prisma.emailChangeToken.deleteMany({ where: { expiresAt: { lte: now } } }),
    prisma.passwordResetToken.deleteMany({ where: { expiresAt: { lte: now } } }),
    prisma.rateLimitBucket.deleteMany({ where: { expiresAt: { lte: now } } }),
  ]);

  return {
    adapterSessions: adapterSessions.count,
    authVerificationTokens: authVerificationTokens.count,
    emailVerificationTokens: emailVerificationTokens.count,
    emailChangeTokens: emailChangeTokens.count,
    passwordResetTokens: passwordResetTokens.count,
    rateLimitBuckets: rateLimitBuckets.count,
  };
}
