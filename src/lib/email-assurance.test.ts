import { describe, expect, it } from "vitest";
import { googleProfileHasVerifiedEmail, providerProfileVerifiesEmail } from "./email-assurance";

describe("provider email assurance", () => {
  it("accepts only Google's literal verified-email claim", () => {
    expect(googleProfileHasVerifiedEmail({ email_verified: true })).toBe(true);
    expect(googleProfileHasVerifiedEmail({ email_verified: "true" })).toBe(false);
    expect(googleProfileHasVerifiedEmail({ email_verified: false })).toBe(false);
    expect(googleProfileHasVerifiedEmail(undefined)).toBe(false);
  });

  it("requires Google's verified claim to match the exact EduLoop address", () => {
    const profile = { email: " Learner@Example.com ", email_verified: true };
    expect(providerProfileVerifiesEmail("google", profile, "learner@example.com")).toBe(true);
    expect(providerProfileVerifiesEmail("google", profile, "different@example.com")).toBe(false);
    expect(providerProfileVerifiesEmail("google", { email_verified: true }, "learner@example.com")).toBe(false);
  });

  it("does not infer mailbox control from Microsoft or Facebook profiles", () => {
    const profile = { email: "learner@example.com", email_verified: true };
    expect(providerProfileVerifiesEmail("microsoft-entra-id", profile, "learner@example.com")).toBe(false);
    expect(providerProfileVerifiesEmail("facebook", profile, "learner@example.com")).toBe(false);
  });
});
