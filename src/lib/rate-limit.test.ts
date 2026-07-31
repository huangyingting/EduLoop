import { describe, expect, it } from "vitest";
import {
  addressRateLimitKey,
  clientAddress,
  identityRateLimitKey,
  rateLimitBucketId,
} from "./rate-limit";

describe("rate-limit helpers", () => {
  it("uses the first proxy address and safe fallbacks", () => {
    expect(clientAddress(new Request("https://example.com", {
      headers: { "x-forwarded-for": "198.51.100.4, 10.0.0.2" },
    }))).toBe("198.51.100.4");
    expect(clientAddress(new Request("https://example.com", {
      headers: { "x-real-ip": "203.0.113.8" },
    }))).toBe("203.0.113.8");
    expect(clientAddress(new Request("https://example.com"))).toBe("local");
  });

  it("discards untrusted forwarded prefixes at the production proxy boundary", () => {
    const spoofedPrefix = new Request("https://example.com", {
      headers: { "x-forwarded-for": "192.0.2.99, 198.51.100.4" },
    });
    const twoProxyChain = new Request("https://example.com", {
      headers: { "x-forwarded-for": "198.51.100.4, 203.0.113.8" },
    });

    expect(clientAddress(spoofedPrefix, { NODE_ENV: "production" })).toBe("198.51.100.4");
    expect(clientAddress(twoProxyChain, {
      NODE_ENV: "production",
      TRUSTED_PROXY_HOPS: "2",
    })).toBe("198.51.100.4");
  });

  it("hashes identities into stable, window-specific bucket IDs", () => {
    const key = identityRateLimitKey("auth-register", "learner@example.com");
    const first = rateLimitBucketId(key, 1_000, 10_000);
    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(first).not.toContain(key);
    expect(rateLimitBucketId(key, 1_000, 10_999)).toBe(first);
    expect(rateLimitBucketId(key, 1_000, 11_000)).not.toBe(first);
    expect(rateLimitBucketId(key, 2_000, 10_000)).not.toBe(first);
  });

  it("separates address and identity dimensions before hashing", () => {
    expect(addressRateLimitKey("auth-login", "198.51.100.4")).toBe(
      "auth-login:address:198.51.100.4",
    );
    expect(identityRateLimitKey("auth-login", "learner@example.com")).toBe(
      "auth-login:identity:learner@example.com",
    );
    expect(addressRateLimitKey("auth-login", "same-value")).not.toBe(
      identityRateLimitKey("auth-login", "same-value"),
    );
  });
});
