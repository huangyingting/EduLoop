import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { normalizeSourceQuestion, type SourceQuestion } from "./content";
import { allDiagramReplacements, stemDiagramReplacements, VERTICAL_ANGLES_QUESTION_ID, verticalAnglesDiagramReplacements } from "./question-replacements";

function sourceQuestion(): SourceQuestion {
  return {
    id: VERTICAL_ANGLES_QUESTION_ID,
    type: "选择题",
    grade_band: "初中",
    difficulty: "一般",
    grade: "七年级",
    course: "数学",
    paper: "",
    online_test: true,
    option_split: false,
    quality: "精品",
    question_info: {
      raw_content: {
        title: "下列图中，∠1与∠2属于对顶角的是（ ）． A、 B、 C、 D、",
        option_a: "",
        option_b: "",
        option_c: "",
        option_d: "",
        option_e: "",
        answer1: "C",
      },
    },
    answer_info: { raw_content: "【答案】 C" },
    solution_info: [{ solution_info: "A、B、D不是对顶角，是对顶角的只有C．" }],
    children: [],
  };
}

describe("vertical-angle replacement diagrams", () => {
  it("restores answerable options while keeping the replacement in review", () => {
    const normalized = normalizeSourceQuestion(sourceQuestion(), "mathematics.json");

    expect(normalized).toMatchObject({
      status: "NEEDS_REVIEW",
      isAutoGradable: true,
      correctAnswer: '["C"]',
      stem: "下列图中，∠1与∠2属于对顶角的是（ ）．",
    });
    expect(normalized.options.map((option) => option.label)).toEqual(["A", "B", "C", "D"]);
    expect(normalized.assets).toHaveLength(4);
    expect(normalized.assets.every((asset) => asset.reviewStatus === "DRAFT")).toBe(true);
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
      const svg = await readFile(path.join(process.cwd(), "public", asset.path), "utf8");
      expect(svg).toContain(`<desc id="desc">${asset.altText}</desc>`);
      if (asset.relationship) expect(svg).toContain(`data-relationship="${asset.relationship}"`);
    }
  });

  it("attaches each safe stem diagram to its source record without changing its answer", async () => {
    const dataDirectory = path.join(process.cwd(), "data");
    const filenames = (await readdir(dataDirectory)).filter((filename) => filename.endsWith(".json"));
    const sourceQuestions = (await Promise.all(filenames.map(async (filename) => {
      const body = (await readFile(path.join(dataDirectory, filename), "utf8")).replace(/^\uFEFF/, "");
      return (JSON.parse(body) as SourceQuestion[]).map((question) => ({ question, filename }));
    }))).flat();

    for (const asset of stemDiagramReplacements) {
      const source = sourceQuestions.find(({ question }) => question.id === asset.questionId);
      expect(source, `Missing source question ${asset.questionId}`).toBeDefined();
      const normalized = normalizeSourceQuestion(source!.question, source!.filename);
      expect(normalized.status).toBe("NEEDS_REVIEW");
      expect(normalized.answer).toBe(source!.question.answer_info.raw_content.trim());
      expect(normalized.assets).toEqual([expect.objectContaining({ role: "STEM", path: asset.path, reviewStatus: "DRAFT" })]);
    }
  });
});
