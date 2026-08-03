import assert from "node:assert/strict";
import test from "node:test";
import {
  CJEVAL_REPAIR_COUNT,
  convertCjevalRecord,
  formatCjevalAnswer,
  formatCjevalContent,
  normalizeCjevalText,
  repairCjevalRecord,
  splitChoiceContent,
} from "./cjeval.mjs";

test("normalizes CJEval presentation markup without leaving executable HTML", () => {
  assert.equal(normalizeCjevalText("读<dotted>音</dotted><br>并<u>作答</u>"), "读【音】\n并【作答】");
  assert.equal(normalizeCjevalText("循序\u200b\u200b渐进"), "循序渐进");
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
  assert.equal(formatCjevalContent(content), "选择正确项。\n选项：\nD. 丁\nA. 甲\nB. 乙\nC. 丙");
  assert.deepEqual(splitChoiceContent(content)?.options, [
    { label: "A", content: "甲" },
    { label: "B", content: "乙" },
    { label: "C", content: "丙" },
    { label: "D", content: "丁" },
  ]);
});

test("removes source labels and restores composite question structure", () => {
  const formatted = formatCjevalContent(
    "题目内容: 阅读材料。【资料一】第一则。①第一段。②第二段。 (1) 题目内容: 选择正确项。选项: A. 甲 B. 乙 C. 丙 D. 丁 (2) 题目内容: 简要分析。",
  );
  assert.doesNotMatch(formatted, /题目内容\s*[:：]/u);
  assert.match(formatted, /阅读材料。\n\n【资料一】\n第一则。\n①第一段。\n②第二段。/u);
  assert.match(formatted, /\n\n（1） 选择正确项。\n选项：\nA\. 甲\nB\. 乙\nC\. 丙\nD\. 丁/u);
  assert.match(formatted, /\n\n（2） 简要分析。$/u);
});

test("formats punctuation-adjacent and Arabic-numbered subquestions", () => {
  assert.equal(
    formatCjevalContent("问题描述：阅读材料。(1)第一问。(2)第二问。"),
    "阅读材料。\n\n（1） 第一问。\n\n（2） 第二问。",
  );
  assert.equal(
    formatCjevalContent("问题：阅读文章。 1. 请概括内容。 2. 文章为什么这样写？"),
    "阅读文章。\n\n1. 请概括内容。\n\n2. 文章为什么这样写？",
  );
});

test("normalizes source-label and choice-heading variants", () => {
  assert.equal(
    formatCjevalContent("试题内容：阅读材料。 (1) 问题内容: 请选择。选择：A. 甲 B. 乙"),
    "阅读材料。\n\n（1） 请选择。\n选项：\nA. 甲\nB. 乙",
  );
  assert.equal(formatCjevalContent("题目描述：完成任务。"), "完成任务。");
});

test("preserves label-like words inside ordinary prose", () => {
  assert.equal(
    formatCjevalContent("题目内容：他提出一个问题：为什么这里要保留冒号？"),
    "他提出一个问题：为什么这里要保留冒号？",
  );
  assert.equal(
    formatCjevalContent("题目内容：第二空应填写的内容：甲。"),
    "第二空应填写的内容：甲。",
  );
});

