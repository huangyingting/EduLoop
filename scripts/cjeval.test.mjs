import assert from "node:assert/strict";
import test from "node:test";
import {
  CJEVAL_REPAIR_COUNT,
  convertCjevalRecord,
  formatCjevalAnswer,
  formatCjevalContent,
  normalizeCjevalText,
  splitChoiceContent,
} from "./cjeval.mjs";

test("normalizes CJEval presentation markup without leaving executable HTML", () => {
  assert.equal(normalizeCjevalText("读<dotted>音</dotted><br>并<u>作答</u>"), "读【音】\n并【作答】");
});

test("preserves text inside source-specific angle markers", () => {
  assert.equal(normalizeCjevalText("《<论语>十二章》与《读者<校园版>》"), "《〈论语〉十二章》与《读者〈校园版〉》");
  assert.equal(normalizeCjevalText("一树柿子<点>头<点>雪"), "一树柿子【头】雪");
});

test("splits sequential inline choice options", () => {
  assert.deepEqual(splitChoiceContent("题目：选择正确项。选项： A. 甲 B. 乙 C. 丙 D. 丁"), {
    stem: "题目：选择正确项。",
    options: [
      { label: "A", content: "甲" },
      { label: "B", content: "乙" },
      { label: "C", content: "丙" },
      { label: "D", content: "丁" },
    ],
  });
});

test("splits choices attached to Chinese punctuation", () => {
  assert.deepEqual(splitChoiceContent("选择正确项。选项：A. 甲。B. 乙。C. 丙。D. 丁"), {
    stem: "选择正确项。",
    options: [
      { label: "A", content: "甲。" },
      { label: "B", content: "乙。" },
      { label: "C", content: "丙。" },
      { label: "D", content: "丁" },
    ],
  });
});

test("normalizes structured content and reordered options", () => {
  const content = { 题目内容: "选择正确项。", 选项: ["D. 丁", "A. 甲", "B. 乙", "C. 丙"] };
  assert.equal(formatCjevalContent(content), "选择正确项。\n选项：D. 丁\nA. 甲\nB. 乙\nC. 丙");
  assert.deepEqual(splitChoiceContent(content)?.options, [
    { label: "A", content: "甲" },
    { label: "B", content: "乙" },
    { label: "C", content: "丙" },
    { label: "D", content: "丁" },
  ]);
});

test("formats nested composite answers for learner self-assessment", () => {
  assert.equal(formatCjevalAnswer(["甲", { 1: "乙", 2: ["丙", "丁"] }]), "（1）甲\n（2）1. 乙\n2. 1. 丙\n2. 丁");
});

test("converts a simple choice record with stable provenance and imported topics", () => {
  const source = {
    subject: "初中语文",
    ques_type: "选择题",
    ques_difficulty: "较易",
    ques_content: "下列正确的是？选项： A. 甲 B. 乙 C. 丙 D. 丁",
    ques_answer: ["C"],
    ques_analyze: "丙正确。",
    ques_knowledges: ["字音", "字音"],
  };
  const converted = convertCjevalRecord(source, "valid", 3);
  assert.equal(converted.id.length, 32);
  assert.equal(converted.grade, "初中综合");
  assert.equal(converted.question_info.raw_content.option_c, "丙");
  assert.equal(converted.question_info.raw_content.answer1, "C");
  assert.equal(converted.source_tags.length, 1);
});

test("applies all pinned editorial repairs without leaving review markers", () => {
  const source = (ques_content, overrides = {}) => ({
    subject: "初中语文",
    ques_type: "选择题",
    ques_difficulty: "一般",
    ques_content,
    ques_answer: ["A"],
    ques_analyze: "解析",
    ques_knowledges: ["字词"],
    ...overrides,
  });
  const cases = [
    [0, source("题目。选项：A. 甲 B. 乙 C. 丙 D. 粗<dotted>拙</dotted>（zhuō）", { ques_answer: ["C"] })],
    [25, source("下列词语中没有错别字的一项是（ ）", { ques_answer: ["D"] })],
    [
      179,
      source("父母无私的爱的<dotted>养</dotted>育。选项: 1. 甲 2. 文中乙 3. “漫步”丙 4. 文中的“馈赠”一词与“赠送”意义相近，且“馈”的发音与“愧”相同。", { ques_answer: ["1"] }),
    ],
    [304, source("题目。选项：A. 甲 B. ①会 ②孺 ③搏 C. 丙 D. 丁", { ques_answer: ["B"] })],
    [379, source("损坏的数字选项", { ques_answer: ["1"] })],
    [408, source("含两个选择小问的完整题干", { ques_answer: ["B", "D"] })],
    [
      642,
      source(
        "文章。(3) 题目内容：从修辞角度品析加点词的妙用。就在一个拐角处，一树柿子<点>头<点>雪跃入我的眼帘。这是一棵老柿树，它<悠然>矗立在废弃土房旁。",
        { ques_type: "现代文阅读", ques_answer: ["一", "二", "旧答案"], ques_analyze: ["一", "二", "旧解析"] },
      ),
    ],
  ];

  assert.equal(CJEVAL_REPAIR_COUNT, cases.length);
  for (const [index, record] of cases) {
    const converted = convertCjevalRecord(record, "train", index);
    assert.match(converted.quality, /EduLoop人工校订/u);
    assert.doesNotMatch(converted.quality, /NEEDS_REVIEW/u);
  }
});
