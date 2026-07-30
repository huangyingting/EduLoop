import { describe, expect, it } from "vitest";
import { accountDeletionSchema, hasRecentAuthentication, isSameOriginRequest, normalizeEmail, passwordChangeSchema, registerInputSchema, safeReturnPath, SENSITIVE_ACTION_MAX_AGE_SECONDS } from "./auth-validation";
import { AUTH_SESSION_COOKIE, PASSWORD_HASH_COST, passwordHashNeedsUpgrade } from "./auth";

describe("authentication helpers", () => {
  it("normalizes email addresses", () => {
    expect(normalizeEmail("  Student@Example.COM ")).toBe("student@example.com");
  });

  it("only accepts local return paths", () => {
    expect(safeReturnPath("/progress?view=week")).toBe("/progress?view=week");
    expect(safeReturnPath("https://evil.example/path")).toBe("/");
    expect(safeReturnPath("//evil.example/path")).toBe("/");
    expect(safeReturnPath("/\\evil.example/path")).toBe("/");
    expect(safeReturnPath("/%5Cevil.example/path")).toBe("/");
    expect(safeReturnPath("/progress\n/elsewhere")).toBe("/");
    expect(safeReturnPath("/login")).toBe("/");
    expect(safeReturnPath("/register/step-two")).toBe("/");
    expect(safeReturnPath("/api/auth/session")).toBe("/");
  });

  it("rejects cross-origin auth mutations", () => {
    const same = new Request("https://learn.example/api/auth/login", { headers: { origin: "https://learn.example" } });
    const cross = new Request("https://learn.example/api/auth/login", { headers: { origin: "https://evil.example" } });
    expect(isSameOriginRequest(same)).toBe(true);
    expect(isSameOriginRequest(cross)).toBe(false);
    expect(isSameOriginRequest(new Request("https://learn.example/api/auth/login", {
      headers: { "sec-fetch-site": "cross-site" },
    }))).toBe(false);
    expect(isSameOriginRequest(new Request("https://learn.example/api/auth/login"))).toBe(true);
  });

  it("uses the public request host instead of a standalone bind address", () => {
    const direct = new Request("http://0.0.0.0:3000/api/auth/login", {
      headers: { host: "learn.example:3000", origin: "http://learn.example:3000" },
    });
    const proxied = new Request("http://127.0.0.1:3000/api/auth/login", {
      headers: {
        host: "internal:3000",
        origin: "https://learn.example",
        "x-forwarded-host": "learn.example",
        "x-forwarded-proto": "https",
      },
    });
    const cross = new Request("http://0.0.0.0:3000/api/auth/login", {
      headers: { host: "learn.example:3000", origin: "http://evil.example:3000" },
    });
    expect(isSameOriginRequest(direct)).toBe(true);
    expect(isSameOriginRequest(proxied)).toBe(true);
    expect(isSameOriginRequest(cross)).toBe(false);
  });

  it("uses Auth.js' host-only session cookie", () => {
    expect(AUTH_SESSION_COOKIE).toMatch(/authjs\.session-token$/);
  });

  it("requires a recent login for sensitive social-account actions", () => {
    const now = 10_000;
    expect(hasRecentAuthentication(now - SENSITIVE_ACTION_MAX_AGE_SECONDS, now)).toBe(true);
    expect(hasRecentAuthentication(now - SENSITIVE_ACTION_MAX_AGE_SECONDS - 1, now)).toBe(false);
    expect(hasRecentAuthentication(0, now)).toBe(false);
    expect(hasRecentAuthentication(now + 61, now)).toBe(false);
  });

  it("rejects passwords beyond bcrypt's 72-byte input limit", () => {
    expect(registerInputSchema.safeParse({
      email: "student@example.com",
      password: "学".repeat(25),
    }).success).toBe(false);
    expect(passwordChangeSchema.safeParse({ currentPassword: "current-password", newPassword: "学".repeat(25) }).success).toBe(false);
    expect(accountDeletionSchema.safeParse({ currentPassword: "" }).success).toBe(false);
  });

  it("upgrades old or unrecognized password hashes without downgrading stronger hashes", () => {
    expect(passwordHashNeedsUpgrade(`$2b$${PASSWORD_HASH_COST - 1}$placeholder`)).toBe(true);
    expect(passwordHashNeedsUpgrade(`$2b$${PASSWORD_HASH_COST}$placeholder`)).toBe(false);
    expect(passwordHashNeedsUpgrade(`$2b$${PASSWORD_HASH_COST + 1}$placeholder`)).toBe(false);
    expect(passwordHashNeedsUpgrade("legacy-hash")).toBe(true);
  });
});
