import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import {
  curatedChoiceContent,
  curatedQuestionUpdates,
  repairedMissingFigureIds,
  reviewedSelfContainedVisualIds,
  selfAssessedCompositeIds,
} from "./content-curation";
import { normalizeSourceQuestion, type SourceQuestion } from "./content";

type SourceRecord = { filename: string; question: SourceQuestion };

let recordsById: Map<string, SourceRecord>;

beforeAll(async () => {
  const dataDirectory = path.join(process.cwd(), "data", "zh-CN");
  const filenames = (await readdir(dataDirectory)).filter((filename) => filename.endsWith(".json"));
  const records = (await Promise.all(filenames.map(async (filename) => {
    const body = (await readFile(path.join(dataDirectory, filename), "utf8")).replace(/^\uFEFF/, "");
    return (JSON.parse(body) as SourceQuestion[]).map((question) => ({ filename, question }));
  }))).flat();
  recordsById = new Map(records.map((record) => [record.question.id, record]));
});

function normalized(id: string) {
  const source = recordsById.get(id);
  expect(source, `Missing curated source question ${id}`).toBeDefined();
  return normalizeSourceQuestion(source!.question, source!.filename);
}

describe("catalog content curation", () => {
  it("publishes all manually verified self-contained visual matches", () => {
    expect(reviewedSelfContainedVisualIds.size).toBe(26);
    for (const id of reviewedSelfContainedVisualIds) expect(normalized(id).status).toBe("PUBLISHED");
  });

  it("publishes self-contained rewrites of the missing-figure questions", () => {
    expect(repairedMissingFigureIds.size).toBe(9);
    for (const id of repairedMissingFigureIds) {
      const question = normalized(id);
      expect(question.status).toBe("PUBLISHED");
      expect(question.stem).not.toMatch(/如图|图中|图甲|图乙|图2/);
    }
  });

  it("applies complete reviewed content to all repaired source records", () => {
    expect(curatedQuestionUpdates.size).toBe(11);
    for (const [id, update] of curatedQuestionUpdates) {
      expect(normalized(id)).toMatchObject({
        status: "PUBLISHED",
        stem: update.stem,
        answer: update.answer,
        explanation: update.explanation,
      });
    }
  });

  it("restores curated malformed choices as auto-gradable questions", () => {
    expect(curatedChoiceContent.size).toBe(3);
    for (const [id, correction] of curatedChoiceContent) {
      const question = normalized(id);
      expect(question).toMatchObject({ status: "PUBLISHED", isAutoGradable: true, stem: correction.stem });
      expect(question.options.map((option) => option.content)).toEqual(correction.options);
    }
  });

  it("retains the compound source record as a published self-assessed response", () => {
    expect(selfAssessedCompositeIds.size).toBe(1);
    for (const id of selfAssessedCompositeIds) {
      expect(normalized(id)).toMatchObject({
        status: "PUBLISHED", type: "WRITTEN_RESPONSE", isAutoGradable: false, correctAnswer: null,
      });
    }
  });

  it("publishes the complete repaired catalog", () => {
    const questions = [...recordsById.values()].map(({ question, filename }) => normalizeSourceQuestion(question, filename));
    expect(questions).toHaveLength(13_812);
    expect(questions.filter((question) => question.status === "PUBLISHED")).toHaveLength(13_812);
    expect(questions.filter((question) => question.status === "NEEDS_REVIEW")).toHaveLength(0);
  });
});
