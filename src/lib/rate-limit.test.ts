import { describe, expect, it } from "vitest";
import { checkRateLimit } from "./rate-limit";

describe("checkRateLimit", () => {
  it("allows requests within the window and rejects excess requests", () => {
    const key = `test-${Math.random()}`;
    expect(checkRateLimit(key, 2, 1_000, 10_000).allowed).toBe(true);
    expect(checkRateLimit(key, 2, 1_000, 10_100).allowed).toBe(true);
    expect(checkRateLimit(key, 2, 1_000, 10_200)).toMatchObject({ allowed: false, remaining: 0 });
  });

  it("opens a fresh bucket after the window", () => {
    const key = `test-${Math.random()}`;
    checkRateLimit(key, 1, 1_000, 20_000);
    expect(checkRateLimit(key, 1, 1_000, 21_001)).toMatchObject({ allowed: true, remaining: 0 });
  });
});
