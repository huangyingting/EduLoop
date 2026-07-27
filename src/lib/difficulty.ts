export const DIFFICULTY_AUDIT_VERSION = 1;

export type Difficulty = "EASY" | "MEDIUM" | "HARD";

export type DifficultyAuditInput = {
  sourceDifficulty: Difficulty;
  gradeOrder: number;
  type: string;
  stem: string;
  answer: string;
  explanation: string | null;
  options: string[];
};

export type DifficultyAudit = {
  sourceDifficulty: Difficulty;
  recommendedDifficulty: Difficulty;
  difficulty: Difficulty;
  score: number;
  confidence: number;
  reason: string;
  changed: boolean;
  version: number;
};

const TYPE_LOAD: Record<string, number> = {
  TRUE_FALSE: 0.25,
  SINGLE_CHOICE: 0.45,
  FILL_BLANK: 0.65,
  MULTIPLE_CHOICE: 0.85,
  COMPUTATION: 1.1,
  WRITTEN_RESPONSE: 1.3,
  EXPERIMENT: 1.35,
};

function occurrences(value: string, pattern: RegExp) {
  return value.match(pattern)?.length ?? 0;
}

export function auditQuestionDifficulty(input: DifficultyAuditInput): DifficultyAudit {
  const optionText = input.options.join(" ");
  const combined = `${input.stem} ${optionText}`;
  const multipart = occurrences(input.stem, /(?:（|\()\s*[1-9][）)]|[①②③④⑤⑥⑦⑧⑨]/g);
  const assertions = occurrences(combined, /[①②③④⑤⑥⑦⑧⑨]/g);
  const blanks = occurrences(input.stem, /_{2,}|______|（\s*）|\(\s*\)/g);
  const formulaLoad = occurrences(combined, /\\(?:frac|sqrt|begin|sum|int|log|ln)|\$\$|\b(?:sin|cos|tan)\b|[≤≥∑√]/gi);
  const reasoningLoad = occurrences(input.stem, /证明|求证|推导|探究|设计|方案|分析|解释|说明理由|分类讨论|综合|最值|取值范围/g);
  const operationLoad = occurrences(input.stem, /增(?:加|产)|减(?:少|产)|提高|降低|先.+再|至少|至多|连续|分别|依次|百分|[%％]/g);
  const optionLength = optionText.length;
  const responseLength = input.answer.length + (input.explanation?.length ?? 0);
  const reasons = [`${input.type.toLowerCase().replaceAll("_", " ")} response`];
  let score = TYPE_LOAD[input.type] ?? 1;

  if (multipart >= 2) { score += 0.7; reasons.push("multiple sub-questions"); }
  if (multipart >= 4) score += 0.5;
  if (assertions >= 3) { score += 0.4; reasons.push("several assertions to evaluate"); }
  if (blanks >= 3) { score += 0.35; reasons.push("several required results"); }
  if (input.stem.length > 180) { score += 0.3; reasons.push("extended prompt"); }
  if (input.stem.length > 350) score += 0.3;
  if (input.stem.length > 700) score += 0.3;
  if (optionLength > 180) { score += 0.3; reasons.push("dense answer choices"); }
  if (optionLength > 360) score += 0.35;
  if (formulaLoad >= 4) { score += 0.25; reasons.push("multi-expression reasoning"); }
  if (formulaLoad >= 10) score += 0.25;
  if (reasoningLoad >= 1) { score += 0.3; reasons.push("explanation or derivation required"); }
  if (reasoningLoad >= 3) score += 0.3;
  if (operationLoad >= 2) { score += 0.45; reasons.push("multiple quantitative transformations"); }
  if (responseLength > 350) score += 0.2;
  if (responseLength > 800) score += 0.2;

  const simpleDirect = ["TRUE_FALSE", "SINGLE_CHOICE", "FILL_BLANK"].includes(input.type)
    && input.stem.length < 60
    && optionLength < 150
    && multipart === 0
    && reasoningLoad === 0
    && operationLoad < 2
    && formulaLoad < 3
    && assertions < 3;
  if (simpleDirect) { score -= 0.25; reasons.push("short direct recall or one-step prompt"); }
  if (simpleDirect && input.gradeOrder <= 6) score -= 0.1;
  score = Math.max(0, Math.round(score * 100) / 100);

  const recommendedDifficulty: Difficulty = score < 0.85 ? "EASY" : score < 2.35 ? "MEDIUM" : "HARD";
  let confidence = 0.95;
  if (recommendedDifficulty !== input.sourceDifficulty) {
    if (recommendedDifficulty === "EASY") confidence = simpleDirect ? 0.9 : score < 0.6 ? 0.82 : 0.7;
    else if (recommendedDifficulty === "HARD") confidence = multipart >= 2 ? 0.92 : reasoningLoad >= 3 ? 0.85 : 0.72;
    else if (input.sourceDifficulty === "HARD" && score < 1.65) confidence = 0.86;
    else if (input.sourceDifficulty === "EASY" && score > 1.35) confidence = 0.84;
    else confidence = 0.72;
  }
  const difficulty = recommendedDifficulty === input.sourceDifficulty || confidence >= 0.8
    ? recommendedDifficulty
    : input.sourceDifficulty;
  if (difficulty !== recommendedDifficulty) reasons.push("source label retained because evidence is not decisive");

  return {
    sourceDifficulty: input.sourceDifficulty,
    recommendedDifficulty,
    difficulty,
    score,
    confidence,
    reason: reasons.join("; "),
    changed: difficulty !== input.sourceDifficulty,
    version: DIFFICULTY_AUDIT_VERSION,
  };
}
