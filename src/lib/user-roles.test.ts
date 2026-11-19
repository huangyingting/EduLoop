import { describe, expect, it } from "vitest";
import { isContentOperator, isTeacher, USER_ROLES } from "./user-roles";

describe("user roles", () => {
  it("keeps public learners outside the content workspace", () => {
    expect(USER_ROLES).toEqual(["LEARNER", "CONTENT_EDITOR", "TEACHER", "ADMIN"]);
    expect(isContentOperator({ role: "LEARNER" })).toBe(false);
    expect(isContentOperator({ role: "TEACHER" })).toBe(false);
    expect(isContentOperator(null)).toBe(false);
  });

  it("allows both content editors and administrators", () => {
    expect(isContentOperator({ role: "CONTENT_EDITOR" })).toBe(true);
    expect(isContentOperator({ role: "ADMIN" })).toBe(true);
  });

  it("gives the teacher workspace to teachers and administrators only", () => {
    expect(isTeacher({ role: "TEACHER" })).toBe(true);
    expect(isTeacher({ role: "ADMIN" })).toBe(true);
    expect(isTeacher({ role: "CONTENT_EDITOR" })).toBe(false);
    expect(isTeacher({ role: "LEARNER" })).toBe(false);
  });
});
