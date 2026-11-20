import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { useT } from "@/i18n/client";
import { ApiClientError, describeApiError } from "@/lib/api-client";
import type { SessionSnapshot } from "@/lib/contracts/practice";
import { deferInitialization } from "@/lib/deferred-initialization";
import { DEFAULT_QUESTION_GOAL, type PracticeMode } from "@/lib/domain-constants";
import { getStoredPracticePreferences, practicePreferencesWithKnowledgeDefault, savePracticePreferences } from "@/lib/learner";
import { useAuth } from "@/lib/use-auth";
import * as practiceApi from "./practice-api";
import type { PracticeCatalog, PracticeFilters } from "./practice-api";
import { canAdvance, initialPracticeState, practiceReducer, roundComplete } from "./practice-machine";
import { usePracticeActions } from "./use-practice-actions";

export type { PracticeCatalog, PracticeFilters };

const FILTER_KEYS: Array<keyof PracticeFilters> = ["subject", "gradeBand", "grade", "difficulty", "type", "tags"];
const EMPTY_FILTERS: PracticeFilters = { subject: "", gradeBand: "", grade: "", difficulty: "", type: "", tags: "" };
const RESUMED_EXCLUSION_LIMIT = 20;

function filtersFromSearch(search: URLSearchParams): PracticeFilters {
  const gradeBand = search.get("gradeBand") ?? "";
  return {
    subject: search.get("subject") ?? "",
    gradeBand,
    grade: gradeBand ? search.get("grade") ?? "" : "",
    difficulty: search.get("difficulty") ?? "",
    type: search.get("type") ?? "",
    tags: search.get("tags") ?? "",
  };
}

// Changing a broader filter clears the narrower ones that may no longer apply.
export function cascadeFilterChange(filters: PracticeFilters, key: keyof PracticeFilters, value: string): PracticeFilters {
  const next = { ...filters, [key]: value };
  if (key === "gradeBand") return { ...next, grade: "", subject: "", tags: "" };
  if (key === "grade") return { ...next, subject: "", tags: "" };
  if (key === "subject") return { ...next, tags: "" };
  return next;
}

const EMPTY_CATALOG: PracticeCatalog = { subjects: [], gradeBands: [], grades: [], tagDimensions: [] };

export function usePracticeCatalog(filters: PracticeFilters) {
  const t = useT();
  const key = `${filters.subject}|${filters.gradeBand}|${filters.grade}`;
  // Loading is derived: the catalog is current only once this key has loaded.
  const [loaded, setLoaded] = useState<{ key: string | null; catalog: PracticeCatalog; error: string }>({
    key: null, catalog: EMPTY_CATALOG, error: "",
  });
  useEffect(() => {
    const controller = new AbortController();
    practiceApi.fetchPracticeCatalog({ subject: filters.subject, gradeBand: filters.gradeBand, grade: filters.grade }, controller.signal)
      .then((catalog) => setLoaded({ key, catalog, error: "" }))
      .catch((cause) => {
        if (!controller.signal.aborted) {
          setLoaded((current) => ({ key, catalog: current.catalog, error: describeApiError(cause, t("practice.filters.loadFailed"), t) }));
        }
      });
    return () => controller.abort();
  }, [filters.grade, filters.gradeBand, filters.subject, key, t]);
  return { catalog: loaded.catalog, loading: loaded.key !== key, error: loaded.key === key ? loaded.error : "" };
}

