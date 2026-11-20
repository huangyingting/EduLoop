import { describe, expect, it } from "vitest";
import { gradeResponse } from "./grading";

const choice = { isAutoGradable: true, correctAnswer: JSON.stringify(["A", "C"]), options: [{ label: "A" }, { label: "B" }, { label: "C" }] };

describe("response grading", () => {
  it("grades multiple-choice answers regardless of order and case", () => {
    expect(gradeResponse(choice, ["c", "A"])).toEqual({ ok: true, isCorrect: true, correctLabels: ["A", "C"] });
    expect(gradeResponse(choice, ["A"])).toMatchObject({ ok: true, isCorrect: false });
  });

  it("rejects mismatched response shapes and unknown labels", () => {
    expect(gradeResponse(choice, "A")).toEqual({ ok: false, reason: "RESPONSE_TYPE" });
    expect(gradeResponse(choice, ["Z"])).toEqual({ ok: false, reason: "UNKNOWN_OPTION" });
    expect(gradeResponse({ isAutoGradable: false, correctAnswer: null, options: [] }, ["A"]))
      .toEqual({ ok: false, reason: "RESPONSE_TYPE" });
  });

  it("leaves written and low-confidence answers to self-assessment", () => {
    expect(gradeResponse({ isAutoGradable: false, correctAnswer: null, options: [] }, "my reasoning"))
      .toEqual({ ok: true, isCorrect: null, correctLabels: [] });
    expect(gradeResponse({ ...choice, isAutoGradable: false }, ["A"])).toMatchObject({ ok: true, isCorrect: null });
  });
});
