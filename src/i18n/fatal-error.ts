import { localeFromCookieHeader, type Locale } from "./config";

// The global error boundary replaces the root layout, so it cannot use the
// message provider. It carries its own three strings instead of the catalogs.
const FATAL_ERROR_TEXT: Record<Locale, { title: string; body: string; reload: string }> = {
  "zh-CN": { title: "EduLoop 暂时需要休息一下", body: "请重新加载，我们会保留已完成的学习记录。", reload: "重新加载" },
  en: { title: "EduLoop needs a short break", body: "Reload the page. Your completed learning records are kept.", reload: "Reload" },
};

export function fatalErrorText(cookieHeader: string | null | undefined) {
  const locale = localeFromCookieHeader(cookieHeader);
  return { locale, ...FATAL_ERROR_TEXT[locale] };
}
