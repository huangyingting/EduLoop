import { describe, expect, it } from "vitest";
import { extractCorrectLabels, extractOptions, normalizeQuestionType, normalizeSourceQuestion, referencesMissingFigure, type SourceQuestion } from "./content";

function question(overrides: Partial<SourceQuestion> = {}): SourceQuestion {
  return {
    id: "source-1",
    subject: "化学",
    grade: "九年级",
    type: "选择题",
    difficulty: "一般",
    sourcePaper: "",
    stem: "下列说法正确的是？",
    options: { A: "甲", B: "乙" },
    answer: "A",
    solutions: ["解析"],
    tags: [],
    ...overrides,
  };
}

describe("question normalization", () => {
  it("extracts direct choice labels", () => {
    expect(extractCorrectLabels(question())).toEqual(["A"]);
  });

  it("promotes generic choice questions with multiple labels", () => {
    const source = question({ answer: "A、B" });
    expect(normalizeQuestionType(source)).toBe("MULTIPLE_CHOICE");
  });

  it("flags missing and diagram-dependent stems for review", () => {
    const source = question({ type: "识图作答题" });
    expect(normalizeSourceQuestion(source, "fixture.json").status).toBe("NEEDS_REVIEW");
  });

  it("honors source audit review markers and placeholder stems", () => {
    const source = question({ sourcePaper: "CJEval train #1；NEEDS_REVIEW：答案疑似冲突" });
    expect(normalizeSourceQuestion(source, "chinese.json").status).toBe("NEEDS_REVIEW");
    expect(normalizeSourceQuestion(question({ stem: "略" }), "mathematics.json").status).toBe("NEEDS_REVIEW");
  });

  it("keeps imported knowledge concepts as filterable topics", () => {
    const source = question({
      subject: "语文",
      tags: ["字音"],
    });
    expect(normalizeSourceQuestion(source, "chinese.json").tags).toEqual(expect.arrayContaining([
      expect.objectContaining({ dimension: "TOPIC", label: "字音", source: "IMPORT" }),
    ]));
  });

  it("does not mistake a long explanation for an answer key", () => {
    const source = question({
      answer: "A 项描述错误，B 项也不满足条件。",
    });
    expect(extractCorrectLabels(source)).toEqual([]);
  });

  it("creates consistent options and keys for true-false questions", () => {
    const source = question({
      type: "判断题",
      options: {},
      answer: "×",
    });
    expect(normalizeSourceQuestion(source, "fixture.json")).toMatchObject({
      type: "TRUE_FALSE", correctAnswer: '["B"]', isAutoGradable: true,
      options: [{ label: "A", content: "正确" }, { label: "B", content: "错误" }],
    });
  });

  it("extracts sequential options embedded in an unsplit stem", () => {
    const source = question({
      stem: "计算结果是（ ） A. 1 B. 2 C. 3",
      options: {},
      answer: "B",
    });
    expect(normalizeSourceQuestion(source, "fixture.json")).toMatchObject({
      stem: "计算结果是（ ）", correctAnswer: '["B"]', isAutoGradable: true,
      options: [{ label: "A", content: "1" }, { label: "B", content: "2" }, { label: "C", content: "3" }],
    });
  });

  it("extracts compact inline choices whose labels touch Chinese text", () => {
    const source = question({
      stem: "应该在何时进行？ A使用前 B．使用后 C使用前及使用后 D．储存前",
      options: {},
      answer: "C",
    });
    expect(normalizeSourceQuestion(source, "fixture.json")).toMatchObject({
      status: "PUBLISHED", stem: "应该在何时进行？", correctAnswer: '["C"]', isAutoGradable: true,
      options: [
        { label: "A", content: "使用前" },
        { label: "B", content: "使用后" },
        { label: "C", content: "使用前及使用后" },
        { label: "D", content: "储存前" },
      ],
    });
  });

  it("quarantines an unsplit choice question when its options cannot be recovered", () => {
    const source = question({
      stem: "选择正确的图片 A、 B、 C、 D、",
      options: {},
    });
    expect(extractOptions(source)).toEqual([]);
    expect(normalizeSourceQuestion(source, "fixture.json").status).toBe("NEEDS_REVIEW");
  });

  it("quarantines a choice question with a missing option in the sequence", () => {
    const source = question({
      options: { B: "乙" },
    });
    expect(normalizeSourceQuestion(source, "fixture.json").status).toBe("NEEDS_REVIEW");
  });

  it("parses pipe-delimited multiple-choice keys", () => {
    const source = question({ answer: "A|B" });
    expect(extractCorrectLabels(source)).toEqual(["A", "B"]);
    expect(normalizeQuestionType(source)).toBe("MULTIPLE_CHOICE");
  });

  it.each([["【答案】 √", "A"], ["（1）错误", "B"], ["【答案】 ×", "B"]])(
    "parses wrapped true-false answer %s", (answer, expected) => {
      const source = question({
        type: "判断题",
        options: {},
        answer,
      });
      expect(extractCorrectLabels(source)).toEqual([expected]);
    },
  );

  it("quarantines ordinary question types that explicitly require a missing figure", () => {
    const source = question({ stem: "如图所示，下列说法正确的是（ ）" });
    expect(referencesMissingFigure(String(source.stem))).toBe(true);
    expect(normalizeSourceQuestion(source, "fixture.json").status).toBe("NEEDS_REVIEW");
    expect(referencesMissingFigure("函数图象的性质是")).toBe(false);
    expect(referencesMissingFigure("当我们试图一次获取大量信息时")).toBe(false);
    expect(referencesMissingFigure("营销团队负责推广图书")).toBe(false);
    expect(referencesMissingFigure("猕猴在屏上图片中做出选择")).toBe(false);
    expect(referencesMissingFigure("新剧本里的地图中不该有匕首")).toBe(false);
    expect(referencesMissingFigure("观察图1中的曲线")).toBe(true);
  });

  it.each(["amc8.json", "amc10.json", "amc12.json"])("retains position bands and tags English competition content for %s", (sourceFile) => {
    const level = `AMC-${sourceFile.match(/\d+/)![0]}`;
    const source = question({
      type: "单选题",
      subject: "数学",
      grade: level,
      difficulty: "困难",
      stem: "How many arrangements of five integers have the largest possible sum?",
    });
    const normalized = normalizeSourceQuestion(source, sourceFile);
    expect(normalized).toMatchObject({
      gradeBandName: level, gradeName: level, difficulty: "HARD", difficultyConfidence: 1,
    });
    expect(normalized.difficultyReason).toContain("AMC contest position band retained");
    expect(normalized.tags).toEqual(expect.arrayContaining([
      expect.objectContaining({ slug: "combinatorics" }),
      expect.objectContaining({ slug: "quantitative-reasoning" }),
    ]));
  });
});
