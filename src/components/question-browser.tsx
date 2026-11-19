"use client";

import { ChevronLeft, ChevronRight, LoaderCircle, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { apiRequest, describeApiError } from "@/lib/api-client";
import type { BrowsePayload } from "@/lib/contracts/practice";
import { difficultyLabel, QUESTION_TYPE_LABELS } from "@/lib/question-labels";
import { MathText } from "./math-text";
import { PracticeFilters } from "./practice/practice-filters";
import { cascadeFilterChange, usePracticeCatalog, type PracticeFilters as Filters } from "./practice/use-practice-session";

const EMPTY: Filters = { subject: "", gradeBand: "", grade: "", difficulty: "", type: "", tags: "" };

function resultBadge(item: BrowsePayload["items"][number]) {
  if (!item.attempts) return null;
  const tone = item.lastResult ? "bg-[#e6f8ef] text-[#247a59]" : item.lastResult === false ? "bg-[#fff0ed] text-coral" : "bg-[#f0edff] text-violet";
  return <span className={`rounded-full px-2.5 py-1 text-[11px] font-black ${tone}`}>做过 {item.attempts} 次 · 上次{item.lastResult ? "答对" : item.lastResult === false ? "答错" : "待自评"}</span>;
}

// Answer-free catalog browsing for finding a specific question or reading a
// contest paper in order; every item links back into practice.
export function QuestionBrowser() {
  const search = useSearchParams();
  const paper = search.get("paper") ?? "";
  const [filters, setFilters] = useState<Filters>(EMPTY);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<BrowsePayload | null>(null);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const catalog = usePracticeCatalog(filters);

  useEffect(() => {
    const controller = new AbortController();
    apiRequest<BrowsePayload>("/api/questions/browse", {
      query: { ...filters, page, paper: paper || undefined },
      signal: controller.signal,
      onUnauthorized: "redirect",
    })
      .then((payload) => { setData(payload); setError(""); })
      .catch((cause) => { if (!controller.signal.aborted) setError(describeApiError(cause, "题库加载失败，请稍后再试。")); });
    return () => controller.abort();
  }, [filters, page, paper, reload]);

  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  return <div className="mx-auto max-w-[1180px] px-4 pb-16 pt-6 sm:px-8 lg:px-10">
    <header><p className="text-xs font-black uppercase tracking-[.2em] text-violet">Question library</p><h1 className="mt-1 font-display text-3xl font-black tracking-[-.04em]">{paper ? `试卷 ${paper}` : "题库浏览"}</h1><p className="mt-2 text-sm font-semibold text-muted">只显示题目，不显示答案；点开任意一题即可单独练习。</p></header>
    {paper ? <Link href="/browse" className="mt-4 inline-block text-sm font-black text-violet">查看全部题库</Link> : <PracticeFilters
      filters={filters}
      catalog={catalog.catalog}
      catalogLoading={catalog.loading}
      catalogError={catalog.error}
      disabled={false}
      onChange={(key, value) => { setPage(1); setFilters((current) => cascadeFilterChange(current, key, value)); }}
      onReset={() => { setPage(1); setFilters(EMPTY); }}
    />}
    {error ? <div role="alert" className="mt-6 flex items-center gap-3 rounded-2xl border-2 border-coral/30 bg-[#fff0ed] p-4 text-sm font-bold text-coral">{error}<button onClick={() => setReload((value) => value + 1)} className="ml-auto flex items-center gap-1 underline"><RotateCcw size={15} /> 重新加载</button></div> : null}
    {!data && !error ? <div role="status" className="mt-10 grid place-items-center"><LoaderCircle className="animate-spin text-violet" /></div> : null}
    {data ? <>
      <p className="mt-6 text-xs font-bold text-muted">共 {data.total.toLocaleString("zh-CN")} 题</p>
      <ul className="mt-3 space-y-3">{data.items.map((item) => <li key={item.id} className="rounded-2xl border-2 border-ink/10 bg-white p-4">
        <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
          {item.problemNumber ? <span className="rounded-full bg-ink px-2.5 py-1 font-black text-white">第 {item.problemNumber} 题</span> : null}
          <span className="rounded-full px-2.5 py-1 font-black text-white" style={{ background: item.subject.color }}>{item.subject.name}</span>
          <span className="text-muted">{item.grade} · {QUESTION_TYPE_LABELS[item.type] ?? item.type} · {difficultyLabel(item.difficulty)}</span>
          {resultBadge(item)}
          <Link href={`/practice?questionId=${item.id}`} className="ml-auto font-black text-violet">练习这题</Link>
        </div>
        <div className="mt-2 line-clamp-3 whitespace-pre-line text-sm font-semibold leading-6"><MathText>{item.stem}</MathText></div>
      </li>)}</ul>
      {!paper && pages > 1 ? <nav aria-label="分页" className="mt-6 flex items-center justify-center gap-3">
        <button onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={page <= 1} className="grid size-11 place-items-center rounded-xl border-2 border-ink/10 bg-white disabled:opacity-40" aria-label="上一页"><ChevronLeft /></button>
        <span className="text-sm font-black">{page} / {pages}</span>
        <button onClick={() => setPage((value) => Math.min(pages, value + 1))} disabled={page >= pages || page >= 500} className="grid size-11 place-items-center rounded-xl border-2 border-ink/10 bg-white disabled:opacity-40" aria-label="下一页"><ChevronRight /></button>
      </nav> : null}
    </> : null}
  </div>;
}
