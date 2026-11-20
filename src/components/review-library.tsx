"use client";

import { ArrowRight, Bookmark, BookmarkCheck, Brain, CalendarClock, CalendarDays, Clock3, FilterX, LoaderCircle, RotateCcw, Search, Sparkles, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useI18n } from "@/i18n/client";
import type { Translator } from "@/i18n/messages";
import { apiRequest, describeApiError } from "@/lib/api-client";
import type { ReviewPayload, ReviewQuestionCard } from "@/lib/contracts/practice";
import { CustomSelect } from "./custom-select";
import { MathText } from "./math-text";

type QuestionCard = ReviewQuestionCard;
type ReviewCard = ReviewPayload["reviews"][number];
type SavedCard = ReviewPayload["saved"][number];
type ReviewData = ReviewPayload;
type Tab = "review" | "saved";

function practiceHref(item: QuestionCard, review: ReviewCard | null) {
  const params = new URLSearchParams({ questionId: item.id, subject: item.subject.slug });
  if (review?.isDue) params.set("mode", "review");
  return `/practice?${params}`;
}

function cardMatches(item: QuestionCard, query: string, locale: string) {
  const normalized = query.trim().toLocaleLowerCase(locale);
  if (!normalized) return true;
  return [item.stem, item.subject.name, item.grade, ...item.tags.map(({ label }) => label)]
    .some((value) => value.toLocaleLowerCase(locale).includes(normalized));
}

function scheduledLabel(t: Translator, locale: string, review: ReviewCard) {
  if (review.isDue) return t("review.reviewNow");
  return t("review.nextDue", { date: new Intl.DateTimeFormat(locale, { month: "numeric", day: "numeric" }).format(new Date(review.dueAt)) });
}

