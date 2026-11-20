import { History, LoaderCircle } from "lucide-react";
import { useState } from "react";
import { useI18n, useT } from "@/i18n/client";
import type { Translator } from "@/i18n/messages";
import type { QuestionHistoryPayload, QuestionHistorySummary } from "@/lib/contracts/practice";
import { fetchQuestionHistory } from "./practice-api";

function resultLabel(t: Translator, isCorrect: boolean | null) {
  return isCorrect === true ? t("practice.history.correct") : isCorrect === false ? t("practice.history.wrong") : t("practice.history.pending");
}

export function HistoryBadge({ history }: { history: QuestionHistorySummary }) {
  const t = useT();
  return <span className="rounded-full bg-sky/40 px-3 py-1.5 text-xs font-bold text-ink">{t("practice.history.badge", { count: history.attempts, result: resultLabel(t, history.lastResult) })}</span>;
}

// The learner's own earlier attempts, loaded only when they open the list.
export function QuestionHistoryList({ questionId }: { questionId: string }) {
  const { locale, t } = useI18n();
  const dateFormat = new Intl.DateTimeFormat(locale, { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });
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
    <summary className="flex cursor-pointer items-center gap-1.5 font-black text-muted"><History size={15} /> {t("practice.history.title")}</summary>
    {state === "loading" ? <p className="mt-2 flex items-center gap-2 text-xs font-bold text-muted"><LoaderCircle className="animate-spin" size={14} /> {t("practice.history.loading")}</p> : null}
    {state === "failed" ? <p role="alert" className="mt-2 text-xs font-bold text-coral">{t("practice.history.loadFailed")}</p> : null}
    {history ? <ol className="mt-2 space-y-1.5">{history.attempts.map((attempt) => <li key={attempt.createdAt} className="flex flex-wrap items-center gap-2 rounded-xl bg-white/70 px-3 py-2 text-xs font-semibold">
      <span className="font-black">{dateFormat.format(new Date(attempt.createdAt))}</span>
      <span className={attempt.isCorrect ? "text-[#247a59]" : attempt.isCorrect === false ? "text-coral" : "text-violet"}>{resultLabel(t, attempt.isCorrect)}</span>
      <span className="text-muted">{t("practice.history.response", { response: Array.isArray(attempt.response) ? attempt.response.join(t("practice.history.listSeparator")) : attempt.response.slice(0, 60) })}</span>
      {attempt.hintsUsed ? <span className="text-muted">{t("practice.history.hintsUsed", { count: attempt.hintsUsed })}</span> : null}
    </li>)}</ol> : null}
  </details>;
}
