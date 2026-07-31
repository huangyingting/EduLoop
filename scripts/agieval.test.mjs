import assert from "node:assert/strict";
import test from "node:test";
import {
  convertAgievalRecords,
  normalizeAgievalText,
  stripAgievalOptionLabel,
} from "./agieval.mjs";

function record(overrides = {}) {
  return {
    passage: "__材料一：__。阅读材料。",
    question: "下列说法正确的一项是（ ）",
    options: ["(A)甲", "(B)乙", "(C)丙", "(D)丁"],
    label: "C",
    answer: null,
    other: { source: "2021年高考语文测试卷" },
    ...overrides,
  };
}

test("normalizes AGIEval markdown while preserving answer blanks", () => {
  assert.equal(normalizeAgievalText("__材料一：__。内容____①____"), "材料一：内容____①____");
  assert.equal(stripAgievalOptionLabel("（Ａ） 选项内容"), "选项内容");
});

test("converts a labeled question into an auto-gradable high-school record", () => {
  const [question] = convertAgievalRecords([record()]);
  assert.equal(question.id.length, 32);
  assert.equal(question.grade_band, "高中");
  assert.equal(question.grade, "高三");
  assert.equal(question.question_info.raw_content.option_c, "丙");
  assert.equal(question.question_info.raw_content.answer1, "C");
  assert.match(question.solution_info[0].solution_info, /未提供解析/u);
});

test("deduplicates identical content and merges paper provenance", () => {
  const questions = convertAgievalRecords([
    record(),
    record({ other: { source: "2021年高考语文备用卷" } }),
  ]);
  assert.equal(questions.length, 1);
  assert.match(questions[0].paper, /备用卷/u);
  assert.match(questions[0].quality, /合并 2 个/u);
});

test("rejects duplicate content with conflicting answer labels", () => {
  assert.throws(() => convertAgievalRecords([record(), record({ label: "D" })]), /disagree on the answer/u);
});
