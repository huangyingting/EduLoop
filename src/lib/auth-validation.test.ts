import { describe, expect, it } from "vitest";
import { accountDeletionSchema, isSameOriginRequest, normalizeEmail, passwordChangeSchema, registerInputSchema, safeReturnPath } from "./auth-validation";
import { PASSWORD_HASH_COST, hashSessionToken, passwordHashNeedsUpgrade } from "./auth";

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
