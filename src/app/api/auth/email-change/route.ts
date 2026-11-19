import { NextResponse } from "next/server";
import { apiError, apiMessageError, apiHandler, enforceRateLimit, readJsonBody } from "@/lib/api";
import { runAfterResponse } from "@/lib/after-response";
import { getSessionUser, verifyPassword } from "@/lib/auth";
import {
  emailChangeCompletionSchema,
  emailChangeRequestSchema,
  hasRecentAuthentication,
  isSameOriginRequest,
  normalizeEmail,
} from "@/lib/auth-validation";
import {
  completeEmailChange,
  deliverEmailChangeVerification,
  hashEmailChangeToken,
  issueEmailChangeToken,
} from "@/lib/email-change";
import { emailConfiguration, sendEmailChangedNotice } from "@/lib/email";
import { errorLogMetadata } from "@/lib/logging";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

function emailChangeOrigin(request: Request) {
  const configured = process.env.AUTH_URL?.trim();
  return configured ? new URL(configured).origin : new URL(request.url).origin;
}

async function requestEmailChange(request: Request) {
  if (!isSameOriginRequest(request)) return apiError("Invalid request origin.", 403, "FORBIDDEN");
  const user = await getSessionUser(request, { allowMissingConsent: true });
  if (!user) return apiMessageError("signInRequired", 401, "UNAUTHORIZED");
  const limited = await enforceRateLimit(
    request,
    "account-email-change",
    { identity: user.id, identityLimit: 3 },
    60 * 60_000,
  );
  if (limited) return limited;
  const body = await readJsonBody(request);
  if (!body.ok) return body.response;
  const parsed = emailChangeRequestSchema.safeParse(body.value);
  if (!parsed.success) return apiMessageError("emailChangeInvalid", 400, "INVALID_REQUEST");

  if (user.hasPassword) {
    const stored = await prisma.user.findUnique({
      where: { id: user.id },
      select: { passwordHash: true },
    });
    if (!parsed.data.currentPassword || !stored?.passwordHash || !await verifyPassword(parsed.data.currentPassword, stored.passwordHash)) {
      return apiMessageError("currentPasswordWrong", 401, "UNAUTHORIZED");
    }
  } else if (!hasRecentAuthentication(user.authenticatedAt)) {
    return apiMessageError("reauthEmailChange", 401, "UNAUTHORIZED");
  }
  if (!emailConfiguration()) {
    return apiMessageError("emailChangeUnavailable", 503, "SERVICE_UNAVAILABLE");
  }

  const newEmail = normalizeEmail(parsed.data.newEmail);
  const issued = await issueEmailChangeToken(user.id, newEmail, user.sessionVersion);
  if (issued.status === "NOT_FOUND") return apiMessageError("accountMissing", 404, "NOT_FOUND");
  if (issued.status === "UNCHANGED") return apiMessageError("emailUnchanged", 400, "INVALID_REQUEST");
  if (issued.status === "SECURITY_CONFLICT") {
    return apiMessageError("securityChanged", 409, "CONFLICT");
  }
  if (issued.status === "CONFLICT") return apiMessageError("emailTaken", 409, "CONFLICT");

  const origin = emailChangeOrigin(request);
  await runAfterResponse(
    "email_change_delivery",
    () => deliverEmailChangeVerification(issued, origin),
  );
  return NextResponse.json({ accepted: true }, {
    status: 202,
    headers: { "Cache-Control": "no-store" },
  });
}

async function notifyPreviousEmail(oldEmail: string, newEmail: string) {
  try {
    await sendEmailChangedNotice(oldEmail, newEmail);
  } catch (error) {
    console.error(JSON.stringify({
      level: "error",
      event: "email_change_notification_failed",
      ...errorLogMetadata(error),
    }));
  }
}

async function confirmEmailChange(request: Request) {
  if (!isSameOriginRequest(request)) return apiError("Invalid request origin.", 403, "FORBIDDEN");
  const body = await readJsonBody(request);
  if (!body.ok) return body.response;
  const parsed = emailChangeCompletionSchema.safeParse(body.value);
  if (!parsed.success) return apiMessageError("emailChangeLinkInvalid", 400, "INVALID_REQUEST");
  const limited = await enforceRateLimit(
    request,
    "account-email-change-complete",
    {
      addressLimit: 40,
      identity: hashEmailChangeToken(parsed.data.token),
      identityLimit: 8,
    },
    15 * 60_000,
  );
  if (limited) return limited;

  const outcome = await completeEmailChange(parsed.data.token);
  if (outcome.status === "INVALID") {
    return apiMessageError("emailChangeLinkExpired", 400, "INVALID_REQUEST");
  }
  if (outcome.status === "CONFLICT") {
    return apiMessageError("emailTakenRetry", 409, "CONFLICT");
  }
  if (emailConfiguration()) {
    await runAfterResponse(
      "email_change_notice",
      () => notifyPreviousEmail(outcome.oldEmail, outcome.newEmail),
    );
  }
  return NextResponse.json({ changed: true }, { headers: { "Cache-Control": "no-store" } });
}

export const POST = apiHandler("POST /api/auth/email-change", requestEmailChange);
export const PATCH = apiHandler("PATCH /api/auth/email-change", confirmEmailChange);
