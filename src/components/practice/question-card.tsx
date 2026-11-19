import { Bookmark, BookmarkCheck, Check, ChevronRight, Keyboard, LoaderCircle } from "lucide-react";
import Image from "next/image";
import { useEffect, useRef } from "react";
import { QUESTION_TYPE } from "@/lib/domain-constants";
import { QUESTION_TYPE_LABELS, difficultyLabel } from "@/lib/question-labels";
import { MathText } from "../math-text";
import { canAdvance, canRequestHint, canSubmit, roundComplete, type PracticeAction, type PracticeState } from "./practice-machine";
import { AnswerOptions, HintPanel, ReportForm, ResultPanel, WrittenAnswer } from "./question-parts";
import type { PracticeActions as Actions } from "./use-practice-session";

export function QuestionCard({ state, dispatch, actions, isAuthenticated }: {
  state: PracticeState;
  dispatch: (action: PracticeAction) => void;
  actions: Actions;
  isAuthenticated: boolean;
}) {
  const question = state.question!;
  const questionHeading = useRef<HTMLHeadingElement>(null);
  const resultPanel = useRef<HTMLDivElement>(null);
  const explanationDetails = useRef<HTMLDetailsElement>(null);
  const { result } = state;
  const answering = state.phase === "answering";
  const assessing = state.phase === "assessing";
  const topicTags = question.tags.filter((tag) => tag.dimension === "TOPIC").slice(0, 2);

  useEffect(() => {
    questionHeading.current?.focus();
  }, [question.id]);

  useEffect(() => {
    if (result) resultPanel.current?.focus();
  }, [result]);

  return (
    <article aria-labelledby="practice-question-heading" className="mt-7 overflow-hidden rounded-[30px] border-2 border-ink/10 bg-white shadow-[0_8px_0_#e3dfd4]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-dashed border-ink/15 px-6 py-4 sm:px-9">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full px-3 py-1.5 text-xs font-black text-white" style={{ background: question.subject.color }}>{question.subject.name}</span>
          <span className="rounded-full bg-canvas px-3 py-1.5 text-xs font-bold text-muted">{question.grade}</span>
          {topicTags.map((tag) => <span key={tag.slug} className="rounded-full bg-[#efecff] px-3 py-1.5 text-xs font-bold text-violet">{tag.label}</span>)}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-black text-muted">{QUESTION_TYPE_LABELS[question.type] ?? question.typeLabel} · {difficultyLabel(question.difficulty)}</span>
          {isAuthenticated ? <button onClick={() => void actions.toggleSaved()} disabled={state.saving} aria-label={question.isSaved ? "取消收藏" : "收藏题目"} aria-keyshortcuts="S" className={`grid size-11 place-items-center rounded-xl transition ${question.isSaved ? "bg-lime text-ink" : "bg-canvas text-muted hover:text-violet"}`}>{question.isSaved ? <BookmarkCheck size={19} /> : <Bookmark size={19} />}</button> : null}
        </div>
      </div>

      <div className="px-6 py-7 sm:px-9 sm:py-9">
        <h2 ref={questionHeading} id="practice-question-heading" tabIndex={-1} className="question-copy whitespace-pre-line text-[17px] font-bold leading-8 text-ink outline-none sm:text-[19px]"><MathText eagerFigures>{question.stem}</MathText></h2>
        {question.stemAsset ? <Image src={question.stemAsset.path} alt={question.stemAsset.altText} width={720} height={360} loading="eager" className="mx-auto mt-6 h-auto max-h-80 w-full max-w-2xl rounded-2xl border border-ink/10 bg-[#fffdf8] object-contain" /> : null}
        {!result ? <HintPanel hint={state.hint} hasHint={question.hasHint} hintCount={question.hintCount} canRequest={canRequestHint(state)} onReveal={() => void actions.revealHint()} /> : null}
        {question.options.length
          ? <AnswerOptions question={question} selected={state.selected} result={result} disabled={!answering} onToggle={(label) => dispatch({ type: "OPTION_TOGGLED", label })} />
          : <WrittenAnswer value={state.written} disabled={!answering} onChange={(text) => dispatch({ type: "WRITTEN_CHANGED", text })} />}

        {result ? <ResultPanel
          result={result}
          combo={state.combo}
          isAuthenticated={isAuthenticated}
          assessing={assessing}
          panelRef={resultPanel}
          explanationRef={explanationDetails}
          onExplanationOpened={() => void actions.recordExplanationView()}
          onAssess={(isCorrect) => void actions.selfAssess(isCorrect, Boolean(explanationDetails.current?.open))}
        /> : null}
        {state.actionError ? <p role="alert" className="mt-4 text-sm font-bold text-coral">{state.actionError}</p> : null}
        {isAuthenticated ? <ReportForm
          report={state.report}
          onToggle={() => dispatch({ type: "REPORT_TOGGLED" })}
          onChange={(change) => dispatch({ type: "REPORT_CHANGED", ...change })}
          onSubmit={() => void actions.reportQuestion()}
        /> : null}
      </div>

      <footer className="flex items-center justify-between gap-4 border-t border-ink/10 bg-[#fbfaf7] px-6 py-4 sm:px-9">
        <div className="hidden text-xs font-bold text-muted sm:block">
          <p>{question.type === QUESTION_TYPE.MULTIPLE_CHOICE ? "可选择多个答案" : question.isAutoGradable ? "选择你认为正确的答案" : "先独立思考，再对照解析"}</p>
          <p className="mt-1 flex items-center gap-1.5 text-[11px] text-muted/80"><Keyboard size={13} /> 数字键选择 · Enter 提交/下一题 · H {question.hasHint ? "提示" : "策略"}{isAuthenticated ? " · S 收藏" : ""}</p>
        </div>
        {result
          ? <button onClick={() => void actions.nextQuestion()} disabled={!canAdvance(state)} aria-keyshortcuts="Enter" className="ml-auto flex items-center gap-2 rounded-xl bg-ink px-6 py-3 text-sm font-black text-white shadow-[0_4px_0_#6c5ce7] disabled:cursor-not-allowed disabled:opacity-40">{roundComplete(state) ? "开始新一轮" : "下一题"} <ChevronRight size={17} /></button>
          : <button onClick={() => void actions.submit()} disabled={!canSubmit(state)} aria-keyshortcuts="Enter" className="ml-auto flex items-center gap-2 rounded-xl bg-violet px-6 py-3 text-sm font-black text-white shadow-[0_4px_0_#242136] transition enabled:hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-40">{state.phase === "submitting" ? <LoaderCircle className="animate-spin" size={17} /> : <Check size={17} />} 提交答案</button>}
      </footer>
    </article>
  );
}
