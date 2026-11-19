import { useCallback, useEffect, useRef, type Dispatch, type RefObject } from "react";
import { describeApiError } from "@/lib/api-client";
import type { AttemptResult } from "@/lib/contracts/practice";
import { getTimeZone } from "@/lib/learner";
import { useLearner } from "../learner-provider";
import * as practiceApi from "./practice-api";
import { canRequestHint, canSubmit, hintsUsed, type PracticeAction, type PracticeState } from "./practice-machine";

type ActionContext = {
  questionId: string | undefined;
  stateRef: RefObject<PracticeState>;
  dispatch: Dispatch<PracticeAction>;
  isAuthenticated: boolean;
  sessionId: RefObject<string | null>;
  clientAttemptId: RefObject<string>;
  startedAt: RefObject<number>;
};

// Everything a learner does with the current question: hint, answer,
// self-assess, save, report, and open the explanation.
export function usePracticeActions({ questionId, stateRef, dispatch, isAuthenticated, sessionId, clientAttemptId, startedAt }: ActionContext) {
  const { applyAttempt } = useLearner();
  const hintRequest = useRef<AbortController | null>(null);
  const viewedExplanations = useRef(new Set<string>());

  // A new question cancels any hint still loading for the previous one.
  useEffect(() => () => hintRequest.current?.abort(), [questionId]);

  const revealHint = useCallback(async () => {
    const current = stateRef.current;
    if (!current.question || !canRequestHint(current)) return;
    hintRequest.current?.abort();
    const controller = new AbortController();
    hintRequest.current = controller;
    dispatch({ type: "HINT_STARTED" });
    try {
      const hint = await practiceApi.fetchHint(current.question.id, current.hint.items.length, controller.signal);
      dispatch({ type: "HINT_SUCCEEDED", hint });
    } catch (cause) {
      if (!controller.signal.aborted) dispatch({ type: "HINT_FAILED", message: describeApiError(cause, "提示加载失败，请稍后再试。") });
    }
  }, [dispatch, stateRef]);

  const submit = useCallback(async () => {
    const current = stateRef.current;
    if (!canSubmit(current) || !current.question) return;
    const question = current.question;
    dispatch({ type: "SUBMIT_STARTED" });
    try {
      const result = await practiceApi.submitAttempt({
        questionId: question.id,
        response: question.options.length ? current.selected : current.written.trim(),
        ticket: question.ticket,
        ...(isAuthenticated ? {
          timeZone: getTimeZone(),
          sessionId: sessionId.current ?? undefined,
          clientAttemptId: clientAttemptId.current,
          secondsSpent: Math.round((Date.now() - startedAt.current) / 1000),
          hintsUsed: hintsUsed(current),
        } : {}),
      });
      dispatch({ type: "SUBMIT_SUCCEEDED", result });
      if (isAuthenticated) applyAttempt(result);
    } catch (cause) {
      dispatch({ type: "ACTION_FAILED", message: describeApiError(cause, "答案提交失败，请再试一次。") });
    }
  }, [applyAttempt, clientAttemptId, dispatch, isAuthenticated, sessionId, startedAt, stateRef]);

  const recordExplanationView = useCallback(async (attempt: AttemptResult | null = stateRef.current.result) => {
    if (!isAuthenticated || !attempt?.attemptId || attempt.isCorrect !== false || !attempt.explanation) return;
    if (viewedExplanations.current.has(attempt.attemptId)) return;
    viewedExplanations.current.add(attempt.attemptId);
    try {
      await practiceApi.recordExplanationViewed(attempt.attemptId);
    } catch {
      viewedExplanations.current.delete(attempt.attemptId);
    }
  }, [isAuthenticated, stateRef]);

  const selfAssess = useCallback(async (isCorrect: boolean, explanationOpen: boolean) => {
    const result = stateRef.current.result;
    if (!result || result.isCorrect !== null || stateRef.current.phase !== "reviewing") return;
    dispatch({ type: "ASSESS_STARTED" });
    if (!isAuthenticated || !result.attemptId) {
      dispatch({ type: "ASSESS_SUCCEEDED", isCorrect });
      return;
    }
    try {
      await practiceApi.submitSelfAssessment(result.attemptId, isCorrect, getTimeZone());
      dispatch({ type: "ASSESS_SUCCEEDED", isCorrect });
      if (!isCorrect && explanationOpen) void recordExplanationView({ ...result, isCorrect: false });
    } catch (cause) {
      dispatch({ type: "ACTION_FAILED", message: describeApiError(cause, "自评保存失败，请再试一次。") });
    }
  }, [dispatch, isAuthenticated, recordExplanationView, stateRef]);

  const toggleSaved = useCallback(async () => {
    const current = stateRef.current;
    if (!current.question || current.saving) return;
    const saved = !current.question.isSaved;
    dispatch({ type: "SAVE_STARTED" });
    try {
      await practiceApi.setQuestionSaved(current.question.id, saved);
      dispatch({ type: "SAVE_FINISHED", saved });
    } catch (cause) {
      dispatch({ type: "ACTION_FAILED", message: describeApiError(cause, "收藏状态保存失败，请再试一次。") });
    }
  }, [dispatch, stateRef]);

  const reportQuestion = useCallback(async () => {
    const current = stateRef.current;
    if (!current.question || current.report.submitting || current.report.submitted) return;
    dispatch({ type: "REPORT_STARTED" });
    try {
      await practiceApi.reportQuestion(current.question.id, current.report.category, current.report.detail);
      dispatch({ type: "REPORT_FINISHED", submitted: true });
    } catch (cause) {
      dispatch({ type: "ACTION_FAILED", message: describeApiError(cause, "问题反馈提交失败，请稍后再试。") });
    }
  }, [dispatch, stateRef]);

  return { revealHint, submit, selfAssess, recordExplanationView, toggleSaved, reportQuestion };
}
