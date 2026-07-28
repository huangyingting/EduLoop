import { describe, expect, it } from "vitest";
import { contentSecurityPolicy, securityHeaders } from "./security-headers";

describe("browser security headers", () => {
  it("restricts every active resource class in production", () => {
    const policy = contentSecurityPolicy(true);
    for (const directive of ["default-src", "script-src", "style-src", "img-src", "font-src", "connect-src", "media-src", "worker-src"]) {
      expect(policy).toContain(`${directive} `);
    }
    expect(policy).not.toContain("'unsafe-eval'");
    expect(policy).not.toContain("ws:");
    expect(securityHeaders("production")).toContainEqual({
      key: "Strict-Transport-Security",
      value: "max-age=31536000; includeSubDomains",
    });
  });

  it("limits hot-reload allowances to development", () => {
    const policy = contentSecurityPolicy(false);
    expect(policy).toContain("'unsafe-eval'");
    expect(policy).toContain("connect-src 'self' ws: wss:");
    expect(securityHeaders("development").some(({ key }) => key === "Strict-Transport-Security")).toBe(false);
  });
});
