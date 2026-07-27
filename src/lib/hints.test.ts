import { describe, expect, it } from "vitest";
import { buildQuestionHint } from "./hints";

describe("question hints", () => {
  it("uses topic and type without exposing answer content", () => {
    const hint = buildQuestionHint({
      type: "SINGLE_CHOICE",
      difficulty: "MEDIUM",
      tags: [{ tag: { label: "图形与几何", dimension: { key: "TOPIC" } } }],
    });
    expect(hint).toContain("图形与几何");
    expect(hint).toContain("逐项排除");
    expect(hint).not.toMatch(/答案|故选|正确选项/);
  });

  it("adds a decomposition strategy for hard questions", () => {
    expect(buildQuestionHint({ type: "COMPUTATION", difficulty: "HARD" }))
      .toContain("画简图、列中间量");
  });
});
