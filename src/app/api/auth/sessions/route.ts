import { NextResponse } from "next/server";
import { revokeAccountSessions } from "@/lib/account";
import { apiError, apiMessageError, apiHandler, enforceRateLimit } from "@/lib/api";
import { requestLocale, type Locale } from "@/i18n/config";
import { runAfterResponse } from "@/lib/after-response";
import { getSessionUser } from "@/lib/auth";
import { hasRecentAuthentication, isSameOriginRequest } from "@/lib/auth-validation";
import { emailConfiguration, sendSessionsRevokedNotice } from "@/lib/email";
import { errorLogMetadata } from "@/lib/logging";

export const runtime = "nodejs";

async function notifySessionRevocation(email: string, locale: Locale) {
  try {
    await sendSessionsRevokedNotice(email, { locale });
  } catch (error) {
    console.error(JSON.stringify({
      level: "error",
      event: "session_revocation_notification_failed",
      ...errorLogMetadata(error),
    }));
  }
}

async function deleteAccountSessions(request: Request) {
  if (!isSameOriginRequest(request)) return apiError("Invalid request origin.", 403, "FORBIDDEN");
  const user = await getSessionUser(request, { allowMissingConsent: true });
  if (!user) return apiMessageError("signInRequired", 401, "UNAUTHORIZED");
  if (!hasRecentAuthentication(user.authenticatedAt)) {
    return apiMessageError("reauthRevokeSessions", 401, "UNAUTHORIZED");
  }
  const limited = await enforceRateLimit(
    request,
    "account-sessions-revoke",
    { identity: user.id, identityLimit: 5 },
    60 * 60_000,
  );
  if (limited) return limited;

  const outcome = await revokeAccountSessions(user.id, user.sessionVersion);
  if (outcome === "CONFLICT") {
    return apiMessageError("sessionChanged", 409, "CONFLICT");
  }
  if (emailConfiguration()) {
    await runAfterResponse("session_revocation_notice", () => notifySessionRevocation(user.email, requestLocale(request)));
  }
  return NextResponse.json({ revoked: true }, { headers: { "Cache-Control": "no-store" } });
}

export const DELETE = apiHandler("DELETE /api/auth/sessions", deleteAccountSessions);
