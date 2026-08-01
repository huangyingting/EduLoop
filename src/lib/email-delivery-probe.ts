import { randomBytes } from "node:crypto";
import { z } from "zod";
import { emailConfiguration } from "./email";

type EmailProbeEnvironment = Record<string, string | undefined>;

export type EmailDeliveryProbeErrorCode =
  | "EEMAIL_PROBE_CONFIGURATION"
  | "EEMAIL_PROBE_CONFIRMATION"
  | "EEMAIL_PROBE_RECIPIENT";

const ERROR_MESSAGES: Record<EmailDeliveryProbeErrorCode, string> = {
  EEMAIL_PROBE_CONFIGURATION: "RESEND_API_KEY and AUTH_EMAIL_FROM are required for an email delivery probe.",
  EEMAIL_PROBE_CONFIRMATION: "EMAIL_DELIVERY_PROBE_CONFIRM_SEND=1 is required before sending a probe.",
  EEMAIL_PROBE_RECIPIENT: "EMAIL_DELIVERY_PROBE_RECIPIENT must be one valid operator-controlled email address.",
};

const recipientSchema = z.string().trim().max(254).email();

export class EmailDeliveryProbeError extends Error {
  readonly code: EmailDeliveryProbeErrorCode;

  constructor(code: EmailDeliveryProbeErrorCode) {
    super(ERROR_MESSAGES[code]);
    this.name = "EmailDeliveryProbeError";
    this.code = code;
  }
}

export function emailDeliveryProbeConfiguration(environment: EmailProbeEnvironment = process.env) {
  if (environment.EMAIL_DELIVERY_PROBE_CONFIRM_SEND?.trim() !== "1") {
    throw new EmailDeliveryProbeError("EEMAIL_PROBE_CONFIRMATION");
  }
  const recipient = recipientSchema.safeParse(environment.EMAIL_DELIVERY_PROBE_RECIPIENT);
  if (!recipient.success) throw new EmailDeliveryProbeError("EEMAIL_PROBE_RECIPIENT");
  if (!emailConfiguration(environment)) {
    throw new EmailDeliveryProbeError("EEMAIL_PROBE_CONFIGURATION");
  }
  return { recipient: recipient.data };
}

export function createEmailDeliveryProbeId() {
  return randomBytes(8).toString("hex");
}
