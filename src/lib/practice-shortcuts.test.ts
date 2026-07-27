import { describe, expect, it } from "vitest";
import { ignoresPracticeShortcuts, optionIndexForShortcut } from "./practice-shortcuts";

describe("practice keyboard shortcuts", () => {
  it("maps number keys only to visible options", () => {
    expect(optionIndexForShortcut("1", 4)).toBe(0);
    expect(optionIndexForShortcut("4", 4)).toBe(3);
    expect(optionIndexForShortcut("5", 4)).toBeNull();
    expect(optionIndexForShortcut("Enter", 4)).toBeNull();
  });

  it("does not intercept typing controls", () => {
    expect(ignoresPracticeShortcuts({ tagName: "TEXTAREA" } as unknown as EventTarget)).toBe(true);
    expect(ignoresPracticeShortcuts({ tagName: "BUTTON" } as unknown as EventTarget)).toBe(false);
    expect(ignoresPracticeShortcuts({ isContentEditable: true } as unknown as EventTarget)).toBe(true);
  });
});
