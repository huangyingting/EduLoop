import assert from "node:assert/strict";
import test from "node:test";
import { knownMathTranslation, protectedLatexSegments } from "./amc-latex.mjs";

test("finds independent inline formulas", () => {
  assert.deepEqual(
    protectedLatexSegments("compare $x$ and $y$").map(({ kind, value }) => ({ kind, value })),
    [{ kind: "math", value: "$x$" }, { kind: "math", value: "$y$" }],
  );
});

test("keeps nested-dollar answer formulas together", () => {
  const formula = "$x+\\boxed{{\\textbf{(A)~$\\frac{3}{8}$}}}$";
  assert.equal(protectedLatexSegments(formula)[0]?.value, formula);
});

test("protects bare LaTeX environments and Asymptote", () => {
  const value = "\\begin{align*}x&=1\\\\y&=2\\end{align*}\n[asy] draw((0,0)); [/asy]";
  assert.deepEqual(protectedLatexSegments(value).map(({ kind }) => kind), ["environment", "asy"]);
});

test("uses math-specific translations for ambiguous terms", () => {
  assert.equal(knownMathTranslation(" OR "), " 或 ");
  assert.equal(knownMathTranslation("sin"), "sin");
  assert.equal(knownMathTranslation("LCM"), "最小公倍数");
  assert.equal(knownMathTranslation("Case 2:"), "情形 2:");
});
