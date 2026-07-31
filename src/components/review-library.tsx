"use client";

import { ArrowRight, Bookmark, BookmarkCheck, Brain, CalendarClock, CalendarDays, Clock3, FilterX, LoaderCircle, RotateCcw, Search, Sparkles, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CustomSelect } from "./custom-select";
import { MathText } from "./math-text";

type QuestionCard = {
  id: string;
  stem: string;
  type: string;
  difficulty: string;
  subject: { slug: string; name: string; color: string };
  grade: string;
  tags: Array<{ slug: string; label: string }>;
};
type ReviewCard = QuestionCard & {
  dueAt: string;
  isDue: boolean;
  intervalDays: number;
  repetitions: number;
  lastResult: boolean | null;
  isSaved: boolean;
};
type SavedCard = QuestionCard & {
  savedAt: string;
  isInReview: boolean;
  reviewIsDue: boolean;
};
type ReviewData = {
  dueCount: number;
  activeCount: number;
  savedCount: number;
  reviews: ReviewCard[];
  saved: SavedCard[];
};
type Tab = "review" | "saved";

function practiceHref(item: QuestionCard, review: ReviewCard | null) {
  const params = new URLSearchParams({ questionId: item.id, subject: item.subject.slug });
  if (review?.isDue) params.set("mode", "review");
  return `/practice?${params}`;
}

function cardMatches(item: QuestionCard, query: string) {
  const normalized = query.trim().toLocaleLowerCase("zh-CN");
  if (!normalized) return true;
  return [item.stem, item.subject.name, item.grade, ...item.tags.map(({ label }) => label)]
    .some((value) => value.toLocaleLowerCase("zh-CN").includes(normalized));
}

function scheduledLabel(review: ReviewCard) {
  if (review.isDue) return "现在可复习";
  return `下次：${new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric" }).format(new Date(review.dueAt))}`;
}

