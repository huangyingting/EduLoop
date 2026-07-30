import { afterEach, describe, expect, it, vi } from "vitest";
import { clearGuestLearningStorage, normalizePracticePreferences, savePracticePreferences } from "./learner";

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

  it("keeps practice usable when browser storage is blocked", () => {
    vi.stubGlobal("window", { localStorage: { setItem: () => { throw new Error("blocked"); } } });
    expect(() => savePracticePreferences({
      subject: "math", gradeBand: "", grade: "", difficulty: "", type: "", tags: "",
    })).not.toThrow();
  });
});
