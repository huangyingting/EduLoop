import { describe, expect, it } from "vitest";
import {
  createEmailDeliveryProbeId,
  EmailDeliveryProbeError,
  emailDeliveryProbeConfiguration,
} from "./email-delivery-probe";

const configured = {
  RESEND_API_KEY: "re_secret",
  AUTH_EMAIL_FROM: "EduLoop <accounts@example.com>",
  EMAIL_DELIVERY_PROBE_RECIPIENT: " operator@example.com ",
  EMAIL_DELIVERY_PROBE_CONFIRM_SEND: "1",
};

function expectCode(run: () => unknown, code: string) {
  try {
    run();
    throw new Error("Expected email probe configuration to fail.");
  } catch (error) {
    expect(error).toBeInstanceOf(EmailDeliveryProbeError);
    expect(error).toMatchObject({ code });
  }
}

describe("email delivery probe configuration", () => {
  it("requires explicit send confirmation before inspecting the recipient", () => {
    expectCode(() => emailDeliveryProbeConfiguration({
      ...configured,
      EMAIL_DELIVERY_PROBE_CONFIRM_SEND: undefined,
      EMAIL_DELIVERY_PROBE_RECIPIENT: "private-recipient@example.com",
    }), "EEMAIL_PROBE_CONFIRMATION");
  });

  it("accepts one trimmed operator-controlled recipient", () => {
    expect(emailDeliveryProbeConfiguration(configured)).toEqual({
      recipient: "operator@example.com",
    });
  });

  it("rejects invalid or display-name recipient forms", () => {
    for (const recipient of [undefined, "", "not-an-email", "Operator <operator@example.com>"]) {
      expectCode(() => emailDeliveryProbeConfiguration({
        ...configured,
        EMAIL_DELIVERY_PROBE_RECIPIENT: recipient,
      }), "EEMAIL_PROBE_RECIPIENT");
    }
  });

  it("requires both provider credentials and the verified sender setting", () => {
    expectCode(() => emailDeliveryProbeConfiguration({
      ...configured,
      AUTH_EMAIL_FROM: undefined,
    }), "EEMAIL_PROBE_CONFIGURATION");
    expectCode(() => emailDeliveryProbeConfiguration({
      ...configured,
      RESEND_API_KEY: undefined,
    }), "EEMAIL_PROBE_CONFIGURATION");
  });

  it("creates non-identifying fixed-width probe IDs", () => {
    expect(createEmailDeliveryProbeId()).toMatch(/^[a-f0-9]{16}$/);
  });

  it("keeps recipient and provider values out of fixed errors", () => {
    let error: unknown;
    try {
      emailDeliveryProbeConfiguration({
        ...configured,
        RESEND_API_KEY: undefined,
        AUTH_EMAIL_FROM: "private-sender@example.com",
      });
    } catch (caught) {
      error = caught;
    }
    expect(String(error)).not.toContain("operator@example.com");
    expect(String(error)).not.toContain("private-sender@example.com");
  });
});
