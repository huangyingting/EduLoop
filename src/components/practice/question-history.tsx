import { History, LoaderCircle } from "lucide-react";
import { useState } from "react";
import type { QuestionHistoryPayload, QuestionHistorySummary } from "@/lib/contracts/practice";
import { fetchQuestionHistory } from "./practice-api";

const dateFormat = new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });

function resultLabel(isCorrect: boolean | null) {
  return isCorrect === true ? "答对" : isCorrect === false ? "答错" : "待自评";
}

export function HistoryBadge({ history }: { history: QuestionHistorySummary }) {
  return <span className="rounded-full bg-sky/40 px-3 py-1.5 text-xs font-bold text-ink">做过 {history.attempts} 次 · 上次{resultLabel(history.lastResult)}</span>;
}

// The learner's own earlier attempts, loaded only when they open the list.
export function QuestionHistoryList({ questionId }: { questionId: string }) {
  const [history, setHistory] = useState<QuestionHistoryPayload | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "failed">("idle");

  async function load() {
    if (history || state === "loading") return;
    setState("loading");
    try {
      setHistory(await fetchQuestionHistory(questionId));
      setState("idle");
    } catch {
      setState("failed");
    }
  }

  return <details onToggle={(event) => { if (event.currentTarget.open) void load(); }} className="mt-3 text-sm">
    <summary className="flex cursor-pointer items-center gap-1.5 font-black text-muted"><History size={15} /> 我的作答记录</summary>
    {state === "loading" ? <p className="mt-2 flex items-center gap-2 text-xs font-bold text-muted"><LoaderCircle className="animate-spin" size={14} /> 正在加载…</p> : null}
    {state === "failed" ? <p role="alert" className="mt-2 text-xs font-bold text-coral">作答记录加载失败，请稍后再试。</p> : null}
    {history ? <ol className="mt-2 space-y-1.5">{history.attempts.map((attempt) => <li key={attempt.createdAt} className="flex flex-wrap items-center gap-2 rounded-xl bg-white/70 px-3 py-2 text-xs font-semibold">
      <span className="font-black">{dateFormat.format(new Date(attempt.createdAt))}</span>
      <span className={attempt.isCorrect ? "text-[#247a59]" : attempt.isCorrect === false ? "text-coral" : "text-violet"}>{resultLabel(attempt.isCorrect)}</span>
      <span className="text-muted">作答：{Array.isArray(attempt.response) ? attempt.response.join("、") : attempt.response.slice(0, 60)}</span>
      {attempt.hintsUsed ? <span className="text-muted">用了 {attempt.hintsUsed} 条提示</span> : null}
    </li>)}</ol> : null}
  </details>;
}
