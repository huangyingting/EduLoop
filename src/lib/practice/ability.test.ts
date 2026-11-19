import { describe, expect, it } from "vitest";
import { expectedSuccess, nextRating, targetDifficultyWindow } from "./ability";

describe("ability rating", () => {
  it("expects even odds when rating matches difficulty", () => {
    expect(expectedSuccess(2, 2)).toBeCloseTo(0.5);
    expect(expectedSuccess(3, 1)).toBeGreaterThan(0.85);
  });

  it("rises after unexpected success and falls after misses, faster early on", () => {
    expect(nextRating(1, 3, true, 0)).toBeCloseTo(1.3523, 3);
    expect(nextRating(1, 3, true, 50)).toBeCloseTo(1.1762, 3);
    expect(nextRating(1, 0, false, 0)).toBeLessThan(1);
    expect(nextRating(0, 5, false, 0)).toBe(0);
  });

  it("targets slightly harder questions than the current rating", () => {
    expect(targetDifficultyWindow(2)).toEqual({ min: 1.25, max: 3 });
    expect(targetDifficultyWindow(0.2)).toEqual({ min: 0, max: 1.2 });
  });
});
