import { describe, expect, it } from "vitest";
import { learnerProfileInputSchema } from "./learner-profile";

describe("learner profile input", () => {
  it("accepts a catalog-backed knowledge band and optional grade", () => {
    expect(learnerProfileInputSchema.parse({
      displayName: "  星空探索者  ",
      knowledgeBand: "high",
      knowledgeGrade: "grade-11",
    })).toEqual({
      displayName: "星空探索者",
      knowledgeBand: "high",
      knowledgeGrade: "grade-11",
    });
  });

  it("allows an intentionally broad profile but rejects orphaned grades", () => {
    expect(learnerProfileInputSchema.safeParse({
      displayName: "",
      knowledgeBand: null,
      knowledgeGrade: null,
    }).success).toBe(true);
    expect(learnerProfileInputSchema.safeParse({
      displayName: "学习者",
      knowledgeBand: null,
      knowledgeGrade: "grade-8",
    }).success).toBe(false);
  });
});
