"use client";

import { Check, Clock3, LoaderCircle, Send, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useT } from "@/i18n/client";
import { apiRequest, describeApiError } from "@/lib/api-client";
import type { ContestResultView, ContestSessionView } from "@/lib/contracts/contests";
import { CONTEST_SESSION_STATUS } from "@/lib/domain-constants";
import { MathText } from "../math-text";

type View = ContestSessionView | ContestResultView;
const AUTOSAVE_DELAY_MS = 800;

function remainingLabel(milliseconds: number) {
  const total = Math.max(0, Math.floor(milliseconds / 1000));
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

export function ContestRunner({ sessionId }: { sessionId: string }) {
  const t = useT();
  const [view, setView] = useState<View | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      setView(await apiRequest<View>("/api/contests/session", { query: { id: sessionId }, onUnauthorized: "redirect" }));
    } catch (cause) {
      setError(describeApiError(cause, t("contest.paperLoadFailed"), t));
    }
  }, [sessionId, t]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  if (error) return <div role="alert" className="mx-auto mt-10 max-w-xl rounded-2xl border-2 border-coral/30 bg-[#fff0ed] p-5 text-sm font-bold text-coral">{error} <button onClick={() => void load()} className="underline">{t("contest.reload")}</button></div>;
  if (!view) return <div role="status" className="mt-16 grid place-items-center"><LoaderCircle className="animate-spin text-violet" /></div>;
  return view.status === CONTEST_SESSION_STATUS.ACTIVE
    ? <ContestPaper view={view} onSubmitted={setView} />
    : <ContestResult result={view} />;
}

