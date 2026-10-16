import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { normalizeSourceQuestion, type SourceQuestion } from "./content";
import { allDiagramReplacements, stemDiagramReplacements, VERTICAL_ANGLES_QUESTION_ID, verticalAnglesDiagramReplacements } from "./question-replacements";

function sourceQuestion(): SourceQuestion {
  return {
    id: VERTICAL_ANGLES_QUESTION_ID,
    subject: "数学",
    grade: "七年级",
    type: "选择题",
    difficulty: "一般",
    sourcePaper: "",
    stem: "下列图中，∠1与∠2属于对顶角的是（ ）． A、 B、 C、 D、",
    options: {},
    answer: "C",
    solutions: ["A、B、D不是对顶角，是对顶角的只有C．"],
    tags: [],
  };
}

describe("vertical-angle replacement diagrams", () => {
  it("restores answerable options and publishes the approved replacement", () => {
    const normalized = normalizeSourceQuestion(sourceQuestion(), "mathematics.json");

    expect(normalized).toMatchObject({
      status: "PUBLISHED",
      isAutoGradable: true,
      correctAnswer: '["C"]',
      stem: "下列图中，∠1与∠2属于对顶角的是（ ）．",
    });
    expect(normalized.options.map((option) => option.label)).toEqual(["A", "B", "C", "D"]);
    expect(normalized.assets).toHaveLength(4);
    expect(normalized.assets.every((asset) => asset.reviewStatus === "APPROVED")).toBe(true);
    expect(normalized.tags).toEqual(expect.arrayContaining([
      expect.objectContaining({ dimension: "FORMAT", slug: "auto-gradable" }),
      expect.objectContaining({ dimension: "FORMAT", slug: "choice" }),
    ]));
    expect(normalized.tags).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ dimension: "FORMAT", slug: "written-response" }),
    ]));
  });

  it("defines C as the only vertical-angle relationship", () => {
    const vertical = verticalAnglesDiagramReplacements.filter((asset) => asset.relationship === "VERTICAL");
    expect(vertical.map((asset) => asset.label)).toEqual(["C"]);
  });

  it("keeps accessible SVG metadata aligned with the replacement registry", async () => {
    for (const asset of allDiagramReplacements) {
      expect(asset.reviewStatus).toBe("APPROVED");
      const svg = await readFile(path.join(process.cwd(), "public", asset.path), "utf8");
      expect(svg).toContain(`<desc id="desc">${asset.altText}</desc>`);
      if (asset.relationship) expect(svg).toContain(`data-relationship="${asset.relationship}"`);
    }
  });

  it("attaches each safe stem diagram to its source record without changing its answer", async () => {
    const dataDirectory = path.join(process.cwd(), "data", "zh-CN");
    const filenames = (await readdir(dataDirectory)).filter((filename) => filename.endsWith(".json"));
    const sourceQuestions = (await Promise.all(filenames.map(async (filename) => {
      const body = (await readFile(path.join(dataDirectory, filename), "utf8")).replace(/^\uFEFF/, "");
      return (JSON.parse(body) as SourceQuestion[]).map((question) => ({ question, filename }));
    }))).flat();

    for (const asset of stemDiagramReplacements) {
      const source = sourceQuestions.find(({ question }) => question.id === asset.questionId);
      expect(source, `Missing source question ${asset.questionId}`).toBeDefined();
      const normalized = normalizeSourceQuestion(source!.question, source!.filename);
      expect(normalized.status).toBe("PUBLISHED");
      expect(normalized.answer).toBe(source!.question.answer.trim());
      expect(normalized.assets).toEqual([expect.objectContaining({ role: "STEM", path: asset.path, reviewStatus: "APPROVED" })]);
    }
  });
});
