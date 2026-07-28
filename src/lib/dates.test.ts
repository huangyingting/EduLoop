import { describe, expect, it } from "vitest";
import { calendarDay, calendarDaysBefore, normalizeTimeZone, previousCalendarDay, visibleStreak } from "./dates";

describe("learner calendar days", () => {
  it("uses the learner timezone around local midnight", () => {
    const instant = new Date("2026-07-26T16:30:00.000Z");
    expect(calendarDay(instant, "Asia/Shanghai")).toBe("2026-07-27");
    expect(calendarDay(instant, "America/New_York")).toBe("2026-07-26");
  });

  it("falls back to the intended locale for invalid zones", () => {
    expect(normalizeTimeZone("not/a-zone")).toBe("Asia/Shanghai");
  });

  it("walks across month boundaries", () => {
    expect(previousCalendarDay("2026-03-01")).toBe("2026-02-28");
    expect(calendarDaysBefore("2026-03-01", 2)).toBe("2026-02-27");
  });

  it("normalizes invalid day offsets", () => {
    expect(calendarDaysBefore("2026-07-27", -2)).toBe("2026-07-27");
    expect(calendarDaysBefore("2026-07-27", 1.9)).toBe("2026-07-26");
  });

  it("projects the same visible streak through a one-day shield gap", () => {
    const learner = { currentStreak: 5, lastActiveOn: "2026-07-25", streakFreezes: 1 };
    expect(visibleStreak(learner, "2026-07-27")).toBe(5);
    expect(visibleStreak({ ...learner, streakFreezes: 0 }, "2026-07-27")).toBe(0);
    expect(visibleStreak(learner, "2026-07-28")).toBe(0);
  });
});
