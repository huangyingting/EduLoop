import { describe, expect, it } from "vitest";
import { attemptXp, levelForXp, nextStreakState } from "./rewards";

const base = { currentStreak: 3, bestStreak: 5, streakFreezes: 1, lastActiveOn: null, lastFreezeUsedOn: null };

describe("practice rewards", () => {
  it("derives levels from XP in one place", () => {
    expect(levelForXp(0)).toBe(1);
    expect(levelForXp(119)).toBe(1);
    expect(levelForXp(120)).toBe(2);
    expect(levelForXp(-5)).toBe(1);
  });

  it("rewards correct, incorrect, and self-assessed attempts", () => {
    expect(attemptXp(true, "EASY")).toBe(10);
    expect(attemptXp(true, "MEDIUM")).toBe(13);
    expect(attemptXp(true, "HARD")).toBe(17);
    expect(attemptXp(true, "UNKNOWN")).toBe(11);
    expect(attemptXp(false, "HARD")).toBe(2);
    expect(attemptXp(null, "HARD")).toBe(3);
    expect(attemptXp(true, "HARD", 1)).toBe(11);
    expect(attemptXp(false, "HARD", 2)).toBe(2);
  });

  it("keeps the streak on a second attempt the same day", () => {
    expect(nextStreakState({ ...base, lastActiveOn: "2026-11-19" }, "2026-11-19"))
      .toMatchObject({ currentStreak: 3, usedFreeze: false, streakFreezes: 1 });
  });

  it("extends a streak from yesterday and restarts after a long gap", () => {
    expect(nextStreakState({ ...base, lastActiveOn: "2026-11-18" }, "2026-11-19")).toMatchObject({ currentStreak: 4 });
    expect(nextStreakState({ ...base, lastActiveOn: "2026-11-10" }, "2026-11-19")).toMatchObject({ currentStreak: 1, bestStreak: 5 });
  });

  it("spends a shield on a single missed day and earns one every seventh day", () => {
    expect(nextStreakState({ ...base, lastActiveOn: "2026-11-17" }, "2026-11-19")).toMatchObject({
      currentStreak: 4, streakFreezes: 0, usedFreeze: true, lastFreezeUsedOn: "2026-11-19",
    });
    expect(nextStreakState({ ...base, currentStreak: 6, streakFreezes: 2, lastActiveOn: "2026-11-18" }, "2026-11-19"))
      .toMatchObject({ currentStreak: 7, streakFreezes: 2, bestStreak: 7 });
  });
});
