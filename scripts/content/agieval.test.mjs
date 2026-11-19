import assert from "node:assert/strict";
import test from "node:test";
import {
  AGIEVAL_AUTHORITATIVE_YANZI_PASSAGE,
  AGIEVAL_REPAIRED_OUTPUT_COUNT,
  AGIEVAL_REPAIR_COUNT,
  convertAgievalRecords,
  normalizeAgievalQuestion,
  normalizeAgievalText,
  repairAgievalRecord,
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
  assert.equal(stripAgievalOptionLabel("(A)A．选项内容"), "选项内容");
  assert.equal(stripAgievalOptionLabel("(A)、选项内容"), "选项内容");
  assert.equal(normalizeAgievalQuestion("1、下列词语中，字形和加点字的读音全都正确的一项是（  ）D", "D"), "下列词语中，字形和加点字的读音全都正确的一项是");
});

test("converts a labeled question into an auto-gradable high-school record", () => {
  const [question] = convertAgievalRecords([record()]);
  assert.equal(question.id.length, 32);
  assert.equal(question.grade, "高三");
  assert.equal(question.options.C, "丙");
  assert.equal(question.answer, "C");
  assert.match(question.solutions[0], /未提供解析/u);
});

test("deduplicates identical content and merges paper provenance", () => {
  const questions = convertAgievalRecords([
    record(),
    record({ other: { source: "2021年高考语文备用卷" } }),
  ]);
  assert.equal(questions.length, 1);
  assert.match(questions[0].sourcePaper, /备用卷/u);
  assert.match(questions[0].sourcePaper, /合并 2 个/u);
});

test("rejects duplicate content with conflicting answer labels", () => {
  assert.throws(() => convertAgievalRecords([record(), record({ label: "D" })]), /disagree on the answer/u);
});

test("pins all AGIEval source repairs and fails closed on source drift", () => {
  assert.equal(AGIEVAL_REPAIR_COUNT, 49);
  assert.equal(AGIEVAL_REPAIRED_OUTPUT_COUNT, 44);
  assert.match(AGIEVAL_AUTHORITATIVE_YANZI_PASSAGE, /息于涂侧者/u);
  assert.match(AGIEVAL_AUTHORITATIVE_YANZI_PASSAGE, /士者诎乎不知己，而申乎知己/u);
  assert.match(AGIEVAL_AUTHORITATIVE_YANZI_PASSAGE, /乃令粪洒②改席，尊醮③而礼之/u);
  assert.doesNotMatch(AGIEVAL_AUTHORITATIVE_YANZI_PASSAGE, /患于逾侧|见使料归|君了曰|尊残/u);
  assert.throws(() => repairAgievalRecord(record(), 126), /no longer matches its pinned source/u);
  assert.throws(() => repairAgievalRecord(record(), 227), /no longer matches its pinned source/u);
});
