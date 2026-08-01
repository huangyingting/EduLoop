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
  const text = `请在 24 小时内打开链接，并输入你注册账号或刚设置的密码，以完成 EduLoop 邮箱登录设置：\n\n${verificationUrl}\n\n未验证且从未使用的密码注册会在 30 天后自动删除；重新发送邮件不会延长该期限。如果你没有注册账号或设置登录密码，不要打开链接，也不要向任何人提供密码。`;
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
      html: `<p>请打开链接，并输入你注册账号或刚设置的密码，以完成 EduLoop 邮箱登录设置。</p><p><a href="${escapeHtml(verificationUrl)}">在 24 小时内验证邮箱</a></p><p>未验证且从未使用的密码注册会在 30 天后自动删除；重新发送邮件不会延长该期限。</p><p>如果你没有注册账号或设置登录密码，不要打开链接，也不要向任何人提供密码。</p>`,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Email verification provider returned ${response.status}.`);
}

export async function sendEmailChangeVerificationEmail(
  to: string,
  verificationUrl: string,
  options: { environment?: EmailEnvironment; fetcher?: Fetcher } = {},
) {
  const configuration = emailConfiguration(options.environment);
  if (!configuration) throw new Error("Email change delivery is not configured.");
  const fetcher = options.fetcher ?? fetch;
  const text = `有人请求将这个地址设为 EduLoop 登录邮箱。请在 60 分钟内确认：\n\n${verificationUrl}\n\n如果不是你发起的请求，可以忽略这封邮件，原登录邮箱不会改变。`;
  const response = await fetcher(RESEND_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${configuration.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: configuration.from,
      to: [to],
      subject: "确认更改 EduLoop 登录邮箱",
      text,
      html: `<p>有人请求将这个地址设为 EduLoop 登录邮箱。</p><p><a href="${escapeHtml(verificationUrl)}">在 60 分钟内确认新邮箱</a></p><p>如果不是你发起的请求，可以忽略这封邮件，原登录邮箱不会改变。</p>`,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Email change provider returned ${response.status}.`);
}

