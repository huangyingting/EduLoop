import { describe, expect, it } from "vitest";
import { isContentOperator, USER_ROLES } from "./user-roles";

describe("user roles", () => {
  it("keeps public learners outside the content workspace", () => {
    expect(USER_ROLES).toEqual(["LEARNER", "CONTENT_EDITOR", "ADMIN"]);
    expect(isContentOperator({ role: "LEARNER" })).toBe(false);
    expect(isContentOperator(null)).toBe(false);
  });

  it("allows both content editors and administrators", () => {
    expect(isContentOperator({ role: "CONTENT_EDITOR" })).toBe(true);
    expect(isContentOperator({ role: "ADMIN" })).toBe(true);
  });
});
