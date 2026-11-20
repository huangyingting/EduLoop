export type GradableQuestion = {
  isAutoGradable: boolean;
  correctAnswer: string | null;
  options: Array<{ label: string }>;
};

export type GradingResult =
  | { ok: true; isCorrect: boolean | null; correctLabels: string[] }
  | { ok: false; reason: "RESPONSE_TYPE" | "UNKNOWN_OPTION" };

export function correctLabelsFor(question: Pick<GradableQuestion, "correctAnswer">) {
  return question.correctAnswer ? JSON.parse(question.correctAnswer) as string[] : [];
}

// Choice questions must be answered with option labels and written questions
// with text. Only high-confidence answer keys grade automatically; everything
// else returns null so the learner self-assesses against the reference answer.
export function gradeResponse(question: GradableQuestion, response: string | string[]): GradingResult {
  const optionResponse = Array.isArray(response);
  if (optionResponse !== (question.options.length > 0)) return { ok: false, reason: "RESPONSE_TYPE" };
  const correctLabels = correctLabelsFor(question);
  if (!Array.isArray(response)) {
    return { ok: true, isCorrect: question.isAutoGradable ? false : null, correctLabels };
  }
  const validLabels = new Set(question.options.map(({ label }) => label.toUpperCase()));
  if (response.some((label) => !validLabels.has(label.toUpperCase()))) return { ok: false, reason: "UNKNOWN_OPTION" };
  if (!question.isAutoGradable) return { ok: true, isCorrect: null, correctLabels };
  const responseLabels = [...new Set(response.map((item) => item.toUpperCase()))].sort();
  const isCorrect = JSON.stringify(responseLabels) === JSON.stringify([...correctLabels].sort());
  return { ok: true, isCorrect, correctLabels };
}
