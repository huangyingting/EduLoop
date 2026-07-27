import { describe, expect, it } from "vitest";
import { nextReviewState } from "./review";

const now = new Date("2026-07-27T08:00:00.000Z");

describe("nextReviewState", () => {
  it("makes an incorrect answer immediately due", () => {
    expect(nextReviewState(null, false, now)).toMatchObject({
      status: "ACTIVE", intervalDays: 0, repetitions: 0, consecutiveCorrect: 0, lastResult: false,
    });
  });

  it("spaces successful reviews at 1, 3, then 7 days", () => {
    const first = nextReviewState({ repetitions: 0, consecutiveCorrect: 0 }, true, now);
    const second = nextReviewState(first, true, now);
    const third = nextReviewState(second, true, now);

    expect(first.dueAt.toISOString()).toBe("2026-07-28T08:00:00.000Z");
    expect(second.intervalDays).toBe(3);
    expect(third).toMatchObject({ status: "MASTERED", intervalDays: 7, consecutiveCorrect: 3 });
  });

  it("resets the successful run after a miss", () => {
    const result = nextReviewState({ repetitions: 2, consecutiveCorrect: 2 }, false, now);
    expect(result).toMatchObject({ repetitions: 2, consecutiveCorrect: 0, status: "ACTIVE" });
  });
});
