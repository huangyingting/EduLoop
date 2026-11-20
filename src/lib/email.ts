import type { Locale } from "@/i18n/config";
import { renderEmail, type RenderedEmail } from "@/i18n/emails";

const RESEND_ENDPOINT = "https://api.resend.com/emails";

type EmailEnvironment = Record<string, string | undefined>;
type Fetcher = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
export type EmailOptions = { environment?: EmailEnvironment; fetcher?: Fetcher; locale?: Locale };

class EmailProviderResponseError extends Error {
  readonly status: number;

  constructor(status: number) {
    super("The email provider rejected the delivery probe.");
    this.name = "EmailProviderResponseError";
    this.status = status;
  }
}

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

export async function sendEmailDeliveryProbe(
  to: string,
  probeId: string,
  options: { environment?: EmailEnvironment; fetcher?: Fetcher } = {},
) {
  if (!/^[a-f0-9]{16}$/.test(probeId)) throw new Error("Email delivery probe ID is invalid.");
  const configuration = emailConfiguration(options.environment);
  if (!configuration) throw new Error("Email delivery probe is not configured.");
  const fetcher = options.fetcher ?? fetch;
  const subject = `EduLoop email delivery probe ${probeId}`;
  const text = `This is an EduLoop production email delivery probe. No account action is required.\n\nProbe ID: ${probeId}\n\nConfirm receipt and the matching delivered event in the email provider before approving launch readiness.`;
  const response = await fetcher(RESEND_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${configuration.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: configuration.from,
      to: [to],
      subject,
      text,
      html: `<p>This is an EduLoop production email delivery probe. No account action is required.</p><p><strong>Probe ID:</strong> ${escapeHtml(probeId)}</p><p>Confirm receipt and the matching delivered event in the email provider before approving launch readiness.</p>`,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new EmailProviderResponseError(response.status);
}

async function sendAccountEmail(
  to: string,
  email: RenderedEmail,
  messages: { unconfigured: string; rejected: string },
  options: EmailOptions,
) {
  const configuration = emailConfiguration(options.environment);
  if (!configuration) throw new Error(messages.unconfigured);
  const response = await (options.fetcher ?? fetch)(RESEND_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${configuration.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: configuration.from, to: [to], subject: email.subject, text: email.text, html: email.html }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`${messages.rejected} ${response.status}.`);
}

export async function sendPasswordResetEmail(to: string, resetUrl: string, options: EmailOptions = {}) {
  await sendAccountEmail(to, renderEmail("passwordReset", options.locale, { url: resetUrl }), {
    unconfigured: "Password recovery email is not configured.",
    rejected: "Password recovery email provider returned",
  }, options);
}

export async function sendEmailVerificationEmail(to: string, verificationUrl: string, options: EmailOptions = {}) {
  await sendAccountEmail(to, renderEmail("emailVerification", options.locale, { url: verificationUrl }), {
    unconfigured: "Email verification is not configured.",
    rejected: "Email verification provider returned",
  }, options);
}

export async function sendEmailChangeVerificationEmail(to: string, verificationUrl: string, options: EmailOptions = {}) {
  await sendAccountEmail(to, renderEmail("emailChangeVerification", options.locale, { url: verificationUrl }), {
    unconfigured: "Email change delivery is not configured.",
    rejected: "Email change provider returned",
  }, options);
}

export async function sendEmailChangedNotice(to: string, newEmail: string, options: EmailOptions = {}) {
  await sendAccountEmail(to, renderEmail("emailChanged", options.locale, { params: { newEmail } }), {
    unconfigured: "Email change notification is not configured.",
    rejected: "Email change notification provider returned",
  }, options);
}

export async function sendProviderDisconnectedNotice(to: string, provider: string, options: EmailOptions = {}) {
  await sendAccountEmail(to, renderEmail("providerDisconnected", options.locale, { params: { provider } }), {
    unconfigured: "Provider disconnect notification is not configured.",
    rejected: "Provider disconnect notification returned",
  }, options);
}

export async function sendPasswordChangedNotice(to: string, options: EmailOptions = {}) {
  await sendAccountEmail(to, renderEmail("passwordChanged", options.locale), {
    unconfigured: "Password change notification is not configured.",
    rejected: "Password change notification returned",
  }, options);
}

export async function sendAccountDeletedNotice(to: string, options: EmailOptions = {}) {
  await sendAccountEmail(to, renderEmail("accountDeleted", options.locale), {
    unconfigured: "Account deletion notification is not configured.",
    rejected: "Account deletion notification returned",
  }, options);
}

export async function sendLearningDataDeletedNotice(to: string, options: EmailOptions = {}) {
  await sendAccountEmail(to, renderEmail("learningDataDeleted", options.locale), {
    unconfigured: "Learning data deletion notification is not configured.",
    rejected: "Learning data deletion notification returned",
  }, options);
}

export async function sendSessionsRevokedNotice(to: string, options: EmailOptions = {}) {
  await sendAccountEmail(to, renderEmail("sessionsRevoked", options.locale), {
    unconfigured: "Session revocation notification is not configured.",
    rejected: "Session revocation notification returned",
  }, options);
}