export function ReviewLibrary() {
  const { locale, t } = useI18n();
  const [data, setData] = useState<ReviewData | null>(null);
  const [tab, setTab] = useState<Tab>("review");
  const [query, setQuery] = useState("");
  const [subject, setSubject] = useState("");
  const [scope, setScope] = useState("all");
  const [sort, setSort] = useState("recommended");
  const [mutating, setMutating] = useState("");
  const [error, setError] = useState("");

  async function load() {
    setError("");
    try {
      setData(await apiRequest<ReviewData>("/api/review", { onUnauthorized: "redirect" }));
    } catch (cause) {
      setError(describeApiError(cause, t("review.loadFailed"), t));
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
    // Loads once; a language change re-renders without refetching.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const subjects = useMemo(() => {
    if (!data) return [];
    return [...new Map([...data.reviews, ...data.saved].map((item) => [item.subject.slug, item.subject])).values()]
      .sort((left, right) => left.name.localeCompare(right.name, locale));
  }, [data, locale]);

  const cards = useMemo(() => {
    if (!data) return [];
    const source: Array<ReviewCard | SavedCard> = tab === "review" ? data.reviews : data.saved;
    const filtered = source.filter((item) => {
      if (subject && item.subject.slug !== subject) return false;
      if (!cardMatches(item, query, locale)) return false;
      if (tab === "review") {
        const review = item as ReviewCard;
        if (scope === "due" && !review.isDue) return false;
        if (scope === "upcoming" && review.isDue) return false;
      } else {
        const saved = item as SavedCard;
        if (scope === "review" && !saved.isInReview) return false;
        if (scope === "standalone" && saved.isInReview) return false;
      }
      return true;
    });
    if (sort === "subject") return filtered.sort((left, right) => left.subject.name.localeCompare(right.subject.name, locale));
    if (tab === "saved" && sort !== "recommended") {
      return filtered.sort((left, right) => {
        const difference = new Date((right as SavedCard).savedAt).getTime() - new Date((left as SavedCard).savedAt).getTime();
        return sort === "oldest" ? -difference : difference;
      });
    }
    return filtered;
  }, [data, locale, query, scope, sort, subject, tab]);

  async function toggleSaved(item: QuestionCard, saved: boolean) {
    const mutationKey = `saved:${item.id}`;
    if (mutating) return;
    setMutating(mutationKey); setError("");
    try {
      await apiRequest("/api/review", { method: "POST", body: { questionId: item.id, saved } });
      setData((current) => {
        if (!current) return current;
        const review = current.reviews.find(({ id }) => id === item.id);
        const alreadySaved = current.saved.some(({ id }) => id === item.id);
        const savedCard: SavedCard = {
          ...item,
          savedAt: new Date().toISOString(),
          isInReview: Boolean(review),
          reviewIsDue: review?.isDue ?? false,
        };
        return {
          ...current,
          savedCount: saved ? current.savedCount + (alreadySaved ? 0 : 1) : Math.max(0, current.savedCount - (alreadySaved ? 1 : 0)),
          reviews: current.reviews.map((entry) => entry.id === item.id ? { ...entry, isSaved: saved } : entry),
          saved: saved
            ? alreadySaved ? current.saved : [savedCard, ...current.saved]
            : current.saved.filter((entry) => entry.id !== item.id),
        };
      });
    } catch (cause) {
      setError(describeApiError(cause, saved ? t("review.saveFailed") : t("review.unsaveFailed"), t));
    } finally {
      setMutating("");
    }
  }

  async function dismissReview(review: ReviewCard) {
    if (mutating || !window.confirm(t("review.confirmDismiss"))) return;
    const mutationKey = `review:${review.id}`;
    setMutating(mutationKey); setError("");
    try {
      await apiRequest("/api/review", { method: "PATCH", body: { questionId: review.id, action: "DISMISS" } });
      setData((current) => current ? {
        ...current,
        dueCount: Math.max(0, current.dueCount - (review.isDue ? 1 : 0)),
        activeCount: Math.max(0, current.activeCount - 1),
        reviews: current.reviews.filter(({ id }) => id !== review.id),
        saved: current.saved.map((entry) => entry.id === review.id ? { ...entry, isInReview: false, reviewIsDue: false } : entry),
      } : current);
    } catch (cause) {
      setError(describeApiError(cause, t("review.dismissFailed"), t));
    } finally {
      setMutating("");
    }
  }

  function selectTab(nextTab: Tab) {
    setTab(nextTab);
    setScope("all");
    setSort("recommended");
  }

  function resetFilters() {
    setQuery(""); setSubject(""); setScope("all"); setSort("recommended");
  }

  function navigateTabs(event: React.KeyboardEvent) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const nextTab = event.key === "ArrowLeft" || event.key === "Home" ? "review" : "saved";
    selectTab(nextTab);
    window.requestAnimationFrame(() => document.getElementById(`${nextTab}-tab`)?.focus());
  }

  if (!data && !error) return <div role="status" aria-live="polite" className="grid min-h-[70vh] place-items-center"><div className="text-center"><LoaderCircle className="mx-auto animate-spin text-violet" size={36} /><p className="mt-3 text-sm font-bold text-muted">{t("review.loading")}</p></div></div>;
  if (!data) return <div role="alert" className="grid min-h-[70vh] place-items-center p-6 text-center"><div><RotateCcw className="mx-auto text-coral" size={40} /><p className="mt-4 font-bold">{error}</p><button onClick={() => void load()} className="mt-4 rounded-xl bg-ink px-5 py-3 text-sm font-black text-white">{t("review.reload")}</button></div></div>;

  const hasFilters = Boolean(query || subject || scope !== "all" || sort !== "recommended");
  const scopeOptions = tab === "review"
    ? [{ value: "all", label: t("review.scopeAllReviews") }, { value: "due", label: t("review.scopeDue") }, { value: "upcoming", label: t("review.scopeUpcoming") }]
    : [{ value: "all", label: t("review.scopeAllSaved") }, { value: "review", label: t("review.scopeInReview") }, { value: "standalone", label: t("review.scopeSavedOnly") }];
  const sortOptions = tab === "review"
    ? [{ value: "recommended", label: t("review.sortReview") }, { value: "subject", label: t("review.sortSubject") }]
    : [{ value: "recommended", label: t("review.sortRecent") }, { value: "oldest", label: t("review.sortOldest") }, { value: "subject", label: t("review.sortSubject") }];

  return <div className="mx-auto max-w-[1160px] px-5 pb-20 pt-7 sm:px-8 lg:px-10 xl:px-14">
    <header className="relative overflow-hidden rounded-[32px] border-2 border-ink bg-[#d9d3f5] p-7 shadow-[0_8px_0_#242136] sm:p-10">
      <div className="dot-grid absolute inset-0 opacity-30" /><div className="relative max-w-2xl"><div className="flex items-center gap-2 text-xs font-black uppercase tracking-[.2em] text-violet"><Brain size={18} /> Review workshop</div><h1 className="mt-3 font-display text-4xl font-black tracking-[-.05em]">{t("review.title")}</h1><p className="mt-3 text-sm font-semibold leading-6 text-ink/65">{t("review.lead")}</p><div className="mt-6 flex flex-wrap gap-3">{data.dueCount ? <Link href="/practice?mode=review" className="inline-flex items-center gap-2 rounded-2xl bg-ink px-5 py-3 text-sm font-black text-white shadow-[0_5px_0_#6c5ce7]"><Sparkles size={17} /> {t("review.reviewDue")} <ArrowRight size={17} /></Link> : <span aria-disabled="true" className="inline-flex items-center gap-2 rounded-2xl bg-ink/30 px-5 py-3 text-sm font-black text-white/70 shadow-[0_5px_0_#6c5ce7]"><Sparkles size={17} /> {t("review.noneDue")}</span>}</div></div>
    </header>

    <section aria-label={t("review.overview")} className="mt-7 grid grid-cols-3 gap-2 sm:gap-4">
      {[{ label: t("review.dueNow"), value: data.dueCount, icon: Clock3, color: "bg-[#fff0ed] text-coral" }, { label: t("review.scheduled"), value: Math.max(0, data.activeCount - data.dueCount), icon: CalendarDays, color: "bg-[#f0edff] text-violet" }, { label: t("review.mySaved"), value: data.savedCount, icon: Bookmark, color: "bg-[#f7fadf] text-[#557000]" }].map(({ label, value, icon: Icon, color }) => <article key={label} className="rounded-2xl border-2 border-ink/10 bg-white p-3 sm:p-4"><span className={`grid size-8 place-items-center rounded-xl ${color}`}><Icon size={16} /></span><p className="mt-3 font-display text-2xl font-black">{value}</p><p className="mt-0.5 text-[11px] font-bold text-muted sm:text-xs">{label}</p></article>)}
    </section>

    <div role="tablist" aria-label={t("review.tabs")} onKeyDown={navigateTabs} className="mt-6 flex gap-2 rounded-2xl border-2 border-ink/10 bg-white p-1.5">
      <button id="review-tab" role="tab" aria-selected={tab === "review"} aria-controls="review-panel" tabIndex={tab === "review" ? 0 : -1} onClick={() => selectTab("review")} className={`flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl px-4 text-sm font-black ${tab === "review" ? "bg-ink text-white" : "text-muted"}`}><CalendarClock size={17} /> {t("review.tabReview")} <span className="rounded-full bg-white/15 px-2 py-0.5">{data.activeCount}</span></button>
      <button id="saved-tab" role="tab" aria-selected={tab === "saved"} aria-controls="review-panel" tabIndex={tab === "saved" ? 0 : -1} onClick={() => selectTab("saved")} className={`flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl px-4 text-sm font-black ${tab === "saved" ? "bg-ink text-white" : "text-muted"}`}><Bookmark size={17} /> {t("review.mySaved")} <span className="rounded-full bg-white/15 px-2 py-0.5">{data.savedCount}</span></button>
    </div>

    <section aria-label={t("review.filters")} className="mt-4 rounded-2xl border-2 border-ink/10 bg-white/75 p-3 sm:p-4">
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr_auto]">
        <label className="relative block"><span className="sr-only">{t("review.search")}</span><Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("review.searchPlaceholder")} className="h-11 w-full rounded-xl border-2 border-ink/10 bg-white pl-10 pr-3 text-sm font-semibold outline-none focus:border-violet" /></label>
        <CustomSelect label={t("review.filterSubject")} value={subject} options={[{ value: "", label: t("review.allSubjects") }, ...subjects.map((item) => ({ value: item.slug, label: item.name }))]} onValueChange={setSubject} className="w-full" />
        <CustomSelect label={t("review.filterScope")} value={scope} options={scopeOptions} onValueChange={setScope} className="w-full" />
        <CustomSelect label={t("review.sort")} value={sort} options={sortOptions} onValueChange={setSort} className="w-full" />
        <button type="button" onClick={resetFilters} disabled={!hasFilters} aria-label={t("review.clearFilters")} className="grid size-11 place-items-center rounded-xl border-2 border-ink/10 bg-white text-muted hover:border-violet/40 hover:text-violet disabled:opacity-30"><FilterX size={18} /></button>
      </div>
      <p className="mt-2 text-xs font-bold text-muted">{t("review.showing", { count: cards.length })}{hasFilters ? t("review.filtered") : ""}</p>
    </section>

    {error ? <p role="alert" className="mt-4 flex items-center justify-between gap-3 rounded-xl border-2 border-coral/25 bg-[#fff0ed] px-4 py-3 text-sm font-bold text-coral"><span>{error}</span><button type="button" onClick={() => setError("")} aria-label={t("review.closeError")}><X size={17} /></button></p> : null}

    <section id="review-panel" role="tabpanel" aria-labelledby={tab === "review" ? "review-tab" : "saved-tab"} className="mt-5 space-y-4">
      {cards.length ? cards.map((item) => {
        const review = "dueAt" in item ? item as ReviewCard : null;
        const saved = "savedAt" in item ? item as SavedCard : null;
        const savingThis = mutating === `saved:${item.id}`;
        const dismissingThis = mutating === `review:${item.id}`;
        return <article key={item.id} className="rounded-[26px] border-2 border-ink/10 bg-white p-5 shadow-[0_5px_0_#e3dfd4] sm:p-6">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full px-3 py-1.5 text-xs font-black text-white" style={{ background: item.subject.color }}>{item.subject.name}</span>
            <span className="rounded-full bg-canvas px-3 py-1.5 text-xs font-bold text-muted">{item.grade}</span>
            {item.tags.map((tag) => <span key={tag.slug} className="rounded-full bg-[#f0edff] px-3 py-1.5 text-xs font-bold text-violet">{tag.label}</span>)}
            <div className="ml-auto flex items-center gap-1">
              {review ? <button type="button" onClick={() => void toggleSaved(item, !review.isSaved)} disabled={Boolean(mutating)} aria-label={review.isSaved ? t("review.unsave") : t("review.save")} title={review.isSaved ? t("review.unsave") : t("review.save")} className={`grid size-10 place-items-center rounded-xl transition ${review.isSaved ? "bg-[#f7fadf] text-[#557000]" : "text-muted hover:bg-[#f7fadf] hover:text-[#557000]"}`}>{savingThis ? <LoaderCircle className="animate-spin" size={17} /> : review.isSaved ? <BookmarkCheck size={18} /> : <Bookmark size={18} />}</button> : null}
              {review ? <button type="button" onClick={() => void dismissReview(review)} disabled={Boolean(mutating)} aria-label={t("review.dismiss")} title={t("review.dismiss")} className="grid size-10 place-items-center rounded-xl text-muted transition hover:bg-[#fff0ed] hover:text-coral">{dismissingThis ? <LoaderCircle className="animate-spin" size={17} /> : <X size={18} />}</button> : <button type="button" onClick={() => void toggleSaved(item, false)} disabled={Boolean(mutating)} aria-label={t("review.unsave")} title={t("review.unsave")} className="grid size-10 place-items-center rounded-xl text-muted hover:bg-[#fff0ed] hover:text-coral">{savingThis ? <LoaderCircle className="animate-spin" size={17} /> : <Trash2 size={17} />}</button>}
            </div>
          </div>
          <div className="mt-4 line-clamp-3 text-[15px] font-bold leading-7"><MathText>{item.stem}</MathText></div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-dashed border-ink/10 pt-4">
            {review ? <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs font-bold text-muted"><span className={review.isDue ? "text-coral" : "text-violet"}>{scheduledLabel(t, locale, review)}</span><span>{t("review.repetitions", { count: review.repetitions })}</span><span>{review.lastResult === false ? t("review.lastWrong") : review.lastResult === true ? t("review.lastRight") : t("review.awaiting")}</span></div> : <div className="flex flex-wrap gap-2 text-xs font-bold text-muted"><span>{t("review.savedOn", { date: new Intl.DateTimeFormat(locale, { year: "numeric", month: "numeric", day: "numeric" }).format(new Date(saved!.savedAt)) })}</span>{saved?.isInReview ? <span className={saved.reviewIsDue ? "text-coral" : "text-violet"}>{saved.reviewIsDue ? t("review.reviewOverdue") : t("review.alsoInReview")}</span> : null}</div>}
            <Link href={practiceHref(item, review)} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-ink px-4 text-sm font-black text-white">{review?.isDue ? t("review.reviewThis") : review ? t("review.practiceEarly") : t("review.practiceThis")} <ArrowRight size={16} /></Link>
          </div>
        </article>;
      }) : hasFilters ? <div className="rounded-[28px] border-2 border-dashed border-ink/15 bg-white/50 p-10 text-center"><FilterX className="mx-auto text-violet" size={38} /><h2 className="mt-4 font-display text-xl font-black">{t("review.noMatchesTitle")}</h2><p className="mt-2 text-sm font-semibold text-muted">{t("review.noMatchesBody")}</p><button type="button" onClick={resetFilters} className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl bg-ink px-5 text-sm font-black text-white"><RotateCcw size={16} /> {t("review.clearFilters")}</button></div> : <div className="rounded-[28px] border-2 border-dashed border-ink/15 bg-white/50 p-10 text-center"><span className="mx-auto grid size-14 place-items-center rounded-2xl bg-lime text-2xl">{tab === "review" ? "✓" : "☆"}</span><h2 className="mt-4 font-display text-xl font-black">{tab === "review" ? t("review.emptyReviewTitle") : t("review.emptySavedTitle")}</h2><p className="mt-2 text-sm font-semibold text-muted">{tab === "review" ? t("review.emptyReviewBody") : t("review.emptySavedBody")}</p><Link href="/practice" className="mt-5 inline-flex items-center gap-2 rounded-xl bg-ink px-5 py-3 text-sm font-black text-white">{t("review.goPractice")} <ArrowRight size={16} /></Link></div>}
    </section>
  </div>;
}
