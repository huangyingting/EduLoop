import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";

const DAY_MS = 24 * 60 * 60_000;
export const STALE_REGISTRATION_RETENTION_DAYS = 30;
export const STALE_REGISTRATION_RETENTION_MS = STALE_REGISTRATION_RETENTION_DAYS * DAY_MS;
export const STALE_REGISTRATION_CLEANUP_BATCH_SIZE = 100;
const MAX_STALE_REGISTRATION_CLEANUP_BATCH_SIZE = 1_000;

export type ExpiredSecurityArtifactCleanup = {
  adapterSessions: number;
  authVerificationTokens: number;
  emailVerificationTokens: number;
  emailChangeTokens: number;
  passwordResetTokens: number;
  rateLimitBuckets: number;
  staleUnverifiedRegistrations: number;
};

function validateCleanupInput(now: Date, batchSize: number) {
  if (!Number.isFinite(now.getTime())) throw new RangeError("Cleanup time must be valid.");
  if (
    !Number.isInteger(batchSize)
    || batchSize < 1
    || batchSize > MAX_STALE_REGISTRATION_CLEANUP_BATCH_SIZE
  ) {
    throw new RangeError("Stale-registration cleanup batch size must be between 1 and 1000.");
  }
}

function staleRegistrationWhere(now: Date): Prisma.UserWhereInput {
  return {
    emailVerified: null,
    passwordHash: { not: null },
    role: "LEARNER",
    registrationExpiresAt: { lte: now },
    accounts: { none: {} },
    sessions: { none: { expires: { gt: now } } },
    emailVerificationTokens: { none: { expiresAt: { gt: now } } },
    emailChangeTokens: { none: { expiresAt: { gt: now } } },
    passwordResetTokens: { none: { expiresAt: { gt: now } } },
    reviewActions: { none: {} },
    OR: [
      { learner: { is: null } },
      {
        learner: {
          is: {
            xp: 0,
            level: 1,
            currentStreak: 0,
            bestStreak: 0,
            streakFreezes: 1,
            lastFreezeUsedOn: null,
            lastActiveOn: null,
            knowledgeGradeId: null,
            sessions: { none: {} },
            attempts: { none: {} },
            badges: { none: {} },
            activities: { none: {} },
            savedQuestions: { none: {} },
            reviewItems: { none: {} },
            reports: { none: {} },
          },
        },
      },
    ],
  };
}

async function cleanupStaleRegistrationsInTransaction(
  transaction: Prisma.TransactionClient,
  now: Date,
  batchSize: number,
) {
  const candidates = await transaction.user.findMany({
    where: staleRegistrationWhere(now),
    orderBy: [{ registrationExpiresAt: "asc" }, { id: "asc" }],
    take: batchSize,
    select: { id: true },
  });
  if (!candidates.length) return 0;

  // Re-evaluate every safety predicate in the deleting statement. A provider,
  // live proof, session, or learner record created after candidate selection
  // protects the account instead of being cascaded by stale cleanup.
  const removed = await transaction.user.deleteMany({
    where: {
      ...staleRegistrationWhere(now),
      id: { in: candidates.map(({ id }) => id) },
    },
  });
  return removed.count;
}

export async function deleteExpiredUnusedRegistration(
  email: string,
  now = new Date(),
) {
  validateCleanupInput(now, 1);
  const removed = await prisma.user.deleteMany({
    where: { ...staleRegistrationWhere(now), email },
  });
  return removed.count === 1;
}

export function registrationExpiration(now = new Date()) {
  if (!Number.isFinite(now.getTime())) throw new RangeError("Registration time must be valid.");
  return new Date(now.getTime() + STALE_REGISTRATION_RETENTION_MS);
}

export function proofExpiration(
  now: Date,
  ttlMs: number,
  registrationExpiresAt: Date | null,
) {
  if (!Number.isFinite(now.getTime())) throw new RangeError("Proof time must be valid.");
  if (!Number.isFinite(ttlMs) || ttlMs <= 0) throw new RangeError("Proof lifetime must be positive.");
  const ordinaryExpiration = now.getTime() + ttlMs;
  return new Date(Math.min(ordinaryExpiration, registrationExpiresAt?.getTime() ?? ordinaryExpiration));
}

export async function cleanupExpiredSecurityArtifacts(
  now = new Date(),
  staleRegistrationBatchSize = STALE_REGISTRATION_CLEANUP_BATCH_SIZE,
): Promise<ExpiredSecurityArtifactCleanup> {
  validateCleanupInput(now, staleRegistrationBatchSize);

  return prisma.$transaction(async (transaction) => {
    const adapterSessions = await transaction.session.deleteMany({ where: { expires: { lte: now } } });
    const authVerificationTokens = await transaction.verificationToken.deleteMany({ where: { expires: { lte: now } } });
    const emailVerificationTokens = await transaction.emailVerificationToken.deleteMany({ where: { expiresAt: { lte: now } } });
    const emailChangeTokens = await transaction.emailChangeToken.deleteMany({ where: { expiresAt: { lte: now } } });
    const passwordResetTokens = await transaction.passwordResetToken.deleteMany({ where: { expiresAt: { lte: now } } });
    const rateLimitBuckets = await transaction.rateLimitBucket.deleteMany({ where: { expiresAt: { lte: now } } });
    const staleUnverifiedRegistrations = await cleanupStaleRegistrationsInTransaction(
      transaction,
      now,
      staleRegistrationBatchSize,
    );

    return {
      adapterSessions: adapterSessions.count,
      authVerificationTokens: authVerificationTokens.count,
      emailVerificationTokens: emailVerificationTokens.count,
      emailChangeTokens: emailChangeTokens.count,
      passwordResetTokens: passwordResetTokens.count,
      rateLimitBuckets: rateLimitBuckets.count,
      staleUnverifiedRegistrations,
    };
  });
}
