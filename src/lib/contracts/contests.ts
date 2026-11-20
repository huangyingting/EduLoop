import { z } from "zod";
import type { CONTEST_SESSION_STATUS } from "@/lib/domain-constants";
import type { AssetReference } from "./practice";

export const contestLevelSchema = z.enum(["AMC-8", "AMC-10", "AMC-12"]);

export const startContestRequestSchema = z.object({ paperKey: z.string().regex(/^[0-9]{4}-[a-z0-9-]{3,20}$/) });

export const saveContestAnswersRequestSchema = z.object({
  sessionId: z.string().min(8).max(100),
  // Problem number -> option label, or null to clear an answer.
  answers: z.record(z.string().regex(/^\d{1,2}$/), z.string().regex(/^[A-E]$/).nullable())
    .refine((answers) => Object.keys(answers).length <= 30, "Too many answers"),
});

export const submitContestRequestSchema = z.object({ sessionId: z.string().min(8).max(100) });

export type ContestPaperSummary = {
  key: string;
  year: number;
  contest: string;
  level: string;
  questionCount: number;
  durationMinutes: number;
  available: boolean;
  bestScore: number | null;
  attempts: number;
};

export type ContestListPayload = {
  papers: ContestPaperSummary[];
  activeSession: { id: string; paperKey: string; deadlineAt: string } | null;
};

export type ContestQuestion = {
  number: number;
  questionId: string;
  stem: string;
  stemAsset: AssetReference | null;
  options: Array<{ label: string; content: string; asset: AssetReference | null }>;
};

export type ContestSessionView = {
  status: typeof CONTEST_SESSION_STATUS.ACTIVE;
  id: string;
  paper: { key: string; contest: string; year: number; level: string; durationMinutes: number };
  startedAt: string;
  deadlineAt: string;
  answers: Record<string, string>;
  questions: ContestQuestion[];
};

export type ContestResultView = {
  status: typeof CONTEST_SESSION_STATUS.SUBMITTED;
  id: string;
  paper: { key: string; contest: string; year: number; level: string; durationMinutes: number };
  submittedAt: string;
  score: number;
  maxScore: number;
  correct: number;
  blank: number;
  wrong: number;
  problems: Array<{
    number: number;
    questionId: string;
    stem: string;
    response: string | null;
    correctLabels: string[];
    isCorrect: boolean | null;
    answer: string;
    explanation: string | null;
    topics: string[];
  }>;
  topics: Array<{ label: string; correct: number; total: number }>;
};
