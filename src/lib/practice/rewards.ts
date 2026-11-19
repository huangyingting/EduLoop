import { calendarDaysBefore, previousCalendarDay } from "@/lib/dates";
import { DIFFICULTY } from "@/lib/domain-constants";

// Bump when XP, level, or streak rules change so analytics and support can tell
// which rules a learner's totals were earned under.
export const REWARD_RULES_VERSION = 1;
export const XP_PER_LEVEL = 120;
export const MAX_STREAK_FREEZES = 2;
export const STREAK_FREEZE_MILESTONE_DAYS = 7;

const CORRECT_BASE_XP = 6;
const INCORRECT_XP = 2;
const SELF_ASSESSED_XP = 3;
const DIFFICULTY_BONUS: Record<string, number> = {
  [DIFFICULTY.EASY]: 4,
  [DIFFICULTY.MEDIUM]: 7,
  [DIFFICULTY.HARD]: 11,
};
const UNKNOWN_DIFFICULTY_BONUS = 5;

export function levelForXp(xp: number) {
  return Math.floor(Math.max(0, xp) / XP_PER_LEVEL) + 1;
}

// XP rewards an honest attempt. Self-assessed work earns a flat amount so a
// learner gains nothing by claiming a written answer was correct.
export function attemptXp(isCorrect: boolean | null, difficulty: string) {
  if (isCorrect === null) return SELF_ASSESSED_XP;
  if (!isCorrect) return INCORRECT_XP;
  return CORRECT_BASE_XP + (DIFFICULTY_BONUS[difficulty] ?? UNKNOWN_DIFFICULTY_BONUS);
}

export type StreakState = {
  currentStreak: number;
  bestStreak: number;
  streakFreezes: number;
  lastActiveOn: string | null;
  lastFreezeUsedOn: string | null;
};

// One missed day is absorbed by a streak shield; every seventh day earns a
// shield back, up to MAX_STREAK_FREEZES.
export function nextStreakState(learner: StreakState, today: string) {
  const activeToday = learner.lastActiveOn === today;
  const usesFreeze = !activeToday
    && learner.lastActiveOn === calendarDaysBefore(today, 2)
    && learner.streakFreezes > 0;
  const currentStreak = activeToday
    ? learner.currentStreak
    : learner.lastActiveOn === previousCalendarDay(today) || usesFreeze ? learner.currentStreak + 1 : 1;
  const milestoneFreeze = !activeToday && currentStreak > 0 && currentStreak % STREAK_FREEZE_MILESTONE_DAYS === 0 ? 1 : 0;
  return {
    currentStreak,
    bestStreak: Math.max(learner.bestStreak, currentStreak),
    streakFreezes: Math.min(MAX_STREAK_FREEZES, learner.streakFreezes - (usesFreeze ? 1 : 0) + milestoneFreeze),
    lastFreezeUsedOn: usesFreeze ? today : learner.lastFreezeUsedOn,
    lastActiveOn: today,
    usedFreeze: usesFreeze,
  };
}
