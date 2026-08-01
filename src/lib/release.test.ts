import { describe, expect, it } from "vitest";
import { applicationRelease, RELEASE_ID_PATTERN } from "./release";

describe("application release identity", () => {
  it("uses a trimmed, bounded configured release", () => {
    expect(applicationRelease({
      APP_VERSION: " release-2026.08.01_abc123 ",
      NODE_ENV: "production",
    })).toBe("release-2026.08.01_abc123");
  });

  it("fails closed for missing or unsafe production identities", () => {
    for (const APP_VERSION of [
      undefined,
      "",
      "release/private",
      "private release",
      "development",
      "UNAVAILABLE",
      `r${"x".repeat(128)}`,
    ]) {
      expect(applicationRelease({ APP_VERSION, NODE_ENV: "production" })).toBeNull();
    }
  });

  it("uses only safe package or development fallbacks outside production", () => {
    expect(applicationRelease({ npm_package_version: "0.1.0" })).toBe("0.1.0");
    expect(applicationRelease({
      APP_VERSION: "private/release",
      npm_package_version: "private package value",
    })).toBe("development");
    expect(RELEASE_ID_PATTERN.test("release:private")).toBe(false);
  });
});
