"use client";

import { Languages } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { LOCALE_COOKIE, LOCALE_LABELS, LOCALES, isLocale } from "@/i18n/config";
import { useI18n } from "@/i18n/client";
import { apiRequest } from "@/lib/api-client";
import { useAuth } from "@/lib/use-auth";

const ONE_YEAR_SECONDS = 365 * 24 * 60 * 60;

// The choice lives in a cookie so server-rendered pages, API errors, and the
// emails a request sends use it; refreshing re-renders the layout.
export function LocaleSwitcher({ className = "" }: { className?: string }) {
  const { locale, t } = useI18n();
  const auth = useAuth();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function choose(value: string) {
    if (!isLocale(value) || value === locale) return;
    document.cookie = `${LOCALE_COOKIE}=${value}; Path=/; Max-Age=${ONE_YEAR_SECONDS}; SameSite=Lax`;
    document.documentElement.lang = value;
    // Signed-in accounts also remember the choice for emails; the UI does not
    // wait for it, and a failure only leaves emails in the previous language.
    if (auth.status === "authenticated") void apiRequest("/api/auth/locale", { method: "PUT", body: { locale: value } }).catch(() => undefined);
    startTransition(() => router.refresh());
  }

  return <label className={`inline-flex items-center gap-1.5 text-[11px] font-bold text-muted ${className}`}>
    <Languages size={14} aria-hidden />
    <span className="sr-only">{t("common.language")}</span>
    <select value={locale} disabled={pending} onChange={(event) => choose(event.target.value)} className="min-h-8 rounded-lg border border-ink/10 bg-transparent px-1.5 font-bold text-muted hover:text-ink">
      {LOCALES.map((value) => <option key={value} value={value} lang={value}>{LOCALE_LABELS[value]}</option>)}
    </select>
  </label>;
}