export async function sendEmailChangedNotice(
  to: string,
  newEmail: string,
  options: { environment?: EmailEnvironment; fetcher?: Fetcher } = {},
) {
  const configuration = emailConfiguration(options.environment);
  if (!configuration) throw new Error("Email change notification is not configured.");
  const fetcher = options.fetcher ?? fetch;
  const text = `你的 EduLoop 登录邮箱已更改为 ${newEmail}，所有旧登录会话都已退出。\n\n如果不是你操作，请立即联系平台支持。`;
  const response = await fetcher(RESEND_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${configuration.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: configuration.from,
      to: [to],
      subject: "你的 EduLoop 登录邮箱已更改",
      text,
      html: `<p>你的 EduLoop 登录邮箱已更改为 <strong>${escapeHtml(newEmail)}</strong>，所有旧登录会话都已退出。</p><p>如果不是你操作，请立即联系平台支持。</p>`,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Email change notification provider returned ${response.status}.`);
}

export async function sendProviderDisconnectedNotice(
  to: string,
  provider: string,
  options: { environment?: EmailEnvironment; fetcher?: Fetcher } = {},
) {
  const configuration = emailConfiguration(options.environment);
  if (!configuration) throw new Error("Provider disconnect notification is not configured.");
  const fetcher = options.fetcher ?? fetch;
  const text = `你的 EduLoop 账号已移除 ${provider} 登录连接，所有旧登录会话都已退出。\n\n如果不是你操作，请立即重置密码并联系平台支持。`;
  const response = await fetcher(RESEND_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${configuration.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: configuration.from,
      to: [to],
      subject: `你的 EduLoop ${provider} 登录连接已移除`,
      text,
      html: `<p>你的 EduLoop 账号已移除 <strong>${escapeHtml(provider)}</strong> 登录连接，所有旧登录会话都已退出。</p><p>如果不是你操作，请立即重置密码并联系平台支持。</p>`,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Provider disconnect notification returned ${response.status}.`);
}

export async function sendPasswordChangedNotice(
  to: string,
  options: { environment?: EmailEnvironment; fetcher?: Fetcher } = {},
) {
  const configuration = emailConfiguration(options.environment);
  if (!configuration) throw new Error("Password change notification is not configured.");
  const fetcher = options.fetcher ?? fetch;
  const text = "你的 EduLoop 密码已更新，所有旧登录会话和未使用的账号验证链接都已失效。\n\n如果不是你操作，请立即联系平台支持并检查邮箱账号安全。";
  const response = await fetcher(RESEND_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${configuration.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: configuration.from,
      to: [to],
      subject: "你的 EduLoop 密码已更新",
      text,
      html: "<p>你的 EduLoop 密码已更新，所有旧登录会话和未使用的账号验证链接都已失效。</p><p>如果不是你操作，请立即联系平台支持并检查邮箱账号安全。</p>",
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Password change notification returned ${response.status}.`);
}

export async function sendAccountDeletedNotice(
  to: string,
  options: { environment?: EmailEnvironment; fetcher?: Fetcher } = {},
) {
  const configuration = emailConfiguration(options.environment);
  if (!configuration) throw new Error("Account deletion notification is not configured.");
  const fetcher = options.fetcher ?? fetch;
  const text = "你的 EduLoop 账号、登录方式和在线学习数据已永久删除，所有登录会话都已失效。题目反馈中的身份关联和自由文本已清除；不含报告人身份的安全审核状态与操作记录会随题库保留。备份中的删除数据会按隐私说明中的保留周期轮换清除。\n\n如果不是你操作，请立即联系平台支持并检查邮箱账号安全。";
  const response = await fetcher(RESEND_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${configuration.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: configuration.from,
      to: [to],
      subject: "你的 EduLoop 账号已删除",
      text,
      html: "<p>你的 EduLoop 账号、登录方式和在线学习数据已永久删除，所有登录会话都已失效。题目反馈中的身份关联和自由文本已清除；不含报告人身份的安全审核状态与操作记录会随题库保留。备份中的删除数据会按隐私说明中的保留周期轮换清除。</p><p>如果不是你操作，请立即联系平台支持并检查邮箱账号安全。</p>",
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Account deletion notification returned ${response.status}.`);
}

export async function sendLearningDataDeletedNotice(
  to: string,
  options: { environment?: EmailEnvironment; fetcher?: Fetcher } = {},
) {
  const configuration = emailConfiguration(options.environment);
  if (!configuration) throw new Error("Learning data deletion notification is not configured.");
  const fetcher = options.fetcher ?? fetch;
  const text = "你的 EduLoop 在线学习数据已永久删除。题目反馈中的身份关联和自由文本已清除；不含报告人身份的安全审核状态与操作记录会随题库保留。登录账号和登录方式仍然保留；备份中的删除数据会按隐私说明中的保留周期轮换清除。\n\n如果不是你操作，请立即重置密码并联系平台支持。";
  const response = await fetcher(RESEND_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${configuration.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: configuration.from,
      to: [to],
      subject: "你的 EduLoop 学习数据已删除",
      text,
      html: "<p>你的 EduLoop 在线学习数据已永久删除。题目反馈中的身份关联和自由文本已清除；不含报告人身份的安全审核状态与操作记录会随题库保留。登录账号和登录方式仍然保留；备份中的删除数据会按隐私说明中的保留周期轮换清除。</p><p>如果不是你操作，请立即重置密码并联系平台支持。</p>",
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Learning data deletion notification returned ${response.status}.`);
}

export async function sendSessionsRevokedNotice(
  to: string,
  options: { environment?: EmailEnvironment; fetcher?: Fetcher } = {},
) {
  const configuration = emailConfiguration(options.environment);
  if (!configuration) throw new Error("Session revocation notification is not configured.");
  const fetcher = options.fetcher ?? fetch;
  const text = "你的 EduLoop 登录会话已全部退出，未使用的账号安全链接也已失效。密码、登录邮箱和社交登录连接没有改变。\n\n如果不是你操作，请立即重置密码并联系平台支持。";
  const response = await fetcher(RESEND_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${configuration.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: configuration.from,
      to: [to],
      subject: "你的 EduLoop 登录会话已全部退出",
      text,
      html: "<p>你的 EduLoop 登录会话已全部退出，未使用的账号安全链接也已失效。密码、登录邮箱和社交登录连接没有改变。</p><p>如果不是你操作，请立即重置密码并联系平台支持。</p>",
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Session revocation notification returned ${response.status}.`);
}
