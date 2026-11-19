import { NextResponse } from "next/server";
import { apiError, apiMessageError, apiHandler, enforceRateLimit, readJsonBody } from "@/lib/api";
import { runAfterResponse } from "@/lib/after-response";
import {
  emailVerificationCompletionSchema,
  emailVerificationRequestSchema,
  isSameOriginRequest,
  normalizeEmail,
} from "@/lib/auth-validation";
import {
  deliverEmailVerification,
  hashEmailVerificationToken,
  verifyEmailWithToken,
} from "@/lib/email-verification";
import { emailConfiguration } from "@/lib/email";
import { requestLocale } from "@/i18n/config";

export const runtime = "nodejs";

const acceptedMessage = "If this email needs verification, a verification email is on its way.";

function verificationOrigin(request: Request) {
  const configured = process.env.AUTH_URL?.trim();
  return configured ? new URL(configured).origin : new URL(request.url).origin;
}

async function requestEmailVerification(request: Request) {
  if (!isSameOriginRequest(request)) return apiError("Invalid request origin.", 403, "FORBIDDEN");
  const body = await readJsonBody(request);
  if (!body.ok) return body.response;
  const parsed = emailVerificationRequestSchema.safeParse(body.value);
  if (!parsed.success) return apiMessageError("emailInvalid", 400, "INVALID_REQUEST");
  const email = normalizeEmail(parsed.data.email);
  const limited = await enforceRateLimit(request, "auth-email-verification-request", {
    addressLimit: 20,
    identity: email,
    identityLimit: 3,
  }, 60 * 60_000);
  if (limited) return limited;

  if (emailConfiguration()) {
    const origin = verificationOrigin(request);
    await runAfterResponse(
      "email_verification_delivery",
      () => deliverEmailVerification(email, origin, requestLocale(request)),
    );
  }

  return NextResponse.json({ accepted: true, message: acceptedMessage }, {
    status: 202,
    headers: { "Cache-Control": "no-store" },
  });
}

async function completeEmailVerification(request: Request) {
  if (!isSameOriginRequest(request)) return apiError("Invalid request origin.", 403, "FORBIDDEN");
  const body = await readJsonBody(request);
  if (!body.ok) return body.response;
  const parsed = emailVerificationCompletionSchema.safeParse(body.value);
  if (!parsed.success) return apiMessageError("verificationInvalid", 400, "INVALID_REQUEST");
  const limited = await enforceRateLimit(
    request,
    "auth-email-verification-complete",
    {
      addressLimit: 40,
      identity: hashEmailVerificationToken(parsed.data.token),
      identityLimit: 8,
    },
    15 * 60_000,
  );
  if (limited) return limited;

  const outcome = await verifyEmailWithToken(parsed.data.token, parsed.data.password);
  if (outcome.status === "INVALID") {
    return apiMessageError("verificationExpired", 400, "INVALID_REQUEST");
  }
  if (outcome.status === "INVALID_PASSWORD") {
    return apiMessageError("verificationWrongPassword", 401, "UNAUTHORIZED");
  }
  if (outcome.status === "CONFLICT") {
    return apiMessageError("securityChangedVerification", 409, "CONFLICT");
  }
  return NextResponse.json({
    verified: true,
    providersDisconnected: outcome.providersDisconnected,
  }, { headers: { "Cache-Control": "no-store" } });
}

export const POST = apiHandler("POST /api/auth/email-verification", requestEmailVerification);
export const PATCH = apiHandler("PATCH /api/auth/email-verification", completeEmailVerification);
