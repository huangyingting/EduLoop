import { describe, expect, it } from "vitest";
import { normalizePracticePreferences } from "./learner";

describe("practice preferences", () => {
  it("keeps supported filter values", () => {
    expect(normalizePracticePreferences({
      subject: "math", gradeBand: "middle-school", grade: "grade-8",
      difficulty: "MEDIUM", type: "MULTIPLE_CHOICE", tags: "geometry",
    })).toEqual({
      subject: "math", gradeBand: "middle-school", grade: "grade-8",
      difficulty: "MEDIUM", type: "MULTIPLE_CHOICE", tags: "geometry",
    });
  });

  it("drops malformed and unknown preference data", () => {
    expect(normalizePracticePreferences({ subject: "math?answer=B", grade: 8, extra: "ignored" })).toEqual({
      subject: "", gradeBand: "", grade: "", difficulty: "", type: "", tags: "",
    });
    expect(normalizePracticePreferences("not-an-object")).toEqual({
      subject: "", gradeBand: "", grade: "", difficulty: "", type: "", tags: "",
    });
  });
});