test("formats known poetry authors and punctuated verse lines", () => {
  const formatted = formatCjevalContent(
    "题目内容: 阅读下面的古诗词，完成小题。浣溪沙 苏轼簌簌衣巾落枣花，村南村北响缫车。 【注释】①缫车：缫丝器具。 (1) 题目内容: 分析诗句。",
    { poetry: true, authors: ["苏轼"] },
  );
  assert.match(formatted, /^阅读下面的古诗词，完成小题。\n\n浣溪沙\n苏轼\n簌簌衣巾落枣花，\n村南村北响缫车。/u);
  assert.match(formatted, /\n\n【注释】\n①缫车：缫丝器具。\n\n（1） 分析诗句。$/u);
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

test("preserves structured CJEval explanations instead of stringifying objects", () => {
  const converted = convertCjevalRecord({
    subject: "初中语文",
    ques_type: "现代文阅读",
    ques_difficulty: "一般",
    ques_content: "阅读材料并回答问题。",
    ques_answer: ["甲", "乙"],
    ques_analyze: { "(1)": "第一问解析", "(2)": "第二问解析" },
    ques_knowledges: ["阅读理解"],
  }, "test", 115);

  assert.equal(converted.solution_info[0].solution_info, "（1）第一问解析\n（2）第二问解析");
  assert.doesNotMatch(converted.solution_info[0].solution_info, /\[object Object\]/u);
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
    [25, source("下列词语中没有错别字的一项是（ ）", { ques_answer: ["D"], ques_analyze: "此题目的目的是识别错别字。" })],
    [
      179,
      source("父母无私的爱的<dotted>养</dotted>育。选项: 1. 甲 2. 文中乙 3. “漫步”丙 4. 文中的“馈赠”一词与“赠送”意义相近，且“馈”的发音与“愧”相同。", { ques_answer: ["1"] }),
    ],
    [304, source("题目。选项：A. 甲 B. ①会 ②孺 ③搏 C. 丙 D. 丁", { ques_answer: ["B"] })],
    [
      378,
      source("题目。选项：A. 甲 B. 乙 C. 丙 D. 丁", {
        ques_analyze: "四个词的加点字音标标注都正确。",
      }),
    ],
    [379, source("损坏的数字选项", { ques_answer: ["1"] })],
    [408, source("含两个选择小问的完整题干", { ques_answer: ["B", "D"] })],
    [
      642,
      source(
        "文章。(3) 题目内容：从修辞角度品析加点词的妙用。就在一个拐角处，一树柿子<点>头<点>雪跃入我的眼帘。这是一棵老柿树，它<悠然>矗立在废弃土房旁。",
        { ques_type: "现代文阅读", ques_answer: ["一", "二", "旧答案"], ques_analyze: ["一", "二", "旧解析"] },
      ),
    ],
    [
      695,
      source("英语言期中考试前的星期天晚上。", {
        ques_type: "现代文阅读",
        ques_answer: ["答案"],
      }),
    ],
    [
      873,
      source("为什么野生动植物被称为最珍惜的自然资源？", {
        ques_type: "现代文阅读",
        ques_answer: ["答案"],
      }),
    ],
    [
      1074,
      source("一直把敌人消灭尽尽为止。", {
        ques_type: "现代文阅读",
        ques_answer: ["答案"],
      }),
    ],
    [
      1561,
      source(
        "题目内容: 阅读下面的古诗词，完成下面小题。浣溪沙<sup >①</sup> 苏轼 原始正文",
        {
          ques_type: "诗歌鉴赏",
          ques_answer: ["D", "旧答案"],
          ques_analyze: "旧解析",
          ques_knowledges: ["苏轼(1037-1101)", "词"],
        },
      ),
    ],
    [
      1618,
      source("解释“<dotted>虚</dotted><dotted>幻</dotted><dotted>幻</dotted><dotted>境</dotted>”的含义。", {
        ques_type: "现代文阅读",
        ques_answer: ["答案"],
        ques_analyze: "“虚幻幻境”指不切实际的幻想。",
      }),
    ],
  ];

  assert.equal(CJEVAL_REPAIR_COUNT, 30);
  for (const [index, record] of cases) {
    const converted = convertCjevalRecord(record, "train", index);
    assert.match(converted.quality, /EduLoop人工校订/u);
    assert.doesNotMatch(converted.quality, /NEEDS_REVIEW/u);
  }
});

test("repairs all newly reviewed CJEval phrase, poetry, and answer defects", () => {
  const poetryTitleCases = [
    ["train", 1553, "十五从军征十五岁从军", "十五从军征\n十五岁从军"],
    ["train", 1612, "关雎关关雎鸠", "关雎\n关关雎鸠"],
    ["train", 1613, "敷浅原<sup >①</sup>见桃花桃花雨后", "敷浅原<sup >①</sup>见桃花\n桃花雨后"],
    ["train", 1823, "静女静女其姝", "静女\n静女其姝"],
    ["train", 1953, "渔家傲·天接云涛连晓雾天接云涛连晓雾", "渔家傲·天接云涛连晓雾\n天接云涛连晓雾"],
    ["valid", 57, "关雎关关雎鸠", "关雎\n关关雎鸠"],
    ["test", 120, "（一）十五从军征十五岁时参军", "（一）十五从军征\n十五岁时参军"],
  ];
  for (const [split, index, before, after] of poetryTitleCases) {
    const repaired = repairCjevalRecord({ ques_content: before }, split, index).record;
    assert.equal(repaired.ques_content, after, `${split}:${index}`);
  }

  const qr = repairCjevalRecord({
    ques_content: "即905亿亿亿亿亿亿亿亿。 C. “回”字定位作用指的是二维码在不同方向都能正确扫描反馈。",
    ques_analyze: "旧解析",
  }, "train", 1103).record;
  assert.match(qr.ques_content, /905亿亿亿亿亿亿亿亿亿/u);
  assert.match(qr.ques_content, /作用是增加二维码的信息存储量/u);

  const veteran = repairCjevalRecord({
    ques_content: "十五从军征十五从军征",
    ques_answer: ["B", "B"],
    ques_analyze: "旧解析",
  }, "valid", 81).record;
  assert.match(veteran.ques_answer[1], /兵役制度/u);
  assert.match(veteran.ques_analyze[0], /并非由远及近/u);

  const comparison = repairCjevalRecord({ ques_answer: ["A", "B", "C", "D"], ques_analyze: ["不断不断"] }, "test", 160).record;
  assert.equal(comparison.ques_answer[3], "B");
  assert.match(comparison.ques_answer[0], /土地.*祖国/u);
  assert.doesNotMatch(JSON.stringify(comparison), /不断不断/u);
});

test("repairs the pinned CJEval test-split prose duplication", () => {
  const converted = convertCjevalRecord({
    subject: "初中语文",
    ques_type: "现代文阅读",
    ques_difficulty: "困难",
    ques_content: "语言只能给出大概概要，有些意思无法完全表达。",
    ques_answer: ["答案"],
    ques_analyze: "解析",
    ques_knowledges: ["阅读理解"],
  }, "test", 244);

  assert.match(converted.quality, /EduLoop人工校订/u);
  assert.match(converted.question_info.raw_content.title, /只能给出大概，有些意思/u);
  assert.doesNotMatch(converted.question_info.raw_content.title, /大概概要/u);
});

test("repairs the pinned Huanxisha record in the generated archive", () => {
  const source = {
    subject: "初中语文",
    ques_type: "诗歌鉴赏",
    ques_difficulty: "一般",
    ques_content: "题目内容: 阅读下面的古诗词，完成下面小题。浣溪沙<sup >①</sup> 苏轼 原始正文",
    ques_answer: ["D", "旧答案"],
    ques_analyze: "旧解析",
    ques_knowledges: ["苏轼(1037-1101)", "词"],
  };
  const converted = convertCjevalRecord(source, "train", 1561);
  const stem = converted.question_info.raw_content.title;
  assert.match(stem, /^阅读下面的古诗词，完成下面小题。\n\n浣溪沙①\n苏轼\n/u);
  assert.match(stem, /\n\n【注释】\n① 公元1078年/u);
  assert.match(stem, /\n\n（1） 下列对诗歌的理解不正确的一项是（ ）\n选项：\nA\. /u);
  assert.match(stem, /\n\n（2） 这首词清新朴实/u);
  assert.doesNotMatch(stem, /题目内容|上标/u);
});