function ContestPaper({ view, onSubmitted }: { view: ContestSessionView; onSubmitted: (result: ContestResultView) => void }) {
  const t = useT();
  const [answers, setAnswers] = useState<Record<string, string>>(view.answers);
  const [current, setCurrent] = useState(view.questions[0]?.number ?? 1);
  const [now, setNow] = useState(() => Date.now());
  const [saveState, setSaveState] = useState<"saved" | "saving" | "failed">("saved");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef<Record<string, string | null>>({});
  const saveTimer = useRef<number | null>(null);
  const deadline = new Date(view.deadlineAt).getTime();
  const remaining = deadline - now;
  const question = view.questions.find((item) => item.number === current) ?? view.questions[0];

  const flush = useCallback(async () => {
    const changes = pending.current;
    if (!Object.keys(changes).length) return;
    pending.current = {};
    setSaveState("saving");
    try {
      await apiRequest("/api/contests/session", { method: "PATCH", body: { sessionId: view.id, answers: changes } });
      setSaveState("saved");
    } catch {
      pending.current = { ...changes, ...pending.current };
      setSaveState("failed");
    }
  }, [view.id]);

  const submit = useCallback(async (confirmFirst: boolean) => {
    if (submitting) return;
    const unanswered = view.questions.length - Object.keys(answers).length;
    if (confirmFirst && !window.confirm(unanswered ? t("contest.confirmSubmitUnanswered", { count: unanswered }) : t("contest.confirmSubmit"))) return;
    setSubmitting(true); setError("");
    try {
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
      await flush();
      onSubmitted(await apiRequest<ContestResultView>("/api/contests/submit", { method: "POST", body: { sessionId: view.id } }));
    } catch (cause) {
      setError(describeApiError(cause, t("contest.submitFailed"), t));
      setSubmitting(false);
    }
  }, [answers, flush, onSubmitted, submitting, t, view.id, view.questions.length]);

  const submitRef = useRef(submit);
  useEffect(() => {
    submitRef.current = submit;
  });

  useEffect(() => {
    let expired = false;
    const timer = window.setInterval(() => {
      const current = Date.now();
      setNow(current);
      // Time is up: submit what was saved, exactly as a proctor would.
      if (!expired && current >= deadline) {
        expired = true;
        void submitRef.current(false);
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [deadline]);

  function choose(label: string) {
    const key = String(current);
    const next = answers[key] === label ? null : label;
    setAnswers((existing) => {
      const copy = { ...existing };
      if (next) copy[key] = next;
      else delete copy[key];
      return copy;
    });
    pending.current[key] = next;
    setSaveState("saving");
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => void flush(), AUTOSAVE_DELAY_MS);
  }

  return <div className="mx-auto max-w-[1180px] px-4 pb-16 pt-6 sm:px-8 lg:px-10">
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div><p className="text-xs font-black uppercase tracking-[.2em] text-violet">Contest mode</p><h1 className="mt-1 font-display text-2xl font-black">{view.paper.year} {view.paper.contest}</h1></div>
      <div className="flex items-center gap-2">
        <span role="timer" aria-label={t("contest.remaining")} className={`flex items-center gap-2 rounded-2xl px-4 py-2 text-sm font-black ${remaining < 5 * 60_000 ? "bg-coral text-white" : "bg-ink text-white"}`}><Clock3 size={17} />{remainingLabel(remaining)}</span>
        <span className="text-xs font-bold text-muted">{saveState === "saving" ? t("contest.saving") : saveState === "failed" ? t("contest.saveFailed") : t("contest.saved")}</span>
      </div>
    </header>

    <nav aria-label={t("contest.questionNav")} className="mt-6 grid grid-cols-10 gap-1.5 sm:grid-cols-[repeat(25,minmax(0,1fr))]">
      {view.questions.map((item) => <button key={item.number} onClick={() => setCurrent(item.number)} aria-current={item.number === current ? "step" : undefined} aria-label={`${t("contest.questionLabel", { number: item.number })}${answers[String(item.number)] ? t("contest.answered") : ""}`} className={`min-h-9 rounded-lg text-xs font-black ${item.number === current ? "bg-ink text-white" : answers[String(item.number)] ? "bg-lime text-ink" : "border-2 border-ink/10 bg-white text-muted"}`}>{item.number}</button>)}
    </nav>

    {question ? <article aria-labelledby="contest-question-heading" className="mt-6 rounded-[28px] border-2 border-ink/10 bg-white p-6 sm:p-8">
      <p className="text-xs font-black text-muted">{t("contest.questionLabel", { number: question.number })}</p>
      <h2 id="contest-question-heading" className="question-copy mt-2 whitespace-pre-line text-[17px] font-bold leading-8"><MathText eagerFigures>{question.stem}</MathText></h2>
      {question.stemAsset ? <Image src={question.stemAsset.path} alt={question.stemAsset.altText} width={720} height={360} className="mx-auto mt-6 h-auto max-h-80 w-full max-w-2xl rounded-2xl object-contain" /> : null}
      <div role="group" aria-label={t("contest.options")} className="mt-6 grid gap-3">{question.options.map((option) => {
        const chosen = answers[String(question.number)] === option.label;
        return <button key={option.label} onClick={() => choose(option.label)} aria-pressed={chosen} className={`flex items-start gap-4 rounded-2xl border-2 p-4 text-left ${chosen ? "border-violet bg-[#f0edff]" : "border-ink/10 bg-[#fbfaf7] hover:border-violet/45"}`}>
          <span className={`grid size-8 shrink-0 place-items-center rounded-xl text-sm font-black ${chosen ? "bg-violet text-white" : "border-2 border-ink/10 bg-white"}`}>{option.label}</span>
          <span className="flex min-w-0 flex-1 flex-col gap-2 pt-1 text-[15px] font-semibold leading-6">{option.asset ? <Image src={option.asset.path} alt={option.asset.altText} width={240} height={150} className="h-auto w-full max-w-60 rounded-xl" /> : null}{option.content ? <MathText>{option.content}</MathText> : null}</span>
        </button>;
      })}</div>
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          <button onClick={() => setCurrent(Math.max(1, current - 1))} disabled={current <= 1} className="min-h-11 rounded-xl border-2 border-ink/10 px-4 text-sm font-black disabled:opacity-40">{t("contest.previous")}</button>
          <button onClick={() => setCurrent(Math.min(view.questions.length, current + 1))} disabled={current >= view.questions.length} className="min-h-11 rounded-xl border-2 border-ink/10 px-4 text-sm font-black disabled:opacity-40">{t("contest.next")}</button>
        </div>
        <button onClick={() => void submit(true)} disabled={submitting} className="flex min-h-11 items-center gap-2 rounded-xl bg-ink px-5 text-sm font-black text-white disabled:opacity-50">{submitting ? <LoaderCircle className="animate-spin" size={16} /> : <Send size={16} />} {t("contest.submit")}</button>
      </div>
      {error ? <p role="alert" className="mt-3 text-sm font-bold text-coral">{error}</p> : null}
    </article> : null}
  </div>;
}

function ContestResult({ result }: { result: ContestResultView }) {
  const t = useT();
  return <div className="mx-auto max-w-[1180px] px-4 pb-16 pt-6 sm:px-8 lg:px-10">
    <header><p className="text-xs font-black uppercase tracking-[.2em] text-violet">Contest result</p><h1 className="mt-1 font-display text-2xl font-black">{t("contest.resultTitle", { paper: `${result.paper.year} ${result.paper.contest}` })}</h1></header>
    <section aria-label={t("contest.overview")} className="mt-6 grid gap-3 sm:grid-cols-4">
      <div className="rounded-2xl border-2 border-ink bg-lime p-4"><p className="text-3xl font-black">{result.score}</p><p className="text-xs font-black">{t("contest.totalScore", { max: result.maxScore })}</p></div>
      <div className="rounded-2xl border-2 border-ink/10 bg-white p-4"><p className="text-2xl font-black text-[#247a59]">{result.correct}</p><p className="text-xs font-black">{t("contest.correct")}</p></div>
      <div className="rounded-2xl border-2 border-ink/10 bg-white p-4"><p className="text-2xl font-black text-coral">{result.wrong}</p><p className="text-xs font-black">{t("contest.wrong")}</p></div>
      <div className="rounded-2xl border-2 border-ink/10 bg-white p-4"><p className="text-2xl font-black text-muted">{result.blank}</p><p className="text-xs font-black">{t("contest.blank")}</p></div>
    </section>
    {result.topics.length ? <section aria-labelledby="contest-topics" className="mt-6 rounded-2xl border-2 border-ink/10 bg-white p-5">
      <h2 id="contest-topics" className="font-display text-lg font-black">{t("contest.topics")}</h2>
      <ul className="mt-3 grid gap-2 sm:grid-cols-2">{result.topics.map((topic) => <li key={topic.label} className="flex items-center justify-between rounded-xl bg-canvas px-3 py-2 text-sm font-bold"><span>{topic.label}</span><span>{topic.correct} / {topic.total}</span></li>)}</ul>
    </section> : null}
    <section aria-labelledby="contest-review" className="mt-6">
      <h2 id="contest-review" className="font-display text-lg font-black">{t("contest.review")}</h2>
      <ol className="mt-3 space-y-3">{result.problems.map((problem) => <li key={problem.number} className="rounded-2xl border-2 border-ink/10 bg-white p-4">
        <div className="flex flex-wrap items-center gap-2 text-sm font-black"><span>{t("contest.questionLabel", { number: problem.number })}</span>{problem.isCorrect ? <span className="flex items-center gap-1 text-[#247a59]"><Check size={15} /> {t("contest.correct")}</span> : problem.isCorrect === false ? <span className="flex items-center gap-1 text-coral"><X size={15} /> {t("contest.wrongWithResponse", { response: problem.response ?? "" })}</span> : <span className="text-muted">{t("contest.blank")}</span>}<span className="text-muted">{t("contest.correctAnswer", { answer: problem.correctLabels.join(t("practice.history.listSeparator")) || problem.answer })}</span><Link href={`/practice?questionId=${problem.questionId}`} className="ml-auto text-xs text-violet">{t("contest.practiceThis")}</Link></div>
        <details className="mt-2 text-sm"><summary className="cursor-pointer font-bold text-muted">{t("contest.stemAndSolution")}</summary><div className="mt-2 whitespace-pre-line leading-6"><MathText>{problem.stem}</MathText></div>{problem.explanation ? <div className="mt-2 whitespace-pre-line leading-6 text-ink/75"><MathText>{problem.explanation}</MathText></div> : null}</details>
      </li>)}</ol>
    </section>
    <Link href="/contest" className="mt-6 inline-flex min-h-11 items-center rounded-xl bg-ink px-5 text-sm font-black text-white">{t("contest.backToContests")}</Link>
  </div>;
}
