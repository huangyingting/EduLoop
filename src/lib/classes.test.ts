import { describe, expect, it } from "vitest";
import { assignmentHref, generateJoinCode } from "./classes";
import { institutionalClaim } from "./organizations";

describe("classes", () => {
  it("generates unambiguous 8-character join codes", () => {
    const codes = new Set(Array.from({ length: 200 }, generateJoinCode));
    expect(codes.size).toBe(200);
    for (const code of codes) expect(code).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);
  });

  it("links practice assignments to filtered practice and contests to the paper", () => {
    expect(assignmentHref("PRACTICE", { subject: "math", difficulty: "EASY" }, null)).toBe("/practice?subject=math&difficulty=EASY");
    expect(assignmentHref("PRACTICE", {}, null)).toBe("/practice");
    expect(assignmentHref("CONTEST", {}, "2019-amc-8")).toBe("/contest?paper=2019-amc-8");
  });
});

describe("institutional sign-in claims", () => {
  it("trusts only a verified Google hosted domain that matches the account email", () => {
    expect(institutionalClaim("google", { email_verified: true, hd: "School.edu" }, "kid@school.edu")).toEqual({ kind: "domain", value: "school.edu" });
    expect(institutionalClaim("google", { email_verified: false, hd: "school.edu" }, "kid@school.edu")).toBeNull();
    expect(institutionalClaim("google", { email_verified: true, hd: "school.edu" }, "kid@other.edu")).toBeNull();
    expect(institutionalClaim("google", { email_verified: true }, "kid@school.edu")).toBeNull();
  });

  it("uses the Microsoft Entra tenant ID and ignores other providers", () => {
    expect(institutionalClaim("microsoft-entra-id", { tid: "72F988BF-86F1-41AF-91AB-2D7CD011DB47" }, "x@y.z")).toEqual({ kind: "tenant", value: "72f988bf-86f1-41af-91ab-2d7cd011db47" });
    expect(institutionalClaim("microsoft-entra-id", { tid: "not-a-tenant" }, "x@y.z")).toBeNull();
    expect(institutionalClaim("facebook", { hd: "school.edu" }, "kid@school.edu")).toBeNull();
  });
});
