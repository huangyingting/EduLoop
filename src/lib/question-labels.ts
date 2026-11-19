import type { Translator } from "@/i18n/messages";
import { zhCN } from "@/i18n/messages/zh-CN";
import { DIFFICULTY, QUESTION_TYPE, type Difficulty, type QuestionType } from "@/lib/domain-constants";

// Display labels shared by server responses and client components. This module
// has no server-only dependencies so the browser bundle can import it.

// Default-locale labels; the server and content import use these. The browser
// renders the learner's language through the localized helpers below.
const DEFAULT_LABELS = zhCN.labels;

export const DIFFICULTIES = [
  { key: DIFFICULTY.EASY, source: "容易", label: DEFAULT_LABELS.difficulty.EASY, dot: "●" },
  { key: DIFFICULTY.MEDIUM, source: "一般", label: DEFAULT_LABELS.difficulty.MEDIUM, dot: "●●" },
  { key: DIFFICULTY.HARD, source: "困难", label: DEFAULT_LABELS.difficulty.HARD, dot: "●●●" },
] as const;

export const DIFFICULTY_LABELS: Record<string, string> = Object.fromEntries(
  DIFFICULTIES.map(({ key, label }) => [key, label]),
);

export const QUESTION_TYPE_LABELS: Record<string, string> = { ...DEFAULT_LABELS.questionType };

export function difficultyLabel(difficulty: string) {
  return DIFFICULTY_LABELS[difficulty] ?? DIFFICULTY_LABELS[DIFFICULTY.MEDIUM];
}

function isQuestionType(value: string): value is QuestionType {
  return Object.hasOwn(QUESTION_TYPE, value);
}

function isDifficulty(value: string): value is Difficulty {
  return Object.hasOwn(DIFFICULTY, value);
}

export function localizedQuestionType(t: Translator, type: string, fallback = type) {
  return isQuestionType(type) ? t(`labels.questionType.${type}`) : fallback;
}

export function localizedDifficulty(t: Translator, difficulty: string) {
  return t(`labels.difficulty.${isDifficulty(difficulty) ? difficulty : DIFFICULTY.MEDIUM}`);
}

export function localizedQuestionTypeOptions(t: Translator) {
  return Object.values(QUESTION_TYPE).map((value) => ({ value, label: t(`labels.questionType.${value}`) }));
}

export function localizedDifficultyOptions(t: Translator) {
  return DIFFICULTIES.map(({ key }) => ({ value: key, label: t(`labels.difficulty.${key}`) }));
}
