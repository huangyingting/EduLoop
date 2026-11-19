"use client";

import { Clock3, LoaderCircle, Play, RotateCcw, Trophy } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useT } from "@/i18n/client";
import { ApiClientError, apiRequest, describeApiError } from "@/lib/api-client";
import type { ContestListPayload, ContestSessionView } from "@/lib/contracts/contests";

const LEVELS = ["AMC-8", "AMC-10", "AMC-12"] as const;

export function ContestCatalog() {
  const router = useRouter();
  const t = useT();
  const [level, setLevel] = useState<(typeof LEVELS)[number]>("AMC-8");
  const [data, setData] = useState<ContestListPayload | null>(null);
  const [error, setError] = useState("");
  const [starting, setStarting] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      setData(await apiRequest<ContestListPayload>("/api/contests", { query: { level }, onUnauthorized: "redirect" }));
    } catch (cause) {
      setError(describeApiError(cause, t("contest.loadFailed"), t));
    }
  }, [level, t]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function start(paperKey: string) {
    if (starting) return;
    setStarting(paperKey); setError("");
    try {
      const session = await apiRequest<ContestSessionView>("/api/contests/start", { method: "POST", body: { paperKey } });
      router.push(`/contest/${session.id}`);
    } catch (cause) {
      const details = cause instanceof ApiClientError ? cause.details as { sessionId?: string } | undefined : undefined;
      if (details?.sessionId) router.push(`/contest/${details.sessionId}`);
      else setError(describeApiError(cause, t("contest.startFailed"), t));
      setStarting("");
    }
  }

  return <div className="mx-auto max-w-[1180px] px-4 pb-16 pt-6 sm:px-8 lg:px-10">
    <header><p className="text-xs font-black uppercase tracking-[.2em] text-violet">Contest mode</p><h1 className="mt-1 font-display text-3xl font-black tracking-[-.04em]">{t("contest.title")}</h1><p className="mt-2 max-w-2xl text-sm font-semibold leading-6 text-muted">{t("contest.lead")}</p></header>

    {data?.activeSession ? <div role="status" className="mt-6 flex flex-wrap items-center gap-3 rounded-2xl border-2 border-violet/20 bg-[#f0edff] p-4 text-sm font-bold text-violet"><Clock3 size={18} />{t("contest.activeSession", { paper: data.activeSession.paperKey })}<Link href={`/contest/${data.activeSession.id}`} className="ml-auto rounded-xl bg-violet px-4 py-2 font-black text-white">{t("contest.resume")}</Link></div> : null}

    <div role="tablist" aria-label={t("contest.levels")} className="mt-6 flex gap-2">
      {LEVELS.map((value) => <button key={value} role="tab" aria-selected={level === value} onClick={() => { setData(null); setLevel(value); }} className={`min-h-11 rounded-xl px-4 text-sm font-black ${level === value ? "bg-ink text-white" : "border-2 border-ink/10 bg-white text-muted"}`}>{value}</button>)}
    </div>

    {error ? <div role="alert" className="mt-6 flex items-center gap-3 rounded-2xl border-2 border-coral/30 bg-[#fff0ed] p-4 text-sm font-bold text-coral">{error}<button onClick={() => void load()} className="ml-auto flex items-center gap-1 underline"><RotateCcw size={15} /> {t("contest.reload")}</button></div> : null}
    {!data && !error ? <div role="status" className="mt-10 grid place-items-center"><LoaderCircle className="animate-spin text-violet" /></div> : null}

    {data ? <ul className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{data.papers.map((paper) => <li key={paper.key} className="rounded-2xl border-2 border-ink/10 bg-white p-4">
      <div className="flex items-start justify-between gap-3"><div><p className="font-display text-lg font-black">{paper.year} {paper.contest}</p><p className="mt-1 text-xs font-bold text-muted">{t("contest.paperMeta", { count: paper.questionCount, minutes: paper.durationMinutes })}</p></div>{paper.bestScore !== null ? <span className="flex items-center gap-1 rounded-full bg-lime px-3 py-1 text-xs font-black"><Trophy size={14} /> {t("contest.best", { score: paper.bestScore })}</span> : null}</div>
      <div className="mt-4 flex items-center gap-2">
        <button onClick={() => void start(paper.key)} disabled={!paper.available || Boolean(starting)} className="flex min-h-11 items-center gap-2 rounded-xl bg-violet px-4 text-sm font-black text-white disabled:opacity-40">{starting === paper.key ? <LoaderCircle className="animate-spin" size={16} /> : <Play size={16} />} {paper.attempts ? t("contest.retake") : t("contest.start")}</button>
        <Link href={`/browse?paper=${paper.key}`} className="min-h-11 rounded-xl px-3 py-3 text-xs font-black text-muted hover:text-violet">{t("contest.browse")}</Link>
        {!paper.available ? <span className="text-xs font-bold text-muted">{t("contest.unavailable")}</span> : null}
      </div>
    </li>)}</ul> : null}
  </div>;
}
