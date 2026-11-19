import { z } from "zod";
import { PRACTICE_MODES, REPORT_CATEGORIES } from "@/lib/domain-constants";

// Request and response shapes shared by API routes and client components. A
// route validates with the schema; a component imports the same response type,
// so server/client drift becomes a compile error instead of a runtime surprise.

const questionIdSchema = z.string().min(8).max(100);
const timeZoneSchema = z.string().max(100);

export const attemptRequestSchema = z.object({
  questionId: questionIdSchema,
  response: z.union([
    z.string().max(5000).refine((value) => value.trim().length > 0, "Response is required"),
    z.array(z.string().trim().min(1).max(10)).min(1).max(8),
  ]),
  secondsSpent: z.number().int().min(0).max(7200).optional(),
  hintsUsed: z.number().int().min(0).max(10).optional(),
  // Signed proof that /api/questions/next served this question; required to
  // grade as a guest.
  ticket: z.string().min(10).max(200).optional(),
  sessionId: z.string().min(8).max(100).optional(),
  clientAttemptId: z.uuid().optional(),
  timeZone: timeZoneSchema.optional(),
});
export type AttemptRequest = z.infer<typeof attemptRequestSchema>;

export const selfAssessmentRequestSchema = z.object({
  attemptId: z.string().min(8).max(100),
  isCorrect: z.boolean(),
  timeZone: timeZoneSchema.optional(),
});
export type SelfAssessmentRequest = z.infer<typeof selfAssessmentRequestSchema>;

export const explanationViewRequestSchema = z.object({
  event: z.literal("EXPLANATION_VIEWED"),
  attemptId: z.string().min(8).max(100),
});
export type ExplanationViewRequest = z.infer<typeof explanationViewRequestSchema>;

export const sessionRequestSchema = z.object({
  questionGoal: z.number().int().min(1).max(50).default(10),
  filters: z.record(z.string().max(40), z.string().max(1000))
    .refine((filters) => Object.keys(filters).length <= 16, "Too many session filters")
    .default({}),
  restart: z.boolean().default(false),
});
export type SessionRequest = z.input<typeof sessionRequestSchema>;

export const savedQuestionRequestSchema = z.object({
  questionId: questionIdSchema,
  saved: z.boolean(),
});

export const reviewItemRequestSchema = z.object({
  questionId: questionIdSchema,
  action: z.literal("DISMISS"),
});

export const reportRequestSchema = z.object({
  questionId: questionIdSchema,
  category: z.enum(REPORT_CATEGORIES),
  detail: z.string().trim().max(1000).optional(),
});
export type ReportRequest = z.infer<typeof reportRequestSchema>;

export const hintQuerySchema = z.object({
  questionId: questionIdSchema,
  step: z.coerce.number().int().min(0).max(9).default(0),
});

export type HintPayload = {
  kind: "HINT" | "STRATEGY";
  hint: string;
  step: number;
  total: number;
};

export const timeZoneQuerySchema = z.object({
  timeZone: timeZoneSchema.optional(),
});

export const practiceModeSchema = z.enum(PRACTICE_MODES);

export type AssetReference = { path: string; altText: string };

export type QuestionPayload = {
  id: string;
  stem: string;
  type: string;
  typeLabel: string;
  difficulty: string;
  isAutoGradable: boolean;
  // True only when the question has question-specific hints; otherwise the
  // client can still offer the generic solving strategy.
  hasHint: boolean;
  hintCount: number;
  subject: { name: string; slug: string; color: string };
  grade: string;
  stemAsset: AssetReference | null;
  options: Array<{ label: string; content: string; asset: AssetReference | null }>;
  tags: Array<{ dimension: string; slug: string; label: string }>;
  isSaved: boolean;
  recommendationReason: string | null;
  // The signed-in learner's earlier attempts at this question.
  history: QuestionHistorySummary | null;
  ticket: string;
};

export type QuestionHistorySummary = { attempts: number; correct: number; lastResult: boolean | null; lastAttemptAt: string };

export type QuestionHistoryPayload = {
  attempts: Array<{ createdAt: string; isCorrect: boolean | null; response: string | string[]; secondsSpent: number | null; hintsUsed: number }>;
};

export type SessionProgress = {
  id: string;
  status: string;
  questionGoal: number;
  completedCount: number;
  correctCount: number;
  earnedXp: number;
};

export type AttemptResult = {
  attemptId: string | null;
  isCorrect: boolean | null;
  correctLabels: string[];
  answer: string;
  explanation: string | null;
  earnedXp: number;
  totalXp: number;
  level: number;
  currentStreak: number;
  streakFreezes: number;
  streakFreezeUsed: boolean;
  todayAttempts: number;
  newBadges: Array<{ name: string; icon: string }>;
  session: SessionProgress | null;
  replayed: boolean;
  persisted: boolean;
};

export type SessionSnapshot = SessionProgress & {
  recentQuestionIds: string[];
  resumed: boolean;
};

export type LearnerSnapshot = {
  xp: number;
  level: number;
  currentStreak: number;
  bestStreak: number;
  streakFreezes: number;
  todayAttempts: number;
};

export type CatalogPayload = {
  subjects: Array<{ slug: string; name: string }>;
  gradeBands: Array<{ slug: string; name: string }>;
  grades: Array<{ slug: string; name: string }>;
  tagDimensions: Array<{ key: string; label: string; tags: Array<{ slug: string; label: string }> }>;
  topics: Array<{ slug: string; label: string }>;
};

export const activitySummaryQuerySchema = z.object({
  timeZone: timeZoneSchema.optional(),
  days: z.coerce.number().int().min(1).max(28).default(7),
});

export type LearnerActivitySummary = {
  activity: Array<{ date: string; attempts: number; correct: number; earnedXp: number }>;
};

export type ProgressPayload = {
  summary: { totalAttempts: number; correctRate: number; xp: number; level: number; currentStreak: number; bestStreak: number };
  activity: Array<{ date: string; attempts: number; correct: number; earnedXp: number }>;
  subjects: Array<{ slug: string; label: string; color?: string; attempts: number; correct: number; accuracy: number }>;
  weakTopics: Array<{ slug: string; subject: string; label: string; attempts: number; correct: number; accuracy: number }>;
  recentMistakes: Array<{ id: string; stem: string; subject: string; subjectColor: string; grade: string; dueAt: string; isDue: boolean }>;
  badges: Array<{ slug: string; name: string; description: string; icon: string; earnedAt: string | null }>;
  sessions: Array<{ id: string; status: string; completedCount: number; questionGoal: number; correctCount: number; earnedXp: number; startedAt: string }>;
};

export type ReviewQuestionCard = {
  id: string;
  stem: string;
  type: string;
  difficulty: string;
  subject: { slug: string; name: string; color: string };
  grade: string;
  tags: Array<{ slug: string; label: string }>;
};

export type ReviewPayload = {
  dueCount: number;
  activeCount: number;
  savedCount: number;
  reviews: Array<ReviewQuestionCard & {
    dueAt: string;
    isDue: boolean;
    intervalDays: number;
    repetitions: number;
    lastResult: boolean | null;
    isSaved: boolean;
  }>;
  saved: Array<ReviewQuestionCard & { savedAt: string; isInReview: boolean; reviewIsDue: boolean }>;
};

export type BrowsePayload = {
  page: number;
  pageSize: number;
  total: number;
  items: Array<{
    id: string;
    stem: string;
    subject: { slug: string; name: string; color: string };
    grade: string;
    difficulty: string;
    type: string;
    problemNumber: number | null;
    attempts: number;
    lastResult: boolean | null;
  }>;
};
