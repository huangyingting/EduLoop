const RESEND_ENDPOINT = "https://api.resend.com/emails";

type EmailEnvironment = Record<string, string | undefined>;
type Fetcher = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export function emailConfiguration(environment: EmailEnvironment = process.env) {
  const apiKey = environment.RESEND_API_KEY?.trim();
  const from = environment.AUTH_EMAIL_FROM?.trim();
  return apiKey && from ? { apiKey, from } : null;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;",
  })[character]!);
}

export async function sendPasswordResetEmail(
  to: string,
  resetUrl: string,
  options: { environment?: EmailEnvironment; fetcher?: Fetcher } = {},
) {
  const configuration = emailConfiguration(options.environment);
  if (!configuration) throw new Error("Password recovery email is not configured.");
  const fetcher = options.fetcher ?? fetch;
  const text = `有人请求重置你的 EduLoop 密码。请在 30 分钟内打开以下链接：\n\n${resetUrl}\n\n如果不是你发起的请求，可以忽略这封邮件。`;
  const response = await fetcher(RESEND_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${configuration.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: configuration.from,
      to: [to],
      subject: "重置你的 EduLoop 密码",
      text,
      html: `<p>有人请求重置你的 EduLoop 密码。</p><p><a href="${escapeHtml(resetUrl)}">在 30 分钟内重置密码</a></p><p>如果不是你发起的请求，可以忽略这封邮件。</p>`,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Password recovery email provider returned ${response.status}.`);
}

export async function sendEmailVerificationEmail(
  to: string,
  verificationUrl: string,
  options: { environment?: EmailEnvironment; fetcher?: Fetcher } = {},
) {
  const configuration = emailConfiguration(options.environment);
  if (!configuration) throw new Error("Email verification is not configured.");
  const fetcher = options.fetcher ?? fetch;
  const text = `欢迎加入 EduLoop。请在 24 小时内验证你的邮箱：\n\n${verificationUrl}\n\n如果不是你创建的账号，可以忽略这封邮件。`;
  const response = await fetcher(RESEND_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${configuration.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: configuration.from,
      to: [to],
      subject: "验证你的 EduLoop 邮箱",
      text,
      html: `<p>欢迎加入 EduLoop。</p><p><a href="${escapeHtml(verificationUrl)}">在 24 小时内验证邮箱</a></p><p>如果不是你创建的账号，可以忽略这封邮件。</p>`,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Email verification provider returned ${response.status}.`);
}
