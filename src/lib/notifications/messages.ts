import type { Locale } from "@/i18n/config";
import { emailCatalog, renderEmail } from "@/i18n/emails";
import { emailConfiguration } from "@/lib/email";

const RESEND_ENDPOINT = "https://api.resend.com/emails";
type Fetcher = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export type ReminderEmail = { subject: string; text: string; html: string };

export function dueReviewDigestEmail(input: { dueCount: number; reviewUrl: string; unsubscribeUrl: string }, locale?: Locale): ReminderEmail {
  const unsubscribe = emailCatalog(locale).unsubscribe;
  return renderEmail("dueReviewDigest", locale, {
    params: { count: input.dueCount },
    url: input.reviewUrl,
    footer: { prompt: unsubscribe.dueReviewDigest, label: unsubscribe.link, url: input.unsubscribeUrl },
  });
}

export function weeklySummaryEmail(input: {
  attempts: number;
  correct: number;
  activeDays: number;
  currentStreak: number;
  progressUrl: string;
  unsubscribeUrl: string;
}, locale?: Locale): ReminderEmail {
  const unsubscribe = emailCatalog(locale).unsubscribe;
  const rate = input.attempts ? Math.round((input.correct / input.attempts) * 100) : 0;
  return renderEmail(input.attempts ? "weeklySummary" : "weeklySummaryEmpty", locale, {
    params: { attempts: input.attempts, rate, activeDays: input.activeDays, streak: input.currentStreak },
    url: input.progressUrl,
    footer: { prompt: unsubscribe.weeklySummary, label: unsubscribe.link, url: input.unsubscribeUrl },
  });
}

// Reminder mail carries RFC 8058 one-click unsubscribe headers so mail clients
// can offer a native unsubscribe button.
export async function sendReminderEmail(
  to: string,
  email: ReminderEmail,
  unsubscribeUrl: string,
  options: { environment?: Record<string, string | undefined>; fetcher?: Fetcher } = {},
) {
  const configuration = emailConfiguration(options.environment);
  if (!configuration) throw new Error("Reminder email is not configured.");
  const response = await (options.fetcher ?? fetch)(RESEND_ENDPOINT, {
    method: "POST",
    headers: { Authorization: `Bearer ${configuration.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: configuration.from,
      to: [to],
      subject: email.subject,
      text: email.text,
      html: email.html,
      headers: { "List-Unsubscribe": `<${unsubscribeUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Reminder email returned ${response.status}.`);
}
