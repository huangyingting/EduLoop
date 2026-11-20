import { zhCN } from "@/i18n/messages/zh-CN";
import type { BadgeRule } from "./badges";

// Stored badge names use the default locale; clients localize by slug.
const BADGE_TEXT = zhCN.badges;

export type BadgeDefinitionInput = {
  slug: string;
  name: string;
  description: string;
  icon: string;
  threshold: number;
  rule: BadgeRule;
};

// Adding a badge only requires a new entry here (and a seed run); the rule
// engine in badges.ts evaluates every rule type without route changes.
export const BADGE_CATALOG: BadgeDefinitionInput[] = [
  { slug: "first-spark", ...BADGE_TEXT["first-spark"], icon: "✦", threshold: 1, rule: { type: "TOTAL_ATTEMPTS", threshold: 1 } },
  { slug: "ten-in-a-row", ...BADGE_TEXT["ten-in-a-row"], icon: "⚡", threshold: 10, rule: { type: "CORRECT_RUN", threshold: 10 } },
  { slug: "century-club", ...BADGE_TEXT["century-club"], icon: "◎", threshold: 100, rule: { type: "TOTAL_ATTEMPTS", threshold: 100 } },
  { slug: "three-day-streak", ...BADGE_TEXT["three-day-streak"], icon: "🔥", threshold: 3, rule: { type: "STREAK_DAYS", threshold: 3 } },
  { slug: "week-streak", ...BADGE_TEXT["week-streak"], icon: "🌟", threshold: 7, rule: { type: "STREAK_DAYS", threshold: 7 } },
  { slug: "month-streak", ...BADGE_TEXT["month-streak"], icon: "☀", threshold: 30, rule: { type: "STREAK_DAYS", threshold: 30 } },
  { slug: "topic-explorer", ...BADGE_TEXT["topic-explorer"], icon: "🧭", threshold: 1, rule: { type: "MASTERED_TOPICS", threshold: 1 } },
  { slug: "topic-master", ...BADGE_TEXT["topic-master"], icon: "🏅", threshold: 5, rule: { type: "MASTERED_TOPICS", threshold: 5 } },
];
