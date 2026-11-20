"use client";

import { Flame, LogIn } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useI18n } from "@/i18n/client";
import { apiRequest } from "@/lib/api-client";
import type { LearnerActivitySummary } from "@/lib/contracts/practice";
import { getTimeZone } from "@/lib/learner";
import { useAuth } from "@/lib/use-auth";

type Day = { date: string; attempts: number };

export function HomeWeeklyProgress() {
  const auth = useAuth();
  const { locale, t } = useI18n();
  const [days, setDays] = useState<Day[]>([]);

  useEffect(() => {
    if (auth.status !== "authenticated") return;
    const timer = window.setTimeout(async () => {
      try {
        const payload = await apiRequest<LearnerActivitySummary>("/api/learner/summary", { query: { timeZone: getTimeZone(), days: 7 } });
        setDays(payload.activity);
      } catch {
        setDays([]);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [auth.status]);

  if (auth.status === "guest") {
    return <div className="rounded-[30px] border-2 border-ink/10 bg-white p-7 shadow-[0_8px_0_#e3dfd4]">
      <p className="text-xs font-black uppercase tracking-[.18em] text-violet">{t("weekly.guestEyebrow")}</p>
      <h2 className="mt-3 font-display text-2xl font-black">{t("weekly.guestTitle")}</h2>
      <p className="mt-2 text-sm font-semibold leading-6 text-muted">{t("weekly.guestBody")}</p>
      <div className="mt-6 flex flex-wrap gap-2">
        <Link href="/register?next=%2Fpractice" className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-violet px-5 text-sm font-black text-white shadow-[0_4px_0_#242136]">{t("common.register")}</Link>
        <Link href="/login?next=%2F" className="inline-flex min-h-11 items-center gap-2 rounded-xl border-2 border-ink/10 px-5 text-sm font-black text-ink"><LogIn size={16} /> {t("weekly.haveAccount")}</Link>
      </div>
    </div>;
  }

  const practicedDays = days.filter((day) => day.attempts > 0).length;
  return <div className="rounded-[30px] border-2 border-ink/10 bg-white p-7 shadow-[0_8px_0_#e3dfd4]">
    <p className="text-xs font-black uppercase tracking-[.18em] text-violet">{t("weekly.lastSevenDays")}</p>
    <div className="mt-6 flex justify-between">{(days.length ? days : Array.from({ length: 7 }, (_, index) => ({ date: `day-${index}`, attempts: 0 }))).map((day) => {
      // Placeholders before data loads show Monday through Sunday (2024-01-01 was a Monday).
      const date = day.date.startsWith("day-") ? new Date(Date.UTC(2024, 0, 1 + Number(day.date.slice(4)), 12)) : new Date(`${day.date}T12:00:00Z`);
      const label = new Intl.DateTimeFormat(locale, { weekday: "narrow", timeZone: "UTC" }).format(date);
      return <div key={day.date} className="text-center"><div className={`grid size-9 place-items-center rounded-full border-2 text-xs font-black ${day.attempts ? "border-ink bg-lime shadow-[2px_2px_0_#242136]" : "border-ink/10 bg-canvas text-muted"}`}>{day.attempts ? "✦" : "·"}</div><p className="mt-2 text-[11px] font-bold text-muted">{label}</p></div>;
    })}</div>
    <div className="mt-7 flex items-center gap-3 rounded-2xl bg-canvas p-4"><span className="grid size-11 place-items-center rounded-xl bg-coral text-white"><Flame /></span><div><p className="text-sm font-black">{practicedDays ? t("weekly.litDays", { count: practicedDays }) : t("weekly.startToday")}</p><p className="text-xs font-semibold text-muted">{practicedDays ? t("weekly.keepComing") : t("weekly.oneQuestion")}</p></div></div>
  </div>;
}
