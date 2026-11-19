"use client";

import { CircleAlert, Flame, LoaderCircle, RotateCcw, Sparkles, WandSparkles } from "lucide-react";
import { useT } from "@/i18n/client";
import type { Translator } from "@/i18n/messages";
import type { RecommendationReason } from "@/lib/contracts/practice";
import { useLearner } from "../learner-provider";
import { roundComplete } from "./practice-machine";
import { PracticeFilters } from "./practice-filters";
import { QuestionCard } from "./question-card";
import { RoundComplete, SessionProgress } from "./session-progress";
import { usePracticeCatalog, usePracticeSession } from "./use-practice-session";
import { usePracticeShortcuts } from "./use-practice-shortcuts";

const MODE_TITLES = {
  review: { eyebrow: "Review mode", title: "practice.modeReview" },
  adaptive: { eyebrow: "Adaptive mode", title: "practice.modeAdaptive" },
  standard: { eyebrow: "Focus mode", title: "practice.modeStandard" },
} as const;

function recommendationText(t: Translator, recommendation: RecommendationReason) {
  const reason = t(`practice.reasons.${recommendation.kind}`, { focus: recommendation.focus ?? "" });
  return recommendation.targeted ? t("practice.reasons.targeted", { reason }) : reason;
}

export function PracticePlayer() {
  const { state, dispatch, filters, isAuthenticated, practiceMode, actions } = usePracticeSession();
  const catalog = usePracticeCatalog(filters);
  const { stats } = useLearner();
  const t = useT();
  usePracticeShortcuts(state, dispatch, actions, isAuthenticated);
  const busy = state.phase === "loading" || state.phase === "submitting";
  const mode = MODE_TITLES[practiceMode];

  return (
    <div className="mx-auto max-w-[1180px] px-4 pb-16 pt-6 sm:px-8 lg:px-10">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div><p className="text-xs font-black uppercase tracking-[.2em] text-violet">{mode.eyebrow}</p><h1 className="mt-1 font-display text-3xl font-black tracking-[-.04em]">{t(mode.title)}</h1></div>
        {isAuthenticated ? <div className="flex gap-2">
          <div className="rounded-2xl border-2 border-ink/10 bg-white px-4 py-2 text-sm font-black shadow-[0_4px_0_#e3dfd4]"><Flame className="mr-1.5 inline text-coral" size={17} />{t("practice.combo", { count: state.combo })}</div>
          <div className="rounded-2xl bg-ink px-4 py-2 text-sm font-black text-white"><Sparkles className="mr-1.5 inline text-lime" size={17} />{stats.xp} XP</div>
        </div> : <div className="rounded-2xl border-2 border-violet/15 bg-[#f0edff] px-4 py-2 text-xs font-bold text-violet">{t("practice.guestMode")}</div>}
      </header>

      <PracticeFilters
        filters={filters}
        catalog={catalog.catalog}
        catalogLoading={catalog.loading}
        catalogError={catalog.error}
        disabled={busy}
        onChange={actions.changeFilter}
        onReset={actions.resetFilters}
      />

      <SessionProgress completed={state.completed} goal={state.goal} disabled={busy} onRestart={() => void actions.restartChallenge()} />

      {isAuthenticated && state.question?.recommendation ? <div className="mt-5 flex items-center gap-2 rounded-2xl border-2 border-violet/15 bg-[#f0edff] px-4 py-3 text-sm font-bold text-violet"><WandSparkles size={17} className="shrink-0" />{recommendationText(t, state.question.recommendation)}</div> : null}

      {state.phase === "loading" ? <div role="status" aria-live="polite" className="mt-8 grid min-h-[460px] place-items-center rounded-[30px] border-2 border-ink/10 bg-white"><div className="text-center"><LoaderCircle className="mx-auto animate-spin text-violet" size={34} /><p className="mt-3 text-sm font-bold text-muted">{t("practice.loadingQuestion")}</p></div></div> : null}
      {state.phase === "failed" ? <div role="alert" className="mt-8 grid min-h-[420px] place-items-center rounded-[30px] border-2 border-ink/10 bg-white p-8 text-center"><div><CircleAlert className="mx-auto text-coral" size={42} /><h2 className="mt-4 text-xl font-black">{t("practice.noQuestionTitle")}</h2><p className="mt-2 text-sm font-semibold text-muted">{state.loadError}</p><button onClick={actions.retry} className="mt-5 inline-flex items-center gap-2 rounded-xl bg-ink px-5 py-3 text-sm font-black text-white"><RotateCcw size={16} /> {t("common.retry")}</button></div></div> : null}

      {state.question ? <QuestionCard state={state} dispatch={dispatch} actions={actions} isAuthenticated={isAuthenticated} /> : null}

      {roundComplete(state) ? <RoundComplete goal={state.goal} correct={state.correct} isAuthenticated={isAuthenticated} /> : null}
    </div>
  );
}
