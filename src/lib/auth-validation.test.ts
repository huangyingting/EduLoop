import { describe, expect, it } from "vitest";
import { isSameOriginRequest, normalizeEmail, registerInputSchema, safeReturnPath } from "./auth-validation";
import { hashSessionToken } from "./auth";

describe("authentication helpers", () => {
  it("normalizes email addresses", () => {
    expect(normalizeEmail("  Student@Example.COM ")).toBe("student@example.com");
  });

  it("only accepts local return paths", () => {
    expect(safeReturnPath("/progress?view=week")).toBe("/progress?view=week");
    expect(safeReturnPath("https://evil.example/path")).toBe("/");
    expect(safeReturnPath("//evil.example/path")).toBe("/");
  });

  it("rejects cross-origin auth mutations", () => {
    const same = new Request("https://learn.example/api/auth/login", { headers: { origin: "https://learn.example" } });
    const cross = new Request("https://learn.example/api/auth/login", { headers: { origin: "https://evil.example" } });
    expect(isSameOriginRequest(same)).toBe(true);
    expect(isSameOriginRequest(cross)).toBe(false);
  });

  it("stores a one-way digest instead of the session token", () => {
    const token = "secret-session-token";
    expect(hashSessionToken(token)).toHaveLength(64);
    expect(hashSessionToken(token)).not.toContain(token);
  });

  it("rejects passwords beyond bcrypt's 72-byte input limit", () => {
    expect(registerInputSchema.safeParse({
      email: "student@example.com",
      password: "学".repeat(25),
      deviceKey: "guest_test_device",
    }).success).toBe(false);
  });
});
