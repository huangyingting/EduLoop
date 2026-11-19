import { describe, expect, it } from "vitest";
import { BADGE_CATALOG } from "./badge-catalog";
import { isMasteredTopic, parseBadgeRule, ruleSatisfied, type BadgeContext } from "./badges";

function context(overrides: Partial<BadgeContext> = {}): BadgeContext {
  return {
    totalAttempts: 0,
    correctRun: 0,
    currentStreak: 0,
    masteredTopics: async () => 0,
    subjectAttempts: async () => 0,
    ...overrides,
  };
}

describe("badge rules", () => {
  it("parses stored rules and ignores malformed ones", () => {
    expect(parseBadgeRule("{\"type\":\"STREAK_DAYS\",\"threshold\":7}")).toEqual({ type: "STREAK_DAYS", threshold: 7 });
    expect(parseBadgeRule("{\"type\":\"UNKNOWN\",\"threshold\":7}")).toBeNull();
    expect(parseBadgeRule("not json")).toBeNull();
    expect(parseBadgeRule(null)).toBeNull();
  });

  it("evaluates every rule type against the learner context", async () => {
    expect(await ruleSatisfied({ type: "TOTAL_ATTEMPTS", threshold: 100 }, context({ totalAttempts: 100 }))).toBe(true);
    expect(await ruleSatisfied({ type: "CORRECT_RUN", threshold: 10 }, context({ correctRun: 9 }))).toBe(false);
    expect(await ruleSatisfied({ type: "STREAK_DAYS", threshold: 7 }, context({ currentStreak: 7 }))).toBe(true);
    expect(await ruleSatisfied({ type: "MASTERED_TOPICS", threshold: 1 }, context({ masteredTopics: async () => 1 }))).toBe(true);
    expect(await ruleSatisfied(
      { type: "SUBJECT_ATTEMPTS", threshold: 20, subject: "math" },
      context({ subjectAttempts: async (slug) => (slug === "math" ? 20 : 0) }),
    )).toBe(true);
  });

  it("requires enough evidence before a topic counts as mastered", () => {
    expect(isMasteredTopic({ attempts: 4, correct: 4 })).toBe(false);
    expect(isMasteredTopic({ attempts: 5, correct: 4 })).toBe(true);
    expect(isMasteredTopic({ attempts: 10, correct: 7 })).toBe(false);
  });

  it("ships a valid, uniquely named badge catalog", () => {
    expect(new Set(BADGE_CATALOG.map(({ slug }) => slug)).size).toBe(BADGE_CATALOG.length);
    for (const badge of BADGE_CATALOG) expect(parseBadgeRule(JSON.stringify(badge.rule))).toEqual(badge.rule);
  });
});
