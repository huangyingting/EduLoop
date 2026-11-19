import { describe, expect, it } from "vitest";
import { nextReviewState, shouldRescheduleReview } from "./review-scheduler";

const now = new Date("2026-07-27T08:00:00.000Z");

describe("nextReviewState", () => {
  it("makes an incorrect answer immediately due", () => {
    expect(nextReviewState(null, false, now)).toMatchObject({
      status: "ACTIVE", intervalDays: 0, repetitions: 0, consecutiveCorrect: 0, lastResult: false,
    });
  });

  it("spaces successful reviews at 1 and 3 days, then masters with a 30-day check", () => {
    const first = nextReviewState({ repetitions: 0, consecutiveCorrect: 0 }, true, now);
    const second = nextReviewState(first, true, now);
    const third = nextReviewState(second, true, now);

    expect(first.dueAt.toISOString()).toBe("2026-07-28T08:00:00.000Z");
    expect(second.intervalDays).toBe(3);
    expect(third).toMatchObject({ status: "MASTERED", intervalDays: 30, consecutiveCorrect: 3 });
    expect(third.dueAt.toISOString()).toBe("2026-08-26T08:00:00.000Z");
  });

  it("doubles long-term checks for mastered items up to 180 days", () => {
    const check = nextReviewState({ status: "MASTERED", repetitions: 3, consecutiveCorrect: 3, intervalDays: 30 }, true, now);
    expect(check).toMatchObject({ status: "MASTERED", intervalDays: 60 });
    const capped = nextReviewState({ status: "MASTERED", repetitions: 6, consecutiveCorrect: 6, intervalDays: 120 }, true, now);
    expect(capped.intervalDays).toBe(180);
  });

  it("returns a missed mastered item to active review", () => {
    const result = nextReviewState({ status: "MASTERED", repetitions: 3, consecutiveCorrect: 3, intervalDays: 30 }, false, now);
    expect(result).toMatchObject({ status: "ACTIVE", consecutiveCorrect: 0, intervalDays: 0 });
  });

  it("keeps a hint-assisted success in active review without advancing the run", () => {
    const result = nextReviewState({ status: "MASTERED", repetitions: 3, consecutiveCorrect: 3, intervalDays: 30 }, true, now, { assisted: true });
    expect(result).toMatchObject({ status: "ACTIVE", intervalDays: 1, consecutiveCorrect: 3, repetitions: 4 });
  });

  it("resets the successful run after a miss", () => {
    const result = nextReviewState({ repetitions: 2, consecutiveCorrect: 2 }, false, now);
    expect(result).toMatchObject({ repetitions: 2, consecutiveCorrect: 0, status: "ACTIVE" });
  });
});

describe("shouldRescheduleReview", () => {
  const due = new Date("2026-07-26T08:00:00.000Z");
  const future = new Date("2026-08-26T08:00:00.000Z");

  it("always schedules a miss and only reschedules due items after a success", () => {
    expect(shouldRescheduleReview(null, false, now)).toBe(true);
    expect(shouldRescheduleReview(null, true, now)).toBe(false);
    expect(shouldRescheduleReview({ status: "ACTIVE", repetitions: 1, consecutiveCorrect: 1, dueAt: due }, true, now)).toBe(true);
    expect(shouldRescheduleReview({ status: "MASTERED", repetitions: 3, consecutiveCorrect: 3, dueAt: due }, true, now)).toBe(true);
    expect(shouldRescheduleReview({ status: "MASTERED", repetitions: 3, consecutiveCorrect: 3, dueAt: future }, true, now)).toBe(false);
    expect(shouldRescheduleReview({ status: "DISMISSED", repetitions: 1, consecutiveCorrect: 1, dueAt: due }, true, now)).toBe(false);
  });
});
