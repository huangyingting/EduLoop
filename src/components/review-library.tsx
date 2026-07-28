"use client";

import { ArrowRight, Bookmark, Brain, CalendarClock, Check, LoaderCircle, RotateCcw, Sparkles, Trash2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { getDeviceKey } from "@/lib/learner";
import { MathText } from "./math-text";

type QuestionCard = { id: string; stem: string; type: string; difficulty: string; subject: { slug: string; name: string; color: string }; grade: string; tags: Array<{ slug: string; label: string }> };
type ReviewCard = QuestionCard & { dueAt: string; isDue: boolean; intervalDays: number; repetitions: number; lastResult: boolean | null };
type ReviewData = { dueCount: number; activeCount: number; savedCount: number; reviews: ReviewCard[]; saved: Array<QuestionCard & { savedAt: string }> };

export function ReviewLibrary() {
  const [data, setData] = useState<ReviewData | null>(null);
  const [tab, setTab] = useState<"review" | "saved">("review");
  const [error, setError] = useState("");

  async function load() {
    setError("");
    try {
      const response = await fetch(`/api/review?deviceKey=${encodeURIComponent(getDeviceKey())}`, { cache: "no-store" });
      if (!response.ok) throw new Error("复习清单加载失败，请稍后再试。");
      setData(await response.json() as ReviewData);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "加载失败"); }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, []);

  async function removeSaved(questionId: string) {
    const response = await fetch("/api/review", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ deviceKey: getDeviceKey(), questionId, saved: false }) });
    if (response.ok) setData((current) => current ? { ...current, savedCount: Math.max(0, current.savedCount - 1), saved: current.saved.filter((item) => item.id !== questionId) } : current);
  }

  function navigateTabs(event: React.KeyboardEvent) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const nextTab = event.key === "ArrowLeft" || event.key === "Home" ? "review" : "saved";
    setTab(nextTab);
    window.requestAnimationFrame(() => document.getElementById(`${nextTab}-tab`)?.focus());
  }

  if (!data && !error) return <div role="status" aria-live="polite" className="grid min-h-[70vh] place-items-center"><div className="text-center"><LoaderCircle className="mx-auto animate-spin text-violet" size={36} /><p className="mt-3 text-sm font-bold text-muted">正在整理学习线索…</p></div></div>;
  if (!data) return <div role="alert" className="grid min-h-[70vh] place-items-center p-6 text-center"><div><RotateCcw className="mx-auto text-coral" size={40} /><p className="mt-4 font-bold">{error}</p><button onClick={() => void load()} className="mt-4 rounded-xl bg-ink px-5 py-3 text-sm font-black text-white">重新加载</button></div></div>;

  const cards = tab === "review" ? data.reviews : data.saved;
  return (
    <div className="mx-auto max-w-[1160px] px-5 pb-20 pt-7 sm:px-8 lg:px-10 xl:px-14">
      <header className="relative overflow-hidden rounded-[32px] border-2 border-ink bg-[#d9d3f5] p-7 shadow-[0_8px_0_#242136] sm:p-10">
        <div className="dot-grid absolute inset-0 opacity-30" /><div className="relative max-w-2xl"><div className="flex items-center gap-2 text-xs font-black uppercase tracking-[.2em] text-violet"><Brain size={18} /> Review workshop</div><h1 className="mt-3 font-display text-4xl font-black tracking-[-.05em]">把错题变成新线索</h1><p className="mt-3 text-sm font-semibold leading-6 text-ink/65">答错的题会按节奏回来：今天、明天、三天后。连续掌握三次，它就从清单毕业。</p><div className="mt-6 flex flex-wrap gap-3">{data.dueCount ? <Link href="/practice?mode=review" className="inline-flex items-center gap-2 rounded-2xl bg-ink px-5 py-3 text-sm font-black text-white shadow-[0_5px_0_#6c5ce7]"><Sparkles size={17} /> 复习到期题目 <ArrowRight size={17} /></Link> : <span aria-disabled="true" className="inline-flex items-center gap-2 rounded-2xl bg-ink/30 px-5 py-3 text-sm font-black text-white/70 shadow-[0_5px_0_#6c5ce7]"><Sparkles size={17} /> 暂无到期题目</span>}<span className="rounded-2xl border-2 border-ink/10 bg-white/70 px-4 py-3 text-sm font-black">今天待复习 {data.dueCount} 题</span></div></div>
      </header>

      <div role="tablist" aria-label="复习内容" onKeyDown={navigateTabs} className="mt-8 flex gap-2 rounded-2xl border-2 border-ink/10 bg-white p-1.5">
        <button id="review-tab" role="tab" aria-selected={tab === "review"} aria-controls="review-panel" tabIndex={tab === "review" ? 0 : -1} onClick={() => setTab("review")} className={`flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl px-4 text-sm font-black ${tab === "review" ? "bg-ink text-white" : "text-muted"}`}><CalendarClock size={17} /> 错题复习 <span className="rounded-full bg-white/15 px-2 py-0.5">{data.activeCount}</span></button>
        <button id="saved-tab" role="tab" aria-selected={tab === "saved"} aria-controls="review-panel" tabIndex={tab === "saved" ? 0 : -1} onClick={() => setTab("saved")} className={`flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl px-4 text-sm font-black ${tab === "saved" ? "bg-ink text-white" : "text-muted"}`}><Bookmark size={17} /> 我的收藏 <span className="rounded-full bg-white/15 px-2 py-0.5">{data.savedCount}</span></button>
      </div>

      <section id="review-panel" role="tabpanel" aria-labelledby={tab === "review" ? "review-tab" : "saved-tab"} className="mt-5 space-y-4">
        {cards.length ? cards.map((item) => {
          const review = "dueAt" in item ? item as ReviewCard : null;
          return <article key={item.id} className="rounded-[26px] border-2 border-ink/10 bg-white p-5 shadow-[0_5px_0_#e3dfd4] sm:p-6"><div className="flex flex-wrap items-center gap-2"><span className="rounded-full px-3 py-1.5 text-xs font-black text-white" style={{ background: item.subject.color }}>{item.subject.name}</span><span className="rounded-full bg-canvas px-3 py-1.5 text-xs font-bold text-muted">{item.grade}</span>{item.tags.map((tag) => <span key={tag.slug} className="rounded-full bg-[#f0edff] px-3 py-1.5 text-xs font-bold text-violet">{tag.label}</span>)}{review ? <span className={`ml-auto flex items-center gap-1 text-xs font-black ${review.isDue ? "text-coral" : "text-muted"}`}>{review.isDue ? <><CalendarClock size={15} /> 现在可复习</> : <><Check size={15} /> 已安排后续复习</>}</span> : <button onClick={() => void removeSaved(item.id)} aria-label="取消收藏" className="ml-auto grid size-11 place-items-center rounded-xl text-muted hover:bg-[#fff0ed] hover:text-coral"><Trash2 size={17} /></button>}</div><div className="mt-4 line-clamp-3 text-[15px] font-bold leading-7"><MathText>{item.stem}</MathText></div>{review ? <div className="mt-4 flex items-center justify-between border-t border-dashed border-ink/10 pt-4 text-xs font-bold text-muted"><span>已复习 {review.repetitions} 次</span><span>{review.intervalDays ? `间隔 ${review.intervalDays} 天` : "等待再次挑战"}</span></div> : null}</article>;
        }) : <div className="rounded-[28px] border-2 border-dashed border-ink/15 bg-white/50 p-10 text-center"><span className="mx-auto grid size-14 place-items-center rounded-2xl bg-lime text-2xl">{tab === "review" ? "✓" : "☆"}</span><h2 className="mt-4 font-display text-xl font-black">{tab === "review" ? "目前没有待复习错题" : "还没有收藏题目"}</h2><p className="mt-2 text-sm font-semibold text-muted">{tab === "review" ? "继续练习，系统会自动整理需要回看的知识。" : "练习时点击书签，就能把题目留在这里。"}</p><Link href="/practice" className="mt-5 inline-flex items-center gap-2 rounded-xl bg-ink px-5 py-3 text-sm font-black text-white">去练习 <ArrowRight size={16} /></Link></div>}
      </section>
    </div>
  );
}
