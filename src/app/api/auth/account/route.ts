import { NextResponse } from "next/server";
import { apiError, apiMessageError, apiHandler, enforceRateLimit, readJsonBody } from "@/lib/api";
import { requestLocale, type Locale } from "@/i18n/config";
import { runAfterResponse } from "@/lib/after-response";
import { changeAccountPassword, deleteAccount } from "@/lib/account";
import { getSessionUser } from "@/lib/auth";
import { accountDeletionSchema, hasRecentAuthentication, isSameOriginRequest, passwordChangeSchema } from "@/lib/auth-validation";
import { emailConfiguration, sendAccountDeletedNotice, sendPasswordChangedNotice } from "@/lib/email";
import { deliverEmailVerification } from "@/lib/email-verification";
import { errorLogMetadata } from "@/lib/logging";

export const runtime = "nodejs";

function accountOrigin(request: Request) {
  const configured = process.env.AUTH_URL?.trim();
  return configured ? new URL(configured).origin : new URL(request.url).origin;
}

async function notifyPasswordChange(email: string, locale: Locale) {
  try {
    await sendPasswordChangedNotice(email, { locale });
  } catch (error) {
    console.error(JSON.stringify({
      level: "error",
      event: "password_change_notification_failed",
      ...errorLogMetadata(error),
    }));
  }
}

async function notifyAccountDeletion(email: string, locale: Locale) {
  try {
    await sendAccountDeletedNotice(email, { locale });
  } catch (error) {
    console.error(JSON.stringify({
      level: "error",
      event: "account_deletion_notification_failed",
      ...errorLogMetadata(error),
    }));
  }
}

async function patchAccount(request: Request) {
  if (!isSameOriginRequest(request)) return apiError("Invalid request origin.", 403, "FORBIDDEN");
  const user = await getSessionUser(request);
  if (!user) return apiMessageError("signInRequired", 401, "UNAUTHORIZED");
  if (!user.hasPassword && !hasRecentAuthentication(user.authenticatedAt)) {
    return apiMessageError("reauthSetPassword", 401, "UNAUTHORIZED");
  }
  const limited = await enforceRateLimit(
    request,
    "account-password",
    { identity: user.id, identityLimit: 5 },
    15 * 60_000,
  );
  if (limited) return limited;
  const body = await readJsonBody(request);
  if (!body.ok) return body.response;
  const parsed = passwordChangeSchema.safeParse(body.value);
  if (!parsed.success) return apiMessageError("passwordLength", 400, "INVALID_REQUEST");

  const outcome = await changeAccountPassword(
    user.id,
    user.sessionVersion,
    parsed.data.currentPassword,
    parsed.data.newPassword,
  );
  if (outcome === "INVALID_PASSWORD") return apiMessageError("currentPasswordWrong", 401, "UNAUTHORIZED");
  if (outcome === "NOT_FOUND") return apiMessageError("accountMissing", 404, "NOT_FOUND");
  if (outcome === "UNCHANGED") return apiMessageError("passwordUnchanged", 400, "INVALID_REQUEST");
  if (outcome === "CONFLICT") return apiMessageError("securityChanged", 409, "CONFLICT");
  if (outcome === "PASSWORD_SET_VERIFICATION_REQUIRED") {
    const verificationScheduled = Boolean(emailConfiguration());
    if (verificationScheduled) {
      const origin = accountOrigin(request);
      await runAfterResponse(
        "email_verification_delivery",
        () => deliverEmailVerification(user.email, origin, requestLocale(request)),
      );
    }
    return NextResponse.json({ changed: true, verificationRequired: true, verificationScheduled }, {
      headers: { "Cache-Control": "no-store" },
    });
  }
  if (emailConfiguration()) {
    await runAfterResponse("password_change_notice", () => notifyPasswordChange(user.email, requestLocale(request)));
  }
  return NextResponse.json({ changed: true }, { headers: { "Cache-Control": "no-store" } });
}

async function deleteCurrentAccount(request: Request) {
  if (!isSameOriginRequest(request)) return apiError("Invalid request origin.", 403, "FORBIDDEN");
  const user = await getSessionUser(request, { allowMissingConsent: true });
  if (!user) return apiMessageError("signInRequired", 401, "UNAUTHORIZED");
  if (!user.hasPassword && !hasRecentAuthentication(user.authenticatedAt)) {
    return apiMessageError("reauthDeleteAccount", 401, "UNAUTHORIZED");
  }
  const limited = await enforceRateLimit(
    request,
    "account-delete",
    { identity: user.id, identityLimit: 3 },
    60 * 60_000,
  );
  if (limited) return limited;
  const body = await readJsonBody(request);
  if (!body.ok) return body.response;
  const parsed = accountDeletionSchema.safeParse(body.value);
  if (!parsed.success) return apiMessageError("currentPasswordRequired", 400, "INVALID_REQUEST");

  const outcome = await deleteAccount(user.id, user.sessionVersion, parsed.data);
  if (outcome === "NOT_FOUND") return apiMessageError("accountMissing", 404, "NOT_FOUND");
  if (outcome === "INVALID_CONFIRMATION") {
    return apiMessageError(user.hasPassword ? "currentPasswordWrong" : "emailConfirmationWrong", 401, "UNAUTHORIZED");
  }
  if (outcome === "CONFLICT") {
    return apiMessageError("securityChanged", 409, "CONFLICT");
  }
  if (emailConfiguration()) {
    await runAfterResponse("account_deletion_notice", () => notifyAccountDeletion(user.email, requestLocale(request)));
  }
  return NextResponse.json({ deleted: true }, { headers: { "Cache-Control": "no-store" } });
}

export const PATCH = apiHandler("PATCH /api/auth/account", patchAccount);
export const DELETE = apiHandler("DELETE /api/auth/account", deleteCurrentAccount);
