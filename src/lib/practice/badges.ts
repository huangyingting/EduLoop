export type BadgeProgress = {
  totalAttempts: number;
  // Most recent automatically graded results, newest first.
  recentAutoGraded: boolean[];
};

export const CORRECT_RUN_BADGE_LENGTH = 10;

export function earnedBadgeSlugs(progress: BadgeProgress) {
  const recent = progress.recentAutoGraded.slice(0, CORRECT_RUN_BADGE_LENGTH);
  return [
    progress.totalAttempts >= 1 ? "first-spark" : null,
    progress.totalAttempts >= 100 ? "century-club" : null,
    recent.length === CORRECT_RUN_BADGE_LENGTH && recent.every(Boolean) ? "ten-in-a-row" : null,
  ].filter((slug): slug is string => slug !== null);
}
