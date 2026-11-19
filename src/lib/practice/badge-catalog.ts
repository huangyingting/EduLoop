import type { BadgeRule } from "./badges";

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
  { slug: "first-spark", name: "第一束光", description: "完成第一道练习", icon: "✦", threshold: 1, rule: { type: "TOTAL_ATTEMPTS", threshold: 1 } },
  { slug: "ten-in-a-row", name: "连胜新星", description: "连续答对 10 题", icon: "⚡", threshold: 10, rule: { type: "CORRECT_RUN", threshold: 10 } },
  { slug: "century-club", name: "百题探索家", description: "累计完成 100 题", icon: "◎", threshold: 100, rule: { type: "TOTAL_ATTEMPTS", threshold: 100 } },
  { slug: "three-day-streak", name: "三日火花", description: "连续 3 天坚持练习", icon: "🔥", threshold: 3, rule: { type: "STREAK_DAYS", threshold: 3 } },
  { slug: "week-streak", name: "七日星环", description: "连续 7 天坚持练习", icon: "🌟", threshold: 7, rule: { type: "STREAK_DAYS", threshold: 7 } },
  { slug: "month-streak", name: "月度恒星", description: "连续 30 天坚持练习", icon: "☀", threshold: 30, rule: { type: "STREAK_DAYS", threshold: 30 } },
  { slug: "topic-explorer", name: "主题破冰者", description: "掌握第一个知识主题（至少 5 题且正确率 80% 以上）", icon: "🧭", threshold: 1, rule: { type: "MASTERED_TOPICS", threshold: 1 } },
  { slug: "topic-master", name: "主题收藏家", description: "掌握 5 个知识主题", icon: "🏅", threshold: 5, rule: { type: "MASTERED_TOPICS", threshold: 5 } },
];
