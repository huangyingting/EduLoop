import { describe, expect, it } from "vitest";
import { earnedBadgeSlugs } from "./badges";

describe("badge rules", () => {
  it("awards attempt milestones and a ten-answer correct run", () => {
    expect(earnedBadgeSlugs({ totalAttempts: 0, recentAutoGraded: [] })).toEqual([]);
    expect(earnedBadgeSlugs({ totalAttempts: 1, recentAutoGraded: [true] })).toEqual(["first-spark"]);
    expect(earnedBadgeSlugs({ totalAttempts: 100, recentAutoGraded: Array(10).fill(true) }))
      .toEqual(["first-spark", "century-club", "ten-in-a-row"]);
    expect(earnedBadgeSlugs({ totalAttempts: 12, recentAutoGraded: [...Array(9).fill(true), false] }))
      .toEqual(["first-spark"]);
  });
});
