import { describe, expect, it } from "vitest";
import { clipBeforeResult, deriveQuestionHints } from "./hint-derivation";

describe("hint derivation", () => {
  it("keeps the setup of a contest solution and drops the computation", () => {
    const hints = deriveQuestionHints({
      solutions: ["将 $\\frac{10^{2000}+10^{2002}}{10^{2001}+10^{2001}}$ 因式分解可得 $\\frac{101}{20}$，所以答案为 $\\textbf{(D)}$。"],
      answer: "D",
      isContestSource: true,
    });
    expect(hints).toEqual([{ kind: "FIRST_STEP", content: "可以先从这里入手：将 $\\frac{10^{2000}+10^{2002}}{10^{2001}+10^{2001}}$ 因式分解……" }]);
  });

  it("never cuts inside a formula and drops formulas that contain a result", () => {
    expect(clipBeforeResult("数 $x$ 与其倒数相差 1，当且仅当 $x-1=1/x$ 或 $x+1=1/x$。")).toBe("数 $x$ 与其倒数相差 1");
    expect(clipBeforeResult("$\\dfrac{10^{7}}{5 \\times 10^{4}}=200$")).toBe("");
  });

  it("rejects openings that state a conclusion, an option, or the answer", () => {
    const contest = (solution: string, answer = "C") => deriveQuestionHints({ solutions: [solution], answer, isContestSource: true });
    expect(contest("该面积大于 $30$ 且小于 $54$，所以正确选项必为 $(C)$。")).toEqual([{ kind: "FIRST_STEP", content: "可以先从这里入手：该面积大于 $30$ 且小于 $54$……" }]);
    expect(contest("A、空气、糖水都是由多种物质组成的，属于混合物；")).toEqual([]);
    expect(contest("故答案为 12。", "12")).toEqual([]);
    expect(contest("先求出总人数是 1234 人。", "1234")).toEqual([]);
  });

  it("keeps the leading 解 of 解决 when stripping solution labels", () => {
    expect(deriveQuestionHints({ solutions: ["解决此题最直接的方法是逐一枚举。"], answer: "B", isContestSource: true }))
      .toEqual([{ kind: "FIRST_STEP", content: "可以先从这里入手：解决此题最直接的方法是逐一枚举……" }]);
  });

  it("uses the stated focus for any subject but first steps only for contest sources", () => {
    const hints = deriveQuestionHints({
      solutions: ["本题考查的知识点是红光外侧存在不可见光。太阳光由七种色光组成，故答案为：B"],
      answer: "B",
      isContestSource: false,
    });
    expect(hints).toEqual([{ kind: "FOCUS", content: "这道题考查：红光外侧存在不可见光。" }]);
    expect(deriveQuestionHints({ solutions: ["余数是3，除数最小是4。"], answer: "4", isContestSource: false })).toEqual([]);
    expect(deriveQuestionHints({ solutions: [], answer: "A", isContestSource: true })).toEqual([]);
  });
});
