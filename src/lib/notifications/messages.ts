import { emailConfiguration } from "@/lib/email";

const RESEND_ENDPOINT = "https://api.resend.com/emails";
type Fetcher = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export type ReminderEmail = { subject: string; text: string; html: string };

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[character]!);
}

export function dueReviewDigestEmail(input: { dueCount: number; reviewUrl: string; unsubscribeUrl: string }): ReminderEmail {
  const text = `今天有 ${input.dueCount} 道错题到了复习时间。花几分钟回顾一下，让它们真正变成你的知识。\n\n开始复习：${input.reviewUrl}\n\n不想再收到复习提醒？${input.unsubscribeUrl}`;
  return {
    subject: `今天有 ${input.dueCount} 道错题等你复习`,
    text,
    html: `<p>今天有 <strong>${input.dueCount}</strong> 道错题到了复习时间。花几分钟回顾一下，让它们真正变成你的知识。</p><p><a href="${escapeHtml(input.reviewUrl)}">开始复习</a></p><p style="color:#777">不想再收到复习提醒？<a href="${escapeHtml(input.unsubscribeUrl)}">退订</a></p>`,
  };
}

export function weeklySummaryEmail(input: {
  attempts: number;
  correct: number;
  activeDays: number;
  currentStreak: number;
  progressUrl: string;
  unsubscribeUrl: string;
}): ReminderEmail {
  const rate = input.attempts ? Math.round((input.correct / input.attempts) * 100) : 0;
  const summary = input.attempts
    ? `过去一周你练习了 ${input.attempts} 题，正确率 ${rate}%，有 ${input.activeDays} 天坚持练习，当前连续学习 ${input.currentStreak} 天。`
    : "过去一周还没有练习记录。完成 1 题就能点亮今天，重新开始也完全没问题。";
  return {
    subject: "你的 EduLoop 本周学习小结",
    text: `${summary}\n\n查看成长记录：${input.progressUrl}\n\n不想再收到每周小结？${input.unsubscribeUrl}`,
    html: `<p>${escapeHtml(summary)}</p><p><a href="${escapeHtml(input.progressUrl)}">查看成长记录</a></p><p style="color:#777">不想再收到每周小结？<a href="${escapeHtml(input.unsubscribeUrl)}">退订</a></p>`,
  };
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
