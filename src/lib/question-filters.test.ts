import { describe, expect, it } from "vitest";
import { parseQuestionFilters, questionWhere } from "./question-filters";

describe("question filters", () => {
  it("parses bounded legacy and dimension-qualified tag filters", () => {
    const filters = parseQuestionFilters(new URLSearchParams({
      mode: "adaptive",
      deviceKey: "guest_device_123",
      subject: "math",
      gradeBand: "middle",
      difficulty: "HARD",
      type: "SINGLE_CHOICE",
      autoGradable: "true",
      tags: "geometry,TOPIC:algebra,SKILL:quantitative-reasoning",
      exclude: "question_a,question_b",
    }));
    expect(filters).toMatchObject({
      mode: "adaptive",
      tagFilters: [
        { dimension: "TOPIC", slug: "geometry" },
        { dimension: "TOPIC", slug: "algebra" },
        { dimension: "SKILL", slug: "quantitative-reasoning" },
      ],
      excluded: ["question_a", "question_b"],
    });
    expect(questionWhere(filters!)).toMatchObject({
      status: "PUBLISHED",
      subject: { slug: "math" },
      difficulty: "HARD",
      isAutoGradable: true,
      AND: [
        { tags: { some: { tag: {
          slug: { in: ["geometry", "algebra"] },
          dimension: { key: "TOPIC", isFilterable: true },
        } } } },
        { tags: { some: { tag: {
          slug: { in: ["quantitative-reasoning"] },
          dimension: { key: "SKILL", isFilterable: true },
        } } } },
      ],
    });
  });

  it("rejects unknown enums, unsafe slugs, and oversized lists", () => {
    expect(parseQuestionFilters(new URLSearchParams({ difficulty: "IMPOSSIBLE" }))).toBeNull();
    expect(parseQuestionFilters(new URLSearchParams({ subject: "../math" }))).toBeNull();
    expect(parseQuestionFilters(new URLSearchParams({ tags: "topic:geometry" }))).toBeNull();
    expect(parseQuestionFilters(new URLSearchParams({
      exclude: Array.from({ length: 21 }, (_, index) => `question_${index}`).join(","),
    }))).toBeNull();
  });
});
