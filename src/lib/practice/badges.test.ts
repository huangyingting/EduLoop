import { describe, expect, it } from "vitest";
import { earnedBadgeSlugs } from "./badges";

describe("badge rules", () => {
  it("awards attempt milestones and a ten-answer correct run", () => {
    expect(earnedBadgeSlugs({ totalAttempts: 0, correctRun: 0 })).toEqual([]);
    expect(earnedBadgeSlugs({ totalAttempts: 1, correctRun: 1 })).toEqual(["first-spark"]);
    expect(earnedBadgeSlugs({ totalAttempts: 100, correctRun: 10 }))
      .toEqual(["first-spark", "century-club", "ten-in-a-row"]);
    expect(earnedBadgeSlugs({ totalAttempts: 12, correctRun: 9 })).toEqual(["first-spark"]);
  });
});
