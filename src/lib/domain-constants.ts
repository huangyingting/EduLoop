// Every persisted status, role, and category value lives here. Prisma stores
// them as portable strings, so these constants are the only guard against a
// typo that would otherwise compile and silently match nothing.

export const QUESTION_STATUS = {
  PUBLISHED: "PUBLISHED",
  NEEDS_REVIEW: "NEEDS_REVIEW",
  RETIRED: "RETIRED",
} as const;
export type QuestionStatus = (typeof QUESTION_STATUS)[keyof typeof QUESTION_STATUS];

export const ASSET_REVIEW_STATUS = {
  DRAFT: "DRAFT",
  APPROVED: "APPROVED",
} as const;
export type AssetReviewStatus = (typeof ASSET_REVIEW_STATUS)[keyof typeof ASSET_REVIEW_STATUS];

export const TAG_SOURCE = {
  IMPORT: "IMPORT",
  RULE: "RULE",
  CURATED: "CURATED",
} as const;
export type TagSource = (typeof TAG_SOURCE)[keyof typeof TAG_SOURCE];

export const TAG_DIMENSION = {
  TOPIC: "TOPIC",
  SKILL: "SKILL",
  FORMAT: "FORMAT",
} as const;

export const DIFFICULTY = {
  EASY: "EASY",
  MEDIUM: "MEDIUM",
  HARD: "HARD",
} as const;
export type Difficulty = (typeof DIFFICULTY)[keyof typeof DIFFICULTY];

export const QUESTION_TYPE = {
  SINGLE_CHOICE: "SINGLE_CHOICE",
  MULTIPLE_CHOICE: "MULTIPLE_CHOICE",
  TRUE_FALSE: "TRUE_FALSE",
  FILL_BLANK: "FILL_BLANK",
  COMPUTATION: "COMPUTATION",
  EXPERIMENT: "EXPERIMENT",
  WRITTEN_RESPONSE: "WRITTEN_RESPONSE",
} as const;
export type QuestionType = (typeof QUESTION_TYPE)[keyof typeof QUESTION_TYPE];

export const REVIEW_ITEM_STATUS = {
  ACTIVE: "ACTIVE",
  MASTERED: "MASTERED",
  DISMISSED: "DISMISSED",
} as const;
export type ReviewItemStatus = (typeof REVIEW_ITEM_STATUS)[keyof typeof REVIEW_ITEM_STATUS];

export const PRACTICE_SESSION_STATUS = {
  ACTIVE: "ACTIVE",
  COMPLETED: "COMPLETED",
  ABANDONED: "ABANDONED",
} as const;
export type PracticeSessionStatus = (typeof PRACTICE_SESSION_STATUS)[keyof typeof PRACTICE_SESSION_STATUS];

export const REPORT_STATUS = {
  OPEN: "OPEN",
  RESOLVED: "RESOLVED",
} as const;
export type ReportStatus = (typeof REPORT_STATUS)[keyof typeof REPORT_STATUS];

export const REPORT_CATEGORIES = ["WRONG_ANSWER", "MISSING_FIGURE", "UNCLEAR", "FORMATTING", "OTHER"] as const;
export type ReportCategory = (typeof REPORT_CATEGORIES)[number];

export const CONTENT_REVIEW_ACTION = {
  QUARANTINE: "QUARANTINE",
  RESOLVE: "RESOLVE",
  REOPEN: "REOPEN",
} as const;
export type ContentReviewActionName = (typeof CONTENT_REVIEW_ACTION)[keyof typeof CONTENT_REVIEW_ACTION];

export const USER_ROLE = {
  LEARNER: "LEARNER",
  CONTENT_EDITOR: "CONTENT_EDITOR",
  ADMIN: "ADMIN",
} as const;
export type UserRole = (typeof USER_ROLE)[keyof typeof USER_ROLE];

export const PRACTICE_MODES = ["standard", "review", "adaptive"] as const;
export type PracticeMode = (typeof PRACTICE_MODES)[number];

// Questions per practice round; the server session stores its own goal.
export const DEFAULT_QUESTION_GOAL = 10;
