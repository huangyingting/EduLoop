import { describe, expect, it } from "vitest";
import {
  applicationAuthSecret,
  AUTH_SECRET_MAX_LENGTH,
  AUTH_SECRET_MIN_LENGTH,
  isValidProductionAuthSecret,
} from "./auth-secret";

const generatedSecret = "SSzYj-celXpbS2EtZa-O5peWz2GgexyAlnLELc5J5n8";

describe("application auth secret", () => {
  it("accepts a generated production-sized secret", () => {
    expect(generatedSecret).toHaveLength(AUTH_SECRET_MIN_LENGTH);
    expect(isValidProductionAuthSecret(generatedSecret)).toBe(true);
    expect(applicationAuthSecret({
      NODE_ENV: "production",
      AUTH_SECRET: generatedSecret,
    })).toBe(generatedSecret);
  });

  it("rejects missing, malformed, low-diversity, and placeholder production secrets", () => {
    for (const AUTH_SECRET of [
      undefined,
      "x".repeat(AUTH_SECRET_MIN_LENGTH - 1),
      "x".repeat(AUTH_SECRET_MIN_LENGTH),
      ` ${generatedSecret}`,
      `${generatedSecret}\n`,
      "replace-with-at-least-32-random-characters",
      "ci-only-auth-secret-with-at-least-32-characters",
      "a-production-secret-with-at-least-32-characters",
      `A${"b".repeat(AUTH_SECRET_MAX_LENGTH)}`,
    ]) {
      expect(isValidProductionAuthSecret(AUTH_SECRET)).toBe(false);
      expect(applicationAuthSecret({ NODE_ENV: "production", AUTH_SECRET })).toBeNull();
    }
  });

  it("retains an isolated fallback outside production", () => {
    expect(applicationAuthSecret({ NODE_ENV: "test" })).toBe(
      "eduloop-development-secret-change-before-production",
    );
    expect(applicationAuthSecret({
      NODE_ENV: "development",
      AUTH_SECRET: "local-test-secret",
    })).toBe("local-test-secret");
  });
});
