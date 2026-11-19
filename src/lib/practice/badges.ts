import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

export const TOPIC_MASTERY_MINIMUM_ATTEMPTS = 5;
export const TOPIC_MASTERY_ACCURACY = 0.8;

export const badgeRuleSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("TOTAL_ATTEMPTS"), threshold: z.number().int().positive() }),
  z.object({ type: z.literal("CORRECT_RUN"), threshold: z.number().int().positive() }),
  z.object({ type: z.literal("STREAK_DAYS"), threshold: z.number().int().positive() }),
  z.object({ type: z.literal("MASTERED_TOPICS"), threshold: z.number().int().positive() }),
  z.object({ type: z.literal("SUBJECT_ATTEMPTS"), threshold: z.number().int().positive(), subject: z.string().min(1).max(80) }),
]);
export type BadgeRule = z.infer<typeof badgeRuleSchema>;

export function parseBadgeRule(rule: string | null): BadgeRule | null {
  if (!rule) return null;
  try {
    const parsed = badgeRuleSchema.safeParse(JSON.parse(rule));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

// Inputs are resolved lazily so rules that need aggregate queries only cost a
// query when an unearned badge of that type exists.
export type BadgeContext = {
  totalAttempts: number;
  correctRun: number;
  currentStreak: number;
  masteredTopics: () => Promise<number>;
  subjectAttempts: (subjectSlug: string) => Promise<number>;
};

export async function ruleSatisfied(rule: BadgeRule, context: BadgeContext) {
  switch (rule.type) {
    case "TOTAL_ATTEMPTS": return context.totalAttempts >= rule.threshold;
    case "CORRECT_RUN": return context.correctRun >= rule.threshold;
    case "STREAK_DAYS": return context.currentStreak >= rule.threshold;
    case "MASTERED_TOPICS": return await context.masteredTopics() >= rule.threshold;
    case "SUBJECT_ATTEMPTS": return await context.subjectAttempts(rule.subject) >= rule.threshold;
  }
}

export function isMasteredTopic(stat: { attempts: number; correct: number }) {
  return stat.attempts >= TOPIC_MASTERY_MINIMUM_ATTEMPTS && stat.correct / stat.attempts >= TOPIC_MASTERY_ACCURACY;
}

type BadgeDefinition = { id: string; slug: string; name: string; icon: string; rule: BadgeRule };

const BADGE_CACHE_TTL_MS = 5 * 60_000;
let cachedBadges: { loadedAt: number; definitions: BadgeDefinition[] } | null = null;

// Badge definitions change only with a catalog seed, so each process keeps a
// short-lived copy instead of querying them on every attempt.
async function badgeDefinitions(now = Date.now()) {
  if (!cachedBadges || now - cachedBadges.loadedAt > BADGE_CACHE_TTL_MS) {
    const badges = await prisma.badge.findMany({ select: { id: true, slug: true, name: true, icon: true, rule: true } });
    cachedBadges = {
      loadedAt: now,
      definitions: badges.flatMap((badge) => {
        const rule = parseBadgeRule(badge.rule);
        return rule ? [{ ...badge, rule }] : [];
      }),
    };
  }
  return cachedBadges.definitions;
}

export function resetBadgeDefinitionCache() {
  cachedBadges = null;
}

export async function awardEarnedBadges(
  transaction: Prisma.TransactionClient,
  learnerId: string,
  progress: { totalAttempts: number; correctRun: number; currentStreak: number },
) {
  const definitions = await badgeDefinitions();
  if (!definitions.length) return [];
  const owned = new Set((await transaction.learnerBadge.findMany({
    where: { learnerId },
    select: { badgeId: true },
  })).map(({ badgeId }) => badgeId));
  const unearned = definitions.filter(({ id }) => !owned.has(id));
  if (!unearned.length) return [];

  let masteredTopics: Promise<number> | null = null;
  const subjectAttempts = new Map<string, Promise<number>>();
  const context: BadgeContext = {
    ...progress,
    masteredTopics: () => masteredTopics ??= transaction.learnerTopicStat.findMany({
      where: { learnerId, attempts: { gte: TOPIC_MASTERY_MINIMUM_ATTEMPTS } },
      select: { attempts: true, correct: true },
    }).then((stats) => stats.filter(isMasteredTopic).length),
    subjectAttempts: (subjectSlug) => {
      const cached = subjectAttempts.get(subjectSlug);
      if (cached) return cached;
      const lookup = transaction.learnerSubjectStat.findFirst({
        where: { learnerId, subject: { slug: subjectSlug } },
        select: { attempts: true },
      }).then((stat) => stat?.attempts ?? 0);
      subjectAttempts.set(subjectSlug, lookup);
      return lookup;
    },
  };

  const awarded: Array<{ name: string; icon: string }> = [];
  for (const badge of unearned) {
    if (!await ruleSatisfied(badge.rule, context)) continue;
    const inserted = await transaction.$executeRaw`
      INSERT INTO "LearnerBadge" ("learnerId", "badgeId", "earnedAt")
      VALUES (${learnerId}, ${badge.id}, ${new Date()})
      ON CONFLICT ("learnerId", "badgeId") DO NOTHING
    `;
    if (inserted) awarded.push({ name: badge.name, icon: badge.icon });
  }
  return awarded;
}
