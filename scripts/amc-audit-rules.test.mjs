import assert from "node:assert/strict";
import test from "node:test";
import {
  contentDamageIssues,
  hasBalancedBraces,
  normalizeOption,
  terminalLabeledChoice,
} from "./amc-audit-rules.mjs";

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
});
