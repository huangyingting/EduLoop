import assert from "node:assert/strict";
import test from "node:test";
import {
  contentDamageIssues,
  directChoiceLabels,
  hasBalancedBraces,
  hasForbiddenControlCharacter,
  invalidJsonLatexEscapes,
  isChoiceQuestionType,
  normalizeOption,
  terminalChoiceLabels,
  terminalLabeledChoice,
} from "./amc-audit-rules.mjs";

test("recognizes every supported subject choice-question label", () => {
  for (const type of ["选择题", "单选题", "多选题", "双选题", "不定项选择题"]) {
    assert.equal(isChoiceQuestionType(type), true, type);
  }
  for (const type of ["填空题", "判断题", "解答题", "复合题"]) {
    assert.equal(isChoiceQuestionType(type), false, type);
  }
});

test("extracts subject answer labels without crossing into the next explanation sentence", () => {
  assert.deepEqual(directChoiceLabels("B|D|E"), ["B", "D", "E"]);
  assert.deepEqual(terminalChoiceLabels("故选：B、D、E。"), ["B", "D", "E"]);
  assert.deepEqual(terminalChoiceLabels("故选：C； A.工业上常用二氧化硫漂白纸浆。"), ["C"]);
});

test("normalizes equivalent option formatting and strips forum residue", () => {
  assert.equal(normalizeOption("$ \\dfrac{1}{2} $"), normalizeOption("$\\frac{1}{2}$\n\n💬 Join the Discussion"));
});

test("detects malformed braces without counting escaped set braces", () => {
  assert.equal(hasBalancedBraces("$\\{1,2\\}$ and $\\frac{1}{2}$"), true);
  assert.equal(hasBalancedBraces("$\\frac{1}{2$"), false);
});

test("extracts only explicit answer labels from terminal boxes", () => {
  assert.equal(terminalLabeledChoice("Thus $\\boxed{\\textbf{(C)}\\ 10}$"), "C");
  assert.equal(terminalLabeledChoice("An intermediate value is $\\boxed{b}$"), null);
  assert.equal(terminalLabeledChoice("We discuss choice (D), then conclude $\\boxed{E}$."), "E");
});

test("flags high-confidence source damage", () => {
  assert.deepEqual(contentDamageIssues("https://example.test/video", { solution: true }), ["URL-only solution"]);
  assert.ok(contentDamageIssues("Observe that}").includes("unbalanced braces"));
  assert.ok(contentDamageIssues("the the value").includes("obvious text corruption"));
  assert.ok(contentDamageIssues("terms and and completing").includes("obvious text corruption"));
  assert.ok(contentDamageIssues("There's are two ways").includes("obvious text corruption"));
  assert.ok(contentDamageIssues("adding two odd numbers an an even number").includes("obvious text corruption"));
  assert.ok(contentDamageIssues("Note\nNote that this is useful").includes("obvious text corruption"));
  assert.ok(!contentDamageIssues("very very very carefully").includes("obvious text corruption"));
  assert.ok(!contentDamageIssues("travel from town to town").includes("obvious text corruption"));
  assert.ok(contentDamageIssues("[object Object]").includes("obvious text corruption"));
  assert.ok(contentDamageIssues("感受器、传人神经、神经中枢").includes("obvious text corruption"));
  assert.ok(contentDamageIssues("有的油脂含义碳碳双键").includes("obvious text corruption"));
  assert.ok(contentDamageIssues("下列说说法正确的是").includes("obvious text corruption"));
  assert.ok(contentDamageIssues("角形的一个外角等于两个内角之和").includes("obvious text corruption"));
  assert.ok(!contentDamageIssues("三角形的一个外角等于和它不相邻的两个内角之和").includes("obvious text corruption"));
  assert.ok(contentDamageIssues("This solution is a fakesolve.", { solution: true }).includes("self-identified invalid solution"));
  assert.ok(contentDamageIssues("$1,qquad 2$").includes("LaTeX command missing backslash"));
  assert.equal(hasForbiddenControlCharacter("a\tb"), true);
  assert.equal(hasForbiddenControlCharacter("a\u200bb"), true);
  assert.equal(hasForbiddenControlCharacter("a\nb"), false);
  assert.deepEqual(invalidJsonLatexEscapes(String.raw`"$\\frac12+\frac12$ and $\\text{x}+\text{y}$"`), [
    { offset: 11, command: "frac" },
    { offset: 35, command: "text" },
  ]);
});
