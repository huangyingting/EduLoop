import { describe, expect, it } from "vitest";
import {
  proofExpiration,
  registrationExpiration,
  STALE_REGISTRATION_RETENTION_DAYS,
} from "./retention";

describe("retention deadlines", () => {
  it("gives an unverified password registration exactly 30 days", () => {
    const now = new Date("2026-07-31T12:00:00.000Z");
    expect(STALE_REGISTRATION_RETENTION_DAYS).toBe(30);
    expect(registrationExpiration(now)).toEqual(new Date("2026-08-30T12:00:00.000Z"));
  });

  it("caps proof validity at the registration deadline", () => {
    const now = new Date("2026-07-31T12:00:00.000Z");
    const deadline = new Date("2026-07-31T12:05:00.000Z");
    expect(proofExpiration(now, 24 * 60 * 60_000, deadline)).toEqual(deadline);
    expect(proofExpiration(now, 30 * 60_000, null)).toEqual(
      new Date("2026-07-31T12:30:00.000Z"),
    );
  });

  it("rejects invalid retention inputs", () => {
    expect(() => registrationExpiration(new Date(Number.NaN))).toThrow("Registration time must be valid.");
    expect(() => proofExpiration(new Date(Number.NaN), 1, null)).toThrow("Proof time must be valid.");
    expect(() => proofExpiration(new Date(), 0, null)).toThrow("Proof lifetime must be positive.");
  });
});
