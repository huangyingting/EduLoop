import { apiRequest } from "@/lib/api-client";
import type { AttemptResult, CatalogPayload, QuestionPayload, SessionSnapshot } from "@/lib/contracts/practice";
import { DEFAULT_QUESTION_GOAL, type PracticeMode } from "@/lib/domain-constants";

// Typed calls the practice player makes. Each function maps to one API route
// and throws ApiClientError on failure; the session hook decides what to show.

export type PracticeFilters = { subject: string; gradeBand: string; grade: string; difficulty: string; type: string; tags: string };
export type PracticeCatalog = Omit<CatalogPayload, "topics">;

export function fetchPracticeCatalog(filters: Pick<PracticeFilters, "subject" | "gradeBand" | "grade">, signal: AbortSignal) {
  return apiRequest<PracticeCatalog>("/api/catalog", { query: filters, signal });
}

export function fetchKnowledgeDefaults() {
  return apiRequest<{ knowledgeBand: string | null; knowledgeGrade: string | null }>("/api/learner/profile");
}

export function startPracticeSession(filters: PracticeFilters, mode: PracticeMode, restart: boolean) {
  return apiRequest<SessionSnapshot>("/api/sessions", {
    method: "POST",
    body: { questionGoal: DEFAULT_QUESTION_GOAL, filters: { ...filters, mode }, restart },
  });
}

export function fetchNextQuestion(input: {
  filters: PracticeFilters;
  mode: PracticeMode;
  excluded: string[];
  questionId: string;
  signal: AbortSignal;
}) {
  return apiRequest<QuestionPayload>("/api/questions/next", {
    query: {
      ...input.filters,
      questionId: input.questionId || undefined,
      mode: input.mode !== "standard" ? input.mode : undefined,
      exclude: input.excluded.length ? input.excluded.join(",") : undefined,
    },
    signal: input.signal,
  });
}

export function fetchHint(questionId: string, signal: AbortSignal) {
  return apiRequest<{ hint: string | null }>("/api/questions/hint", { query: { questionId }, signal });
}

export function submitAttempt(body: {
  questionId: string;
  response: string | string[];
  timeZone?: string;
  sessionId?: string;
  clientAttemptId?: string;
  secondsSpent?: number;
}) {
  return apiRequest<AttemptResult>("/api/attempts", { method: "POST", body });
}

export function submitSelfAssessment(attemptId: string, isCorrect: boolean, timeZone: string) {
  return apiRequest<{ isCorrect: boolean }>("/api/attempts", { method: "PATCH", body: { attemptId, timeZone, isCorrect } });
}

export function recordExplanationViewed(attemptId: string) {
  return apiRequest("/api/attempts", { method: "PATCH", body: { event: "EXPLANATION_VIEWED", attemptId } });
}

export function setQuestionSaved(questionId: string, saved: boolean) {
  return apiRequest<{ saved: boolean }>("/api/review", { method: "POST", body: { questionId, saved } });
}

export function reportQuestion(questionId: string, category: string, detail: string) {
  return apiRequest("/api/reports", { method: "POST", body: { questionId, category, detail: detail.trim() || undefined } });
}
