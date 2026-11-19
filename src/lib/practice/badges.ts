import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export type BadgeProgress = {
  totalAttempts: number;
  // Consecutive automatically graded correct answers since the latest mistake.
  correctRun: number;
};

export const CORRECT_RUN_BADGE_LENGTH = 10;

export function earnedBadgeSlugs(progress: BadgeProgress) {
  return [
    progress.totalAttempts >= 1 ? "first-spark" : null,
    progress.totalAttempts >= 100 ? "century-club" : null,
    progress.correctRun >= CORRECT_RUN_BADGE_LENGTH ? "ten-in-a-row" : null,
  ].filter((slug): slug is string => slug !== null);
}

type BadgeDefinition = { id: string; slug: string; name: string; icon: string };

const BADGE_CACHE_TTL_MS = 5 * 60_000;
let cachedBadges: { loadedAt: number; bySlug: Map<string, BadgeDefinition> } | null = null;

// Badge definitions change only with a catalog seed, so each process keeps a
// short-lived copy instead of querying them on every attempt.
async function badgeDefinitions(now = Date.now()) {
  if (!cachedBadges || now - cachedBadges.loadedAt > BADGE_CACHE_TTL_MS) {
    const badges = await prisma.badge.findMany({ select: { id: true, slug: true, name: true, icon: true } });
    cachedBadges = { loadedAt: now, bySlug: new Map(badges.map((badge) => [badge.slug, badge])) };
  }
  return cachedBadges.bySlug;
}

export function resetBadgeDefinitionCache() {
  cachedBadges = null;
}

export async function awardEarnedBadges(
  transaction: Prisma.TransactionClient,
  learnerId: string,
  progress: BadgeProgress,
) {
  const earned = earnedBadgeSlugs(progress);
  if (!earned.length) return [];
  const definitions = await badgeDefinitions();
  const candidates = earned.flatMap((slug) => definitions.get(slug) ?? []);
  if (!candidates.length) return [];
  const owned = new Set((await transaction.learnerBadge.findMany({
    where: { learnerId, badgeId: { in: candidates.map(({ id }) => id) } },
    select: { badgeId: true },
  })).map(({ badgeId }) => badgeId));
  const awarded: Array<{ name: string; icon: string }> = [];
  for (const badge of candidates.filter(({ id }) => !owned.has(id))) {
    const inserted = await transaction.$executeRaw`
      INSERT INTO "LearnerBadge" ("learnerId", "badgeId", "earnedAt")
      VALUES (${learnerId}, ${badge.id}, ${new Date()})
      ON CONFLICT ("learnerId", "badgeId") DO NOTHING
    `;
    if (inserted) awarded.push({ name: badge.name, icon: badge.icon });
  }
  return awarded;
}
