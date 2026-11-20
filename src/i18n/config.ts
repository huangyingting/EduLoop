export const LOCALES = ["zh-CN", "en"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "zh-CN";
export const LOCALE_COOKIE = "eduloop-locale";
export const LOCALE_LABELS: Record<Locale, string> = { "zh-CN": "中文", en: "English" };

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

// The interface language is an explicit choice stored in a cookie. Simplified
// Chinese stays the default for everyone who has not chosen, so existing
// learners see no change.
export function resolveLocale(cookieValue: string | null | undefined): Locale {
  return isLocale(cookieValue) ? cookieValue : DEFAULT_LOCALE;
}

export function localeFromCookieHeader(header: string | null | undefined): Locale {
  for (const part of (header ?? "").split(";")) {
    const [name, ...value] = part.trim().split("=");
    if (name === LOCALE_COOKIE) return resolveLocale(decodeURIComponent(value.join("=")));
  }
  return DEFAULT_LOCALE;
}

// The interface language of the request that triggered a server action, used
// for the emails it sends.
export function requestLocale(request: Request): Locale {
  return localeFromCookieHeader(request.headers.get("cookie"));
}

// The locale the visitor chose explicitly, or null when they never picked one.
export function chosenRequestLocale(request: Request): Locale | null {
  for (const part of (request.headers.get("cookie") ?? "").split(";")) {
    const [name, ...value] = part.trim().split("=");
    if (name === LOCALE_COOKIE) {
      const decoded = decodeURIComponent(value.join("="));
      return isLocale(decoded) ? decoded : null;
    }
  }
  return null;
}
