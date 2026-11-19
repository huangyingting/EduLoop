import { REVIEW_ITEM_STATUS } from "@/lib/domain-constants";

export type ReviewState = {
  repetitions: number;
  consecutiveCorrect: number;
};

const REVIEW_INTERVALS = [1, 3, 7, 14, 30];

export function nextReviewState(existing: ReviewState | null, isCorrect: boolean, now = new Date()) {
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
  const intervalDays = REVIEW_INTERVALS[Math.min(consecutiveCorrect - 1, REVIEW_INTERVALS.length - 1)];
  const dueAt = new Date(now);
  dueAt.setUTCDate(dueAt.getUTCDate() + intervalDays);

  return {
    status: consecutiveCorrect >= 3 ? REVIEW_ITEM_STATUS.MASTERED : REVIEW_ITEM_STATUS.ACTIVE,
    dueAt,
    intervalDays,
    repetitions,
    consecutiveCorrect,
    lastResult: true,
    lastAttemptAt: now,
  };
}
