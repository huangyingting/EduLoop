import { describe, expect, it } from "vitest";
import { tokenizeMathContent } from "./math-content";

describe("tokenizeMathContent", () => {
  it("separates prose, inline math, and figures", () => {
    expect(tokenizeMathContent(
      "Before $x+1$ then $$y=2$$ [Figure: /question-assets/source/amc/example.png] after",
    )).toEqual([
      { kind: "text", value: "Before " },
      { kind: "inline-math", value: "x+1" },
      { kind: "text", value: " then " },
      { kind: "inline-math", value: "y=2" },
      { kind: "text", value: " " },
      { kind: "figure", value: "[Figure: /question-assets/source/amc/example.png]" },
      { kind: "text", value: " after" },
    ]);
  });

  it("keeps legacy double-dollar formulas inline inside prose", () => {
    expect(tokenizeMathContent(
      "小明的妈妈身高$$160cm$$，她照了一张照片，照片上的她身高$$4cm$$。",
    )).toEqual([
      { kind: "text", value: "小明的妈妈身高" },
      { kind: "inline-math", value: "160cm" },
      { kind: "text", value: "，她照了一张照片，照片上的她身高" },
      { kind: "inline-math", value: "4cm" },
      { kind: "text", value: "。" },
    ]);
  });

  it("treats a double-dollar formula occupying its own line as display math", () => {
    expect(tokenizeMathContent("Before\n$$y=2$$\nafter")).toEqual([
      { kind: "text", value: "Before\n" },
      { kind: "display-math", value: "y=2" },
      { kind: "text", value: "\nafter" },
    ]);
  });

  it("keeps nested-dollar boxed answers in one math token", () => {
    const formula = "$x+\\boxed{{\\textbf{(A)~$\\frac{3}{8}$}}}$";
    expect(tokenizeMathContent(formula)).toEqual([{
      kind: "inline-math",
      value: "x+\\boxed{{\\textbf{(A)~$\\frac{3}{8}$}}}",
    }]);
  });

  it("leaves escaped and unmatched dollars as prose", () => {
    expect(tokenizeMathContent("Price \\$5 and an unmatched $formula")).toEqual([
      { kind: "text", value: "Price \\$5 and an unmatched $formula" },
    ]);
  });
});
