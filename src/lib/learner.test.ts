import { afterEach, describe, expect, it, vi } from "vitest";
import { clearGuestLearningStorage, getPracticePreferences, getStoredPracticePreferences, normalizePracticePreferences, practicePreferencesWithKnowledgeDefault, savePracticePreferences } from "./learner";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("practice preferences", () => {
  it("keeps supported filter values", () => {
    expect(normalizePracticePreferences({
      subject: "math", gradeBand: "middle-school", grade: "grade-8",
      difficulty: "MEDIUM", type: "MULTIPLE_CHOICE", tags: "TOPIC:geometry,SKILL:visual-interpretation",
    })).toEqual({
      subject: "math", gradeBand: "middle-school", grade: "grade-8",
      difficulty: "MEDIUM", type: "MULTIPLE_CHOICE", tags: "TOPIC:geometry,SKILL:visual-interpretation",
    });
  });

  it("drops malformed and unknown preference data", () => {
    expect(normalizePracticePreferences({ subject: "math?answer=B", grade: 8, extra: "ignored" })).toEqual({
      subject: "", gradeBand: "", grade: "", difficulty: "", type: "", tags: "",
    });
    expect(normalizePracticePreferences("not-an-object")).toEqual({
      subject: "", gradeBand: "", grade: "", difficulty: "", type: "", tags: "",
    });
    expect(normalizePracticePreferences({ tags: "TOPIC:geometry,skill:unsafe" })).toEqual({
      subject: "", gradeBand: "", grade: "", difficulty: "", type: "", tags: "",
    });
  });

  it("removes learning state left by earlier guest sessions", () => {
    const removeItem = vi.fn();
    vi.stubGlobal("window", { localStorage: { removeItem } });
    clearGuestLearningStorage();
    expect(removeItem).toHaveBeenCalledWith("eduloop-practice-preferences");
    expect(removeItem).toHaveBeenCalledWith("eduloop-device-key");
  });

  it("distinguishes a missing preference from an intentionally broad filter", () => {
    const getItem = vi.fn().mockReturnValueOnce(null).mockReturnValueOnce(JSON.stringify({}));
    vi.stubGlobal("window", { localStorage: { getItem } });
    expect(getStoredPracticePreferences()).toBeNull();
    expect(getStoredPracticePreferences()).toEqual({
      subject: "", gradeBand: "", grade: "", difficulty: "", type: "", tags: "",
    });
    getItem.mockReturnValue(null);
    expect(getPracticePreferences()).toEqual({
      subject: "", gradeBand: "", grade: "", difficulty: "", type: "", tags: "",
    });
  });

  it("uses learner knowledge only when no manual practice preference exists", () => {
    const profile = { knowledgeBand: "high", knowledgeGrade: "grade-11" };
    expect(practicePreferencesWithKnowledgeDefault(null, profile)).toMatchObject({
      gradeBand: "high", grade: "grade-11",
    });
    expect(practicePreferencesWithKnowledgeDefault({
      subject: "math", gradeBand: "", grade: "", difficulty: "", type: "", tags: "",
    }, profile)).toMatchObject({ subject: "math", gradeBand: "", grade: "" });
  });

  it("keeps practice usable when browser storage is blocked", () => {
    vi.stubGlobal("window", { localStorage: { setItem: () => { throw new Error("blocked"); } } });
    expect(() => savePracticePreferences({
      subject: "math", gradeBand: "", grade: "", difficulty: "", type: "", tags: "",
    })).not.toThrow();
  });
});