export function ReviewLibrary() {
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
      const response = await fetch("/api/review", { cache: "no-store" });
      if (!response.ok) throw new Error("复习清单加载失败，请稍后再试。");
      setData(await response.json() as ReviewData);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "加载失败");
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, []);

  const subjects = useMemo(() => {
    if (!data) return [];
    return [...new Map([...data.reviews, ...data.saved].map((item) => [item.subject.slug, item.subject])).values()]
      .sort((left, right) => left.name.localeCompare(right.name, "zh-CN"));
  }, [data]);

  const cards = useMemo(() => {
    if (!data) return [];
    const source: Array<ReviewCard | SavedCard> = tab === "review" ? data.reviews : data.saved;
    const filtered = source.filter((item) => {
      if (subject && item.subject.slug !== subject) return false;
      if (!cardMatches(item, query)) return false;
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
    if (sort === "subject") return filtered.sort((left, right) => left.subject.name.localeCompare(right.subject.name, "zh-CN"));
    if (tab === "saved" && sort !== "recommended") {
      return filtered.sort((left, right) => {
        const difference = new Date((right as SavedCard).savedAt).getTime() - new Date((left as SavedCard).savedAt).getTime();
        return sort === "oldest" ? -difference : difference;
      });
    }
    return filtered;
  }, [data, query, scope, sort, subject, tab]);

  async function toggleSaved(item: QuestionCard, saved: boolean) {
    const mutationKey = `saved:${item.id}`;
    if (mutating) return;
    setMutating(mutationKey); setError("");
    try {
      const response = await fetch("/api/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionId: item.id, saved }),
      });
      if (!response.ok) throw new Error(saved ? "收藏失败，请稍后再试。" : "取消收藏失败，请稍后再试。");
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
      setError(cause instanceof Error ? cause.message : "收藏操作失败，请稍后再试。");
    } finally {
      setMutating("");
    }
  }

  async function dismissReview(review: ReviewCard) {
    if (mutating || !window.confirm("将这道题移出当前复习清单吗？以后再次答错时，它仍会自动回来。")) return;
    const mutationKey = `review:${review.id}`;
    setMutating(mutationKey); setError("");
    try {
      const response = await fetch("/api/review", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionId: review.id, action: "DISMISS" }),
      });
      if (!response.ok) throw new Error("移出复习清单失败，请稍后再试。");
      setData((current) => current ? {
        ...current,
        dueCount: Math.max(0, current.dueCount - (review.isDue ? 1 : 0)),
        activeCount: Math.max(0, current.activeCount - 1),
        reviews: current.reviews.filter(({ id }) => id !== review.id),
        saved: current.saved.map((entry) => entry.id === review.id ? { ...entry, isInReview: false, reviewIsDue: false } : entry),
      } : current);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "移出复习清单失败，请稍后再试。");
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

  if (!data && !error) return <div role="status" aria-live="polite" className="grid min-h-[70vh] place-items-center"><div className="text-center"><LoaderCircle className="mx-auto animate-spin text-violet" size={36} /><p className="mt-3 text-sm font-bold text-muted">正在整理学习线索…</p></div></div>;
  if (!data) return <div role="alert" className="grid min-h-[70vh] place-items-center p-6 text-center"><div><RotateCcw className="mx-auto text-coral" size={40} /><p className="mt-4 font-bold">{error}</p><button onClick={() => void load()} className="mt-4 rounded-xl bg-ink px-5 py-3 text-sm font-black text-white">重新加载</button></div></div>;

  const hasFilters = Boolean(query || subject || scope !== "all" || sort !== "recommended");
  const scopeOptions = tab === "review"
    ? [{ value: "all", label: "全部复习题" }, { value: "due", label: "现在到期" }, { value: "upcoming", label: "稍后复习" }]
    : [{ value: "all", label: "全部收藏" }, { value: "review", label: "也在错题清单" }, { value: "standalone", label: "仅收藏" }];
  const sortOptions = tab === "review"
    ? [{ value: "recommended", label: "按复习顺序" }, { value: "subject", label: "按学科" }]
    : [{ value: "recommended", label: "最近收藏" }, { value: "oldest", label: "最早收藏" }, { value: "subject", label: "按学科" }];

  return <div className="mx-auto max-w-[1160px] px-5 pb-20 pt-7 sm:px-8 lg:px-10 xl:px-14">
    <header className="relative overflow-hidden rounded-[32px] border-2 border-ink bg-[#d9d3f5] p-7 shadow-[0_8px_0_#242136] sm:p-10">
      <div className="dot-grid absolute inset-0 opacity-30" /><div className="relative max-w-2xl"><div className="flex items-center gap-2 text-xs font-black uppercase tracking-[.2em] text-violet"><Brain size={18} /> Review workshop</div><h1 className="mt-3 font-display text-4xl font-black tracking-[-.05em]">把错题变成新线索</h1><p className="mt-3 text-sm font-semibold leading-6 text-ink/65">答错的题会按节奏回来。连续掌握三次后自动毕业；你也可以整理收藏或移出暂时不想复习的题。</p><div className="mt-6 flex flex-wrap gap-3">{data.dueCount ? <Link href="/practice?mode=review" className="inline-flex items-center gap-2 rounded-2xl bg-ink px-5 py-3 text-sm font-black text-white shadow-[0_5px_0_#6c5ce7]"><Sparkles size={17} /> 复习到期题目 <ArrowRight size={17} /></Link> : <span aria-disabled="true" className="inline-flex items-center gap-2 rounded-2xl bg-ink/30 px-5 py-3 text-sm font-black text-white/70 shadow-[0_5px_0_#6c5ce7]"><Sparkles size={17} /> 暂无到期题目</span>}</div></div>
    </header>

    <section aria-label="复习概览" className="mt-7 grid grid-cols-3 gap-2 sm:gap-4">
      {[{ label: "现在到期", value: data.dueCount, icon: Clock3, color: "bg-[#fff0ed] text-coral" }, { label: "后续安排", value: Math.max(0, data.activeCount - data.dueCount), icon: CalendarDays, color: "bg-[#f0edff] text-violet" }, { label: "我的收藏", value: data.savedCount, icon: Bookmark, color: "bg-[#f7fadf] text-[#557000]" }].map(({ label, value, icon: Icon, color }) => <article key={label} className="rounded-2xl border-2 border-ink/10 bg-white p-3 sm:p-4"><span className={`grid size-8 place-items-center rounded-xl ${color}`}><Icon size={16} /></span><p className="mt-3 font-display text-2xl font-black">{value}</p><p className="mt-0.5 text-[11px] font-bold text-muted sm:text-xs">{label}</p></article>)}
    </section>

    <div role="tablist" aria-label="复习内容" onKeyDown={navigateTabs} className="mt-6 flex gap-2 rounded-2xl border-2 border-ink/10 bg-white p-1.5">
      <button id="review-tab" role="tab" aria-selected={tab === "review"} aria-controls="review-panel" tabIndex={tab === "review" ? 0 : -1} onClick={() => selectTab("review")} className={`flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl px-4 text-sm font-black ${tab === "review" ? "bg-ink text-white" : "text-muted"}`}><CalendarClock size={17} /> 错题复习 <span className="rounded-full bg-white/15 px-2 py-0.5">{data.activeCount}</span></button>
      <button id="saved-tab" role="tab" aria-selected={tab === "saved"} aria-controls="review-panel" tabIndex={tab === "saved" ? 0 : -1} onClick={() => selectTab("saved")} className={`flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl px-4 text-sm font-black ${tab === "saved" ? "bg-ink text-white" : "text-muted"}`}><Bookmark size={17} /> 我的收藏 <span className="rounded-full bg-white/15 px-2 py-0.5">{data.savedCount}</span></button>
    </div>

    <section aria-label="筛选题目" className="mt-4 rounded-2xl border-2 border-ink/10 bg-white/75 p-3 sm:p-4">
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr_auto]">
        <label className="relative block"><span className="sr-only">搜索题目</span><Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索题目、知识点…" className="h-11 w-full rounded-xl border-2 border-ink/10 bg-white pl-10 pr-3 text-sm font-semibold outline-none focus:border-violet" /></label>
        <CustomSelect label="筛选学科" value={subject} options={[{ value: "", label: "全部学科" }, ...subjects.map((item) => ({ value: item.slug, label: item.name }))]} onValueChange={setSubject} className="w-full" />
        <CustomSelect label="筛选状态" value={scope} options={scopeOptions} onValueChange={setScope} className="w-full" />
        <CustomSelect label="排序方式" value={sort} options={sortOptions} onValueChange={setSort} className="w-full" />
        <button type="button" onClick={resetFilters} disabled={!hasFilters} aria-label="清除筛选" className="grid size-11 place-items-center rounded-xl border-2 border-ink/10 bg-white text-muted hover:border-violet/40 hover:text-violet disabled:opacity-30"><FilterX size={18} /></button>
      </div>
      <p className="mt-2 text-xs font-bold text-muted">显示 {cards.length} 题{hasFilters ? " · 已应用筛选" : ""}</p>
    </section>

    {error ? <p role="alert" className="mt-4 flex items-center justify-between gap-3 rounded-xl border-2 border-coral/25 bg-[#fff0ed] px-4 py-3 text-sm font-bold text-coral"><span>{error}</span><button type="button" onClick={() => setError("")} aria-label="关闭错误提示"><X size={17} /></button></p> : null}

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
              {review ? <button type="button" onClick={() => void toggleSaved(item, !review.isSaved)} disabled={Boolean(mutating)} aria-label={review.isSaved ? "取消收藏" : "收藏题目"} title={review.isSaved ? "取消收藏" : "收藏题目"} className={`grid size-10 place-items-center rounded-xl transition ${review.isSaved ? "bg-[#f7fadf] text-[#557000]" : "text-muted hover:bg-[#f7fadf] hover:text-[#557000]"}`}>{savingThis ? <LoaderCircle className="animate-spin" size={17} /> : review.isSaved ? <BookmarkCheck size={18} /> : <Bookmark size={18} />}</button> : null}
              {review ? <button type="button" onClick={() => void dismissReview(review)} disabled={Boolean(mutating)} aria-label="移出复习清单" title="移出复习清单" className="grid size-10 place-items-center rounded-xl text-muted transition hover:bg-[#fff0ed] hover:text-coral">{dismissingThis ? <LoaderCircle className="animate-spin" size={17} /> : <X size={18} />}</button> : <button type="button" onClick={() => void toggleSaved(item, false)} disabled={Boolean(mutating)} aria-label="取消收藏" title="取消收藏" className="grid size-10 place-items-center rounded-xl text-muted hover:bg-[#fff0ed] hover:text-coral">{savingThis ? <LoaderCircle className="animate-spin" size={17} /> : <Trash2 size={17} />}</button>}
            </div>
          </div>
          <div className="mt-4 line-clamp-3 text-[15px] font-bold leading-7"><MathText>{item.stem}</MathText></div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-dashed border-ink/10 pt-4">
            {review ? <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs font-bold text-muted"><span className={review.isDue ? "text-coral" : "text-violet"}>{scheduledLabel(review)}</span><span>已复习 {review.repetitions} 次</span><span>{review.lastResult === false ? "上次答错" : review.lastResult === true ? "上次答对" : "等待再次挑战"}</span></div> : <div className="flex flex-wrap gap-2 text-xs font-bold text-muted"><span>{new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "numeric", day: "numeric" }).format(new Date(saved!.savedAt))} 收藏</span>{saved?.isInReview ? <span className={saved.reviewIsDue ? "text-coral" : "text-violet"}>{saved.reviewIsDue ? "错题复习已到期" : "也在错题复习中"}</span> : null}</div>}
            <Link href={practiceHref(item, review)} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-ink px-4 text-sm font-black text-white">{review?.isDue ? "现在复习" : review ? "提前练习" : "练习这题"} <ArrowRight size={16} /></Link>
          </div>
        </article>;
      }) : hasFilters ? <div className="rounded-[28px] border-2 border-dashed border-ink/15 bg-white/50 p-10 text-center"><FilterX className="mx-auto text-violet" size={38} /><h2 className="mt-4 font-display text-xl font-black">没有符合条件的题目</h2><p className="mt-2 text-sm font-semibold text-muted">换个关键词或清除部分筛选条件。</p><button type="button" onClick={resetFilters} className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl bg-ink px-5 text-sm font-black text-white"><RotateCcw size={16} /> 清除筛选</button></div> : <div className="rounded-[28px] border-2 border-dashed border-ink/15 bg-white/50 p-10 text-center"><span className="mx-auto grid size-14 place-items-center rounded-2xl bg-lime text-2xl">{tab === "review" ? "✓" : "☆"}</span><h2 className="mt-4 font-display text-xl font-black">{tab === "review" ? "目前没有待复习错题" : "还没有收藏题目"}</h2><p className="mt-2 text-sm font-semibold text-muted">{tab === "review" ? "继续练习，系统会自动整理需要回看的知识。" : "练习时点击书签，就能把题目留在这里。"}</p><Link href="/practice" className="mt-5 inline-flex items-center gap-2 rounded-xl bg-ink px-5 py-3 text-sm font-black text-white">去练习 <ArrowRight size={16} /></Link></div>}
    </section>
  </div>;
}