// Owns the round: filters, the server session, and question loading. Answer
// actions live in usePracticeActions and share this hook's refs.
export function usePracticeSession() {
  const search = useSearchParams();
  const auth = useAuth();
  const t = useT();
  const isAuthenticated = auth.status === "authenticated";
  const requestedMode: PracticeMode = search.get("mode") === "review" ? "review" : search.get("mode") === "adaptive" ? "adaptive" : "standard";
  const practiceMode: PracticeMode = isAuthenticated ? requestedMode : "standard";
  const [state, dispatch] = useReducer(practiceReducer, DEFAULT_QUESTION_GOAL, initialPracticeState);
  const [filters, setFilters] = useState<PracticeFilters>(() => filtersFromSearch(search));
  const stateRef = useRef(state);
  const filtersRef = useRef(filters);
  useEffect(() => {
    stateRef.current = state;
    filtersRef.current = filters;
  });

  const sessionId = useRef<string | null>(null);
  const sessionRequest = useRef<Promise<SessionSnapshot | null>>(Promise.resolve(null));
  const targetedQuestionId = useRef(search.get("questionId") ?? "");
  const questionRequest = useRef<AbortController | null>(null);
  const requestGeneration = useRef(0);
  const clientAttemptId = useRef("");
  const startedAt = useRef(0);
  const initialized = useRef(false);

  const resolveInitialFilters = useCallback(async (): Promise<PracticeFilters> => {
    const stored = isAuthenticated ? getStoredPracticePreferences() : null;
    let next = practicePreferencesWithKnowledgeDefault(stored, null);
    if (isAuthenticated && !stored && !targetedQuestionId.current) {
      try {
        next = practicePreferencesWithKnowledgeDefault(null, await practiceApi.fetchKnowledgeDefaults());
      } catch {
        // Profile recommendations are optional; practice remains available.
      }
    }
    for (const key of FILTER_KEYS) if (search.has(key)) next[key] = search.get(key) ?? "";
    if (search.has("gradeBand") && !search.has("grade")) next.grade = "";
    if (search.has("subject") && !search.has("tags")) next.tags = "";
    if (!next.gradeBand) next.grade = "";
    return next;
  }, [isAuthenticated, search]);

  const startSession = useCallback((nextFilters: PracticeFilters, restart = false) => {
    if (!isAuthenticated) {
      sessionId.current = null;
      return Promise.resolve(null);
    }
    const pending = sessionRequest.current.catch(() => null).then(async () => {
      try {
        const session = await practiceApi.startPracticeSession(nextFilters, practiceMode, restart);
        sessionId.current = session.id;
        dispatch({ type: "SESSION_SYNCED", session });
        return session;
      } catch {
        // A later queued request can still recover the active session.
        sessionId.current = null;
        return null;
      }
    });
    sessionRequest.current = pending;
    return pending;
  }, [isAuthenticated, practiceMode]);

  const loadQuestion = useCallback(async (
    nextFilters = filtersRef.current,
    excluded = stateRef.current.recent,
    requestedQuestionId = targetedQuestionId.current,
  ) => {
    const generation = ++requestGeneration.current;
    questionRequest.current?.abort();
    const controller = new AbortController();
    questionRequest.current = controller;
    dispatch({ type: "LOAD_STARTED" });
    try {
      const question = await practiceApi.fetchNextQuestion({
        filters: nextFilters, mode: practiceMode, excluded, questionId: requestedQuestionId, signal: controller.signal,
      });
      if (generation !== requestGeneration.current) return;
      if (targetedQuestionId.current === requestedQuestionId) targetedQuestionId.current = "";
      clientAttemptId.current = crypto.randomUUID();
      startedAt.current = Date.now();
      dispatch({ type: "LOAD_SUCCEEDED", question });
    } catch (cause) {
      if (controller.signal.aborted || generation !== requestGeneration.current) return;
      const notFound = cause instanceof ApiClientError && cause.kind === "not-found";
      dispatch({
        type: "LOAD_FAILED",
        message: notFound ? t("practice.errors.noMatch") : describeApiError(cause, t("practice.errors.loadFailed"), t),
      });
    }
  }, [practiceMode, t]);

  useEffect(() => {
    if (auth.status === "loading" || initialized.current) return;
    const cancelInitialization = deferInitialization(initialized, (isActive) => void (async () => {
      const initialFilters = await resolveInitialFilters();
      if (!isActive()) return;
      setFilters(initialFilters);
      if (isAuthenticated) savePracticePreferences(initialFilters);
      const session = await startSession(initialFilters);
      if (!isActive()) return;
      await loadQuestion(initialFilters, session?.recentQuestionIds.slice(0, RESUMED_EXCLUSION_LIMIT) ?? []);
    })());
    return () => { cancelInitialization(); questionRequest.current?.abort(); };
    // Initialization waits for Auth.js once, then the player owns its in-memory state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.status]);

  const applyFilters = useCallback((next: PracticeFilters) => {
    setFilters(next);
    if (isAuthenticated) savePracticePreferences(next);
    dispatch({ type: "ROUND_RESET" });
    void (async () => {
      const session = await startSession(next);
      await loadQuestion(next, session?.recentQuestionIds ?? []);
    })();
  }, [isAuthenticated, loadQuestion, startSession]);

  const nextQuestion = useCallback(async () => {
    const current = stateRef.current;
    if (!canAdvance(current)) return;
    if (roundComplete(current)) {
      dispatch({ type: "ROUND_RESET" });
      await startSession(filtersRef.current);
      await loadQuestion(filtersRef.current, []);
      return;
    }
    await loadQuestion();
  }, [loadQuestion, startSession]);

  const restartChallenge = useCallback(async () => {
    const current = stateRef.current;
    if (current.phase === "loading" || current.phase === "submitting") return;
    const confirmation = isAuthenticated ? t("practice.progress.confirmRestart") : t("practice.progress.confirmRestartGuest");
    if (current.completed > 0 && !window.confirm(confirmation)) return;
    dispatch({ type: "ROUND_RESET" });
    const session = await startSession(filtersRef.current, true);
    await loadQuestion(filtersRef.current, session?.recentQuestionIds ?? []);
  }, [isAuthenticated, loadQuestion, startSession, t]);

  const answerActions = usePracticeActions({ questionId: state.question?.id, stateRef, dispatch, isAuthenticated, sessionId, clientAttemptId, startedAt });

  return {
    state,
    dispatch,
    filters,
    isAuthenticated,
    practiceMode,
    actions: {
      ...answerActions,
      changeFilter: (key: keyof PracticeFilters, value: string) => applyFilters(cascadeFilterChange(filtersRef.current, key, value)),
      resetFilters: () => applyFilters(EMPTY_FILTERS),
      nextQuestion,
      restartChallenge,
      retry: () => void loadQuestion(),
    },
  };
}

export type PracticeActions = ReturnType<typeof usePracticeSession>["actions"];
