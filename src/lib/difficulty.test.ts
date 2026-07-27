import { describe, expect, it } from "vitest";
import { auditQuestionDifficulty } from "./difficulty";

const base = {
  sourceDifficulty: "MEDIUM" as const,
  gradeOrder: 8,
  type: "SINGLE_CHOICE",
  stem: "下列说法正确的是（ ）",
  answer: "A",
  explanation: null,
  options: ["选项一", "选项二", "选项三", "选项四"],
};

describe("question difficulty audit", () => {
  it("corrects a clearly simple source-hard question", () => {
    expect(auditQuestionDifficulty({
      ...base,
      sourceDifficulty: "HARD",
      gradeOrder: 2,
      stem: "1只螃蟹8条腿，8只螃蟹有多少条腿？",
    })).toMatchObject({ difficulty: "EASY", recommendedDifficulty: "EASY", changed: true, confidence: 0.9 });
  });

  it("promotes a multi-part derivation mislabeled easy", () => {
    const result = auditQuestionDifficulty({
      ...base,
      sourceDifficulty: "EASY",
      type: "WRITTEN_RESPONSE",
      stem: `${"阅读材料并综合分析。".repeat(40)}（1）证明结论；（2）分类讨论参数；（3）求最值；（4）说明理由。`,
      answer: "需要完成多步推导。",
      explanation: "证明并分类讨论。".repeat(60),
      options: [],
    });
    expect(result).toMatchObject({ difficulty: "HARD", recommendedDifficulty: "HARD", changed: true, confidence: 0.92 });
  });

  it("recognizes repeated percentage changes in a short prompt", () => {
    expect(auditQuestionDifficulty({
      ...base,
      sourceDifficulty: "HARD",
      gradeOrder: 6,
      stem: "去年增产20%，今年减产20%，今年产量是多少？",
    })).toMatchObject({ difficulty: "MEDIUM", recommendedDifficulty: "MEDIUM", changed: true });
  });

  it("downgrades a concise computation by one level", () => {
    const result = auditQuestionDifficulty({
      ...base,
      sourceDifficulty: "HARD",
      type: "COMPUTATION",
      stem: "计算并写出必要步骤。",
      options: [],
    });
    expect(result.recommendedDifficulty).toBe("MEDIUM");
    expect(result.difficulty).toBe("MEDIUM");
    expect(result.confidence).toBeGreaterThanOrEqual(0.8);
  });
});
