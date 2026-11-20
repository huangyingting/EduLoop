import { REVIEW_ITEM_STATUS } from "@/lib/domain-constants";

export type ReviewState = {
  status?: string;
  repetitions: number;
  consecutiveCorrect: number;
  intervalDays?: number;
  dueAt?: Date;
};

// Learning reviews come back after 1, 3, and 7 days; the third consecutive
// success masters the item. Mastered items still get long-term checks that
// start at 30 days and double up to 180, and any miss returns them to review.
export const LEARNING_INTERVALS = [1, 3, 7];
export const MASTERY_STREAK = LEARNING_INTERVALS.length;
export const LONG_TERM_FIRST_INTERVAL = 30;
export const LONG_TERM_MAX_INTERVAL = 180;

function addDays(now: Date, days: number) {
  const dueAt = new Date(now);
  dueAt.setUTCDate(dueAt.getUTCDate() + days);
  return dueAt;
}

export function nextReviewState(
  existing: ReviewState | null,
  isCorrect: boolean,
  now = new Date(),
  options: { assisted?: boolean } = {},
) {
  // A success that needed hints is a weaker signal: the item stays in active
  // review, keeps its current run, and comes back tomorrow.
  if (isCorrect && options.assisted) {
    return {
      status: REVIEW_ITEM_STATUS.ACTIVE,
      dueAt: addDays(now, LEARNING_INTERVALS[0]),
      intervalDays: LEARNING_INTERVALS[0],
      repetitions: (existing?.repetitions ?? 0) + 1,
      consecutiveCorrect: existing?.consecutiveCorrect ?? 0,
      lastResult: true,
      lastAttemptAt: now,
    };
  }
  if (!isCorrect) {
    return {
      status: REVIEW_ITEM_STATUS.ACTIVE,
      dueAt: now,
      intervalDays: 0,
      repetitions: existing?.repetitions ?? 0,
      consecutiveCorrect: 0,
      lastResult: false,
      lastAttemptAt: now,
    };
  }

  const repetitions = (existing?.repetitions ?? 0) + 1;
  const consecutiveCorrect = (existing?.consecutiveCorrect ?? 0) + 1;
  const wasMastered = existing?.status === REVIEW_ITEM_STATUS.MASTERED;
  const mastered = wasMastered || consecutiveCorrect >= MASTERY_STREAK;
  const intervalDays = wasMastered
    ? Math.min(LONG_TERM_MAX_INTERVAL, Math.max(LONG_TERM_FIRST_INTERVAL, (existing?.intervalDays ?? 0) * 2))
    : mastered
      ? LONG_TERM_FIRST_INTERVAL
      : LEARNING_INTERVALS[consecutiveCorrect - 1];

  return {
    status: mastered ? REVIEW_ITEM_STATUS.MASTERED : REVIEW_ITEM_STATUS.ACTIVE,
    dueAt: addDays(now, intervalDays),
    intervalDays,
    repetitions,
    consecutiveCorrect,
    lastResult: true,
    lastAttemptAt: now,
  };
}

// A wrong answer always (re)enters review. A correct answer reschedules only
// an item that is actually due, so practicing a question early does not skip
// the spacing.
export function shouldRescheduleReview(existing: ReviewState | null, isCorrect: boolean, now: Date) {
  if (!isCorrect) return true;
  if (!existing?.dueAt || existing.dueAt > now) return false;
  return existing.status === REVIEW_ITEM_STATUS.ACTIVE || existing.status === REVIEW_ITEM_STATUS.MASTERED;
}
