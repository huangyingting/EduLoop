import { DEFAULT_LOCALE, type Locale } from "../config";
import { formatMessage, type MessageParams } from "../translate";
import { enEmails } from "./en";
import { zhCNEmails, type EmailCatalog } from "./zh-CN";

const EMAIL_CATALOGS: Record<Locale, EmailCatalog> = { "zh-CN": zhCNEmails, en: enEmails };

type TemplateName = Exclude<keyof EmailCatalog, "unsubscribe">;
export type RenderedEmail = { subject: string; text: string; html: string };

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[character]!);
}

function escapedParams(params: MessageParams) {
  return Object.fromEntries(Object.entries(params).map(([key, value]) => [key, typeof value === "number" ? value : escapeHtml(value)]));
}

export function emailCatalog(locale: Locale = DEFAULT_LOCALE) {
  return EMAIL_CATALOGS[locale] ?? EMAIL_CATALOGS[DEFAULT_LOCALE];
}

// Plain text shows the raw URL; HTML links the localized action label. Every
// parameter is HTML-escaped in the HTML part.
export function renderEmail(
  name: TemplateName,
  locale: Locale = DEFAULT_LOCALE,
  options: { params?: MessageParams; url?: string; footer?: { prompt: string; label: string; url: string } } = {},
): RenderedEmail {
  const template = emailCatalog(locale)[name];
  const params = options.params ?? {};
  const htmlParams = escapedParams(params);
  const text = [
    ...template.before.map((line) => formatMessage(line, params)),
    ...(options.url ? [options.url] : []),
    ...template.after.map((line) => formatMessage(line, params)),
    ...(options.footer ? [`${options.footer.prompt} ${options.footer.url}`] : []),
  ].join("\n\n");
  const html = [
    ...template.before.map((line) => `<p>${formatMessage(escapeHtml(line), htmlParams)}</p>`),
    ...(options.url ? [`<p><a href="${escapeHtml(options.url)}">${escapeHtml(template.action)}</a></p>`] : []),
    ...template.after.map((line) => `<p>${formatMessage(escapeHtml(line), htmlParams)}</p>`),
    ...(options.footer ? [`<p style="color:#777">${escapeHtml(options.footer.prompt)} <a href="${escapeHtml(options.footer.url)}">${escapeHtml(options.footer.label)}</a></p>`] : []),
  ].join("");
  return { subject: formatMessage(template.subject, params), text, html };
}
