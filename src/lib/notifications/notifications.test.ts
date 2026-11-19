import { describe, expect, it } from "vitest";
import { dueReviewDigestEmail, weeklySummaryEmail } from "./messages";
import { isSendWindow, localHour, notificationPeriodKey } from "./schedule";
import { issueUnsubscribeToken, verifyUnsubscribeToken } from "./unsubscribe";

const secret = "a-test-secret-that-is-long-enough-for-hmac-signing-0123456789";
// 2026-11-23 is a Monday. 10:30 UTC is 18:30 in Shanghai.
const mondayEvening = new Date("2026-11-23T10:30:00.000Z");

describe("reminder schedule", () => {
  it("uses the learner's local hour and waking-hours window", () => {
    expect(localHour(mondayEvening, "Asia/Shanghai")).toBe(18);
    expect(isSendWindow("DUE_REVIEW_DIGEST", mondayEvening, "Asia/Shanghai", 18)).toBe(true);
    expect(isSendWindow("DUE_REVIEW_DIGEST", mondayEvening, "Asia/Shanghai", 19)).toBe(false);
    // 02:30 in Los Angeles is outside waking hours whatever the preference.
    expect(isSendWindow("DUE_REVIEW_DIGEST", mondayEvening, "America/Los_Angeles", 7)).toBe(false);
  });

  it("sends weekly summaries only on the local Monday and keys periods by local day or week", () => {
    expect(isSendWindow("WEEKLY_SUMMARY", mondayEvening, "Asia/Shanghai", 18)).toBe(true);
    expect(isSendWindow("WEEKLY_SUMMARY", new Date("2026-11-24T10:30:00.000Z"), "Asia/Shanghai", 18)).toBe(false);
    expect(notificationPeriodKey("DUE_REVIEW_DIGEST", mondayEvening, "Asia/Shanghai")).toBe("2026-11-23");
    expect(notificationPeriodKey("WEEKLY_SUMMARY", new Date("2026-11-26T10:30:00.000Z"), "Asia/Shanghai")).toBe("week-2026-11-23");
  });
});

describe("unsubscribe tokens", () => {
  it("are type-scoped, signed, and expiring", () => {
    const token = issueUnsubscribeToken("user-1", "WEEKLY_SUMMARY", 1_000, secret);
    expect(verifyUnsubscribeToken(token, 2_000, secret)).toEqual({ userId: "user-1", type: "WEEKLY_SUMMARY" });
    expect(verifyUnsubscribeToken(`${token}x`, 2_000, secret)).toBeNull();
    expect(verifyUnsubscribeToken(token, 1_000 + 91 * 86_400_000, secret)).toBeNull();
    expect(verifyUnsubscribeToken("garbage", 2_000, secret)).toBeNull();
  });
});

describe("reminder messages", () => {
  it("say what is due and always include an unsubscribe link", () => {
    const digest = dueReviewDigestEmail({ dueCount: 3, reviewUrl: "https://learn.example/review", unsubscribeUrl: "https://learn.example/unsubscribe?token=t" });
    expect(digest.subject).toContain("3 道错题");
    expect(digest.text).toContain("https://learn.example/unsubscribe?token=t");
    const weekly = weeklySummaryEmail({ attempts: 0, correct: 0, activeDays: 0, currentStreak: 0, progressUrl: "https://learn.example/progress", unsubscribeUrl: "https://learn.example/u" });
    expect(weekly.text).toContain("还没有练习记录");
    expect(weekly.html).toContain("https://learn.example/u");
  });
});
