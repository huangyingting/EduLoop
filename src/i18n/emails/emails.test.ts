import { describe, expect, it } from "vitest";
import { dueReviewDigestEmail, weeklySummaryEmail } from "@/lib/notifications/messages";
import { emailCatalog, renderEmail } from ".";
import { enEmails } from "./en";
import { zhCNEmails } from "./zh-CN";

function placeholders(value: unknown): string[] {
  if (typeof value === "string") return [...new Set([...value.matchAll(/\{(\w+)(?:\|[^{}]*)?\}/g)].map(([, name]) => name))].sort();
  if (Array.isArray(value)) return [...new Set(value.flatMap(placeholders))].sort();
  return [];
}

describe("email catalogs", () => {
  it("renders the requested language and falls back to zh-CN", () => {
    expect(renderEmail("passwordReset", "en", { url: "https://learn.example/r" }).subject).toBe("Reset your EduLoop password");
    expect(renderEmail("passwordReset", undefined, { url: "https://learn.example/r" }).subject).toBe("重置你的 EduLoop 密码");
    expect(emailCatalog("en")).toBe(enEmails);
  });

  it("shows the raw URL in text and escapes parameters and links in HTML", () => {
    const email = renderEmail("emailChanged", "en", { params: { newEmail: "<new>@example.com" } });
    expect(email.text).toContain("<new>@example.com");
    expect(email.html).toContain("&lt;new&gt;@example.com");
    const reset = renderEmail("passwordReset", "en", { url: "https://learn.example/reset#token=a&b" });
    expect(reset.text).toContain("https://learn.example/reset#token=a&b");
    expect(reset.html).toContain('href="https://learn.example/reset#token=a&amp;b"');
  });

  it("keeps every template's placeholders in every language", () => {
    for (const [name, template] of Object.entries(zhCNEmails)) {
      const english = enEmails[name as keyof typeof enEmails];
      for (const [field, value] of Object.entries(template)) {
        expect(placeholders((english as Record<string, unknown>)[field]), `${name}.${field}`).toEqual(placeholders(value));
      }
    }
  });

  it("localizes reminders with plural words and the unsubscribe footer", () => {
    const digest = dueReviewDigestEmail({ dueCount: 1, reviewUrl: "https://learn.example/review", unsubscribeUrl: "https://learn.example/u" }, "en");
    expect(digest.subject).toBe("1 mistake is ready for review today");
    expect(digest.html).toContain(">Unsubscribe</a>");
    const weekly = weeklySummaryEmail({ attempts: 4, correct: 3, activeDays: 2, currentStreak: 1, progressUrl: "https://learn.example/p", unsubscribeUrl: "https://learn.example/u" }, "en");
    expect(weekly.text).toContain("4 questions at 75% accuracy, on 2 days. Your current streak is 1 day.");
  });
});
