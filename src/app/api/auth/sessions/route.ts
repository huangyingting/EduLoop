import { NextResponse } from "next/server";
import { revokeAccountSessions } from "@/lib/account";
import { apiError, apiHandler, enforceRateLimit } from "@/lib/api";
import { runAfterResponse } from "@/lib/after-response";
import { getSessionUser } from "@/lib/auth";
import { hasRecentAuthentication, isSameOriginRequest } from "@/lib/auth-validation";
import { emailConfiguration, sendSessionsRevokedNotice } from "@/lib/email";

export const runtime = "nodejs";

async function notifySessionRevocation(email: string) {
  try {
    await sendSessionsRevokedNotice(email);
  } catch (error) {
    console.error(JSON.stringify({
      level: "error",
      event: "session_revocation_notification_failed",
      message: error instanceof Error ? error.message : "Unknown email delivery error",
    }));
  }
}

async function deleteAccountSessions(request: Request) {
  if (!isSameOriginRequest(request)) return apiError("Invalid request origin.", 403, "FORBIDDEN");
  const user = await getSessionUser(request, { allowMissingConsent: true });
  if (!user) return apiError("请先登录。", 401, "UNAUTHORIZED");
  if (!hasRecentAuthentication(user.authenticatedAt)) {
    return apiError("退出所有设备前请重新登录，以确认这是你的账号。", 401, "UNAUTHORIZED");
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
    return apiError("账号会话刚刚发生变化，请重新登录后再试。", 409, "CONFLICT");
  }
  if (emailConfiguration()) {
    await runAfterResponse(() => notifySessionRevocation(user.email));
  }
  return NextResponse.json({ revoked: true }, { headers: { "Cache-Control": "no-store" } });
}

export const DELETE = apiHandler("DELETE /api/auth/sessions", deleteAccountSessions);
