"use client";

import { ArrowRight, Award, BarChart3, CalendarDays, CheckCircle2, Flame, LoaderCircle, RotateCcw, Sparkles, Target, Trophy } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useT } from "@/i18n/client";
import { translateOr } from "@/i18n/messages";
import { apiRequest, describeApiError } from "@/lib/api-client";
import type { ProgressPayload } from "@/lib/contracts/practice";
import { getTimeZone } from "@/lib/learner";
import { MathText } from "./math-text";


function heatClass(attempts: number) {
  if (!attempts) return "bg-ink/[.05]";
  if (attempts <= 2) return "bg-violet/25";
  if (attempts <= 5) return "bg-violet/55";
  return "bg-violet";
}

function topicPracticeHref(topic: ProgressPayload["weakTopics"][number]) {
  const params = new URLSearchParams({ mode: "adaptive", subject: topic.subject, tags: topic.slug });
  return `/practice?${params}`;
}

export function ProgressDashboard() {
  const t = useT();
  const [data, setData] = useState<ProgressPayload | null>(null);
  const [error, setError] = useState("");

  async function load() {
    setError("");
    try {
      setData(await apiRequest<ProgressPayload>("/api/learner/progress", {
        query: { timeZone: getTimeZone() },
        onUnauthorized: "redirect",
      }));
    } catch (cause) {
      setError(describeApiError(cause, t("progress.loadFailed"), t));
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
    // Loads once; a language change re-renders without refetching.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!data && !error) return <div role="status" aria-live="polite" className="grid min-h-[70vh] place-items-center"><div className="text-center"><LoaderCircle className="mx-auto animate-spin text-violet" size={36} /><p className="mt-3 text-sm font-bold text-muted">{t("progress.loading")}</p></div></div>;
  if (!data) return <div role="alert" className="grid min-h-[70vh] place-items-center p-6 text-center"><div><RotateCcw className="mx-auto text-coral" size={40} /><p className="mt-4 font-bold">{error}</p><button onClick={() => void load()} className="mt-4 rounded-xl bg-ink px-5 py-3 text-sm font-black text-white">{t("progress.reload")}</button></div></div>;

  const hasPractice = data.summary.totalAttempts > 0;
  const summaryCards = [
    { value: data.summary.totalAttempts, label: t("progress.totalAttempts"), suffix: t("progress.questionsSuffix"), icon: Target, background: "bg-white" },
    { value: data.summary.correctRate, label: t("progress.accuracy"), suffix: "%", icon: CheckCircle2, background: "bg-lime" },
    { value: data.summary.xp, label: t("progress.level", { level: data.summary.level }), suffix: " XP", icon: Sparkles, background: "bg-sky" },
    { value: data.summary.currentStreak, label: t("progress.bestStreak", { count: data.summary.bestStreak }), suffix: t("progress.daysSuffix"), icon: Flame, background: "bg-peach" },
  ];
  return (
    <div className="mx-auto max-w-[1260px] px-5 pb-20 pt-7 sm:px-8 lg:px-10 xl:px-14">
      <header className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div><p className="text-xs font-black uppercase tracking-[.2em] text-violet">Growth constellation</p><h1 className="mt-2 font-display text-4xl font-black tracking-[-.05em]">{t("progress.title")}</h1><p className="mt-2 max-w-xl text-sm font-semibold leading-6 text-muted">{t("progress.lead")}</p></div>
        <Link href="/practice?mode=adaptive" className="inline-flex items-center justify-center gap-2 rounded-2xl bg-ink px-5 py-3.5 text-sm font-black text-white shadow-[0_5px_0_#6c5ce7]">{t("progress.adaptive")} <ArrowRight size={17} /></Link>
      </header>

      <section className="mt-8 grid grid-cols-2 gap-3 xl:grid-cols-4">
        {summaryCards.map(({ value, label, suffix, icon: Icon, background }) => <div key={label} className={`rounded-[24px] border-2 border-ink/10 p-5 ${background}`}><span className="grid size-10 place-items-center rounded-xl bg-ink text-white"><Icon size={19} /></span><p className="mt-4 text-3xl font-black tracking-tight">{value}<span className="ml-1 text-sm">{suffix}</span></p><p className="mt-1 text-xs font-bold text-muted">{label}</p></div>)}
      </section>

      {!hasPractice ? <section className="mt-7 overflow-hidden rounded-[30px] border-2 border-ink bg-[#d9d3f5] p-7 shadow-[0_8px_0_#242136] sm:p-10"><Award className="text-violet" size={42} /><h2 className="mt-4 font-display text-2xl font-black">{t("progress.firstStarTitle")}</h2><p className="mt-2 max-w-xl text-sm font-semibold leading-6 text-ink/65">{t("progress.firstStarBody")}</p><Link href="/practice" className="mt-5 inline-flex items-center gap-2 rounded-xl bg-ink px-5 py-3 text-sm font-black text-white">{t("progress.firstQuestion")} <ArrowRight size={16} /></Link></section> : null}

      <section className="mt-7 grid gap-5 xl:grid-cols-[1.15fr_.85fr]">
        <div className="rounded-[30px] border-2 border-ink/10 bg-white p-6 shadow-[0_7px_0_#e3dfd4] sm:p-8">
          <div className="flex items-center justify-between"><div><p className="text-xs font-black uppercase tracking-[.18em] text-coral">Last 28 days</p><h2 className="mt-1 font-display text-2xl font-black">{t("progress.footprints")}</h2></div><CalendarDays className="text-violet" /></div>
          <div className="mt-6 grid grid-cols-7 gap-2" aria-label={t("progress.activityLabel")}>
            {data.activity.map((day) => <div key={day.date} title={t("progress.dayTitle", { date: day.date, count: day.attempts, xp: day.earnedXp })} className={`aspect-square min-h-8 rounded-lg border border-ink/[.06] ${heatClass(day.attempts)}`}><span className="sr-only">{t("progress.daySr", { date: day.date, count: day.attempts })}</span></div>)}
          </div>
          <div className="mt-4 flex items-center justify-end gap-2 text-[11px] font-bold text-muted"><span>{t("progress.less")}</span>{[0, 1, 3, 6].map((count) => <span key={count} className={`size-3 rounded-sm ${heatClass(count)}`} />)}<span>{t("progress.more")}</span></div>
        </div>

        <div className="rounded-[30px] border-2 border-ink/10 bg-ink p-6 text-white shadow-[0_7px_0_#d9d3f5] sm:p-8">
          <div className="flex items-center justify-between"><div><p className="text-xs font-black uppercase tracking-[.18em] text-lime">Subject signals</p><h2 className="mt-1 font-display text-2xl font-black">{t("progress.subjects")}</h2></div><BarChart3 /></div>
          <div className="mt-6 space-y-5">
            {data.subjects.length ? data.subjects.map((subject) => <div key={subject.slug}><div className="flex items-center justify-between text-sm font-black"><span>{subject.label}</span><span>{t("progress.subjectStats", { accuracy: subject.accuracy, count: subject.attempts })}</span></div><div role="progressbar" aria-label={t("progress.subjectAccuracy", { subject: subject.label })} aria-valuemin={0} aria-valuemax={100} aria-valuenow={subject.accuracy} className="mt-2 h-3 overflow-hidden rounded-full bg-white/15"><div className="h-full rounded-full" style={{ width: `${subject.accuracy}%`, background: subject.color }} /></div></div>) : <p className="text-sm font-semibold leading-6 text-white/60">{t("progress.subjectsEmpty")}</p>}
          </div>
        </div>
      </section>

      <section className="mt-7 grid gap-5 xl:grid-cols-[1.15fr_.85fr]">
        <div className="rounded-[30px] border-2 border-ink/10 bg-white p-6 sm:p-8">
          <div className="flex items-end justify-between"><div><p className="text-xs font-black uppercase tracking-[.18em] text-violet">Learning clues</p><h2 className="mt-1 font-display text-2xl font-black">{t("progress.clues")}</h2></div><Link href="/review" className="text-sm font-black text-violet">{t("progress.viewAll")}</Link></div>
          <div className="mt-5 space-y-3">
            {data.recentMistakes.length ? data.recentMistakes.map((item) => <div key={item.id} className="rounded-2xl border-2 border-ink/[.07] bg-canvas p-4"><div className="flex items-center gap-2"><span className="rounded-full px-2.5 py-1 text-[11px] font-black text-white" style={{ background: item.subjectColor }}>{item.subject}</span><span className="text-xs font-bold text-muted">{item.grade}</span>{item.isDue ? <span className="ml-auto text-xs font-black text-coral">{t("progress.reviewNow")}</span> : null}</div><div className="mt-2 line-clamp-2 text-sm font-semibold leading-6"><MathText>{item.stem}</MathText></div></div>) : <p className="rounded-2xl bg-canvas p-5 text-sm font-semibold text-muted">{t("progress.noMistakes")}</p>}
          </div>
        </div>

        <div className="rounded-[30px] border-2 border-ink/10 bg-white p-6 sm:p-8">
          <p className="text-xs font-black uppercase tracking-[.18em] text-coral">Topic radar</p><h2 className="mt-1 font-display text-2xl font-black">{t("progress.radar")}</h2>
          <div className="mt-5 flex flex-wrap gap-2">
            {data.weakTopics.length ? data.weakTopics.map((topic) => <Link key={`${topic.subject}:${topic.slug}`} href={topicPracticeHref(topic)} className="rounded-2xl border-2 border-ink/10 bg-[#f0edff] px-4 py-3 text-sm font-black transition hover:-translate-y-0.5 hover:border-violet"><span className="block">{topic.label}</span><span className="mt-1 block text-[11px] text-muted">{t("progress.topicStats", { accuracy: topic.accuracy, count: topic.attempts })}</span></Link>) : <p className="text-sm font-semibold leading-6 text-muted">{t("progress.radarEmpty")}</p>}
          </div>
        </div>
      </section>

      <section className="mt-7 rounded-[30px] border-2 border-ink/10 bg-white p-6 sm:p-8">
        <div className="flex items-center gap-3"><span className="grid size-11 place-items-center rounded-2xl bg-lime"><Trophy size={21} /></span><div><p className="text-xs font-black uppercase tracking-[.18em] text-violet">Badge shelf</p><h2 className="font-display text-2xl font-black">{t("progress.badgeShelf")}</h2></div></div>
        <div className="mt-6 grid gap-3 sm:grid-cols-3">{data.badges.map((badge) => <div key={badge.slug} className={`rounded-[22px] border-2 p-5 ${badge.earnedAt ? "border-ink bg-lime shadow-[0_4px_0_#242136]" : "border-ink/[.07] bg-canvas opacity-60"}`}><span className="text-3xl">{badge.icon}</span><p className="mt-3 font-black">{translateOr(t, `badges.${badge.slug}.name`, badge.name)}</p><p className="mt-1 text-xs font-semibold leading-5 text-muted">{translateOr(t, `badges.${badge.slug}.description`, badge.description)}</p><p className="mt-3 text-[11px] font-black">{badge.earnedAt ? t("progress.unlocked") : t("progress.locked")}</p></div>)}</div>
      </section>
    </div>
  );
}
