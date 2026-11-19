import { DIFFICULTY, QUESTION_TYPE } from "@/lib/domain-constants";

// Display labels shared by server responses and client components. This module
// has no server-only dependencies so the browser bundle can import it.

export const DIFFICULTIES = [
  { key: DIFFICULTY.EASY, source: "容易", label: "热身", dot: "●" },
  { key: DIFFICULTY.MEDIUM, source: "一般", label: "进阶", dot: "●●" },
  { key: DIFFICULTY.HARD, source: "困难", label: "挑战", dot: "●●●" },
] as const;

export const DIFFICULTY_LABELS: Record<string, string> = Object.fromEntries(
  DIFFICULTIES.map(({ key, label }) => [key, label]),
);

export const QUESTION_TYPE_LABELS: Record<string, string> = {
  [QUESTION_TYPE.SINGLE_CHOICE]: "单项选择",
  [QUESTION_TYPE.MULTIPLE_CHOICE]: "多项选择",
  [QUESTION_TYPE.TRUE_FALSE]: "判断",
  [QUESTION_TYPE.FILL_BLANK]: "填空",
  [QUESTION_TYPE.COMPUTATION]: "计算",
  [QUESTION_TYPE.EXPERIMENT]: "实验探究",
  [QUESTION_TYPE.WRITTEN_RESPONSE]: "解答",
};

export function difficultyLabel(difficulty: string) {
  return DIFFICULTY_LABELS[difficulty] ?? DIFFICULTY_LABELS[DIFFICULTY.MEDIUM];
}
