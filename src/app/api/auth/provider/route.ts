import { NextResponse } from "next/server";
import { apiError, apiMessageError, apiHandler, enforceRateLimit, readJsonBody } from "@/lib/api";
import { requestLocale, type Locale } from "@/i18n/config";
import { runAfterResponse } from "@/lib/after-response";
import { getSessionUser } from "@/lib/auth";
import { hasRecentAuthentication, isSameOriginRequest, providerDisconnectSchema } from "@/lib/auth-validation";
import { emailConfiguration, sendProviderDisconnectedNotice } from "@/lib/email";
import { errorLogMetadata } from "@/lib/logging";
import { disconnectProviderAccount } from "@/lib/provider-account";
import { socialProviderLabel } from "@/lib/social-providers";

export const runtime = "nodejs";

async function notifyProviderDisconnect(email: string, provider: string, locale: Locale) {
  try {
    await sendProviderDisconnectedNotice(email, provider, { locale });
  } catch (error) {
    console.error(JSON.stringify({
      level: "error",
      event: "provider_disconnect_notification_failed",
      ...errorLogMetadata(error),
    }));
  }
}

async function disconnectCurrentProvider(request: Request) {
  if (!isSameOriginRequest(request)) return apiError("Invalid request origin.", 403, "FORBIDDEN");
  const user = await getSessionUser(request, { allowMissingConsent: true });
  if (!user) return apiMessageError("signInRequired", 401, "UNAUTHORIZED");
  if (!hasRecentAuthentication(user.authenticatedAt)) {
    return apiMessageError("reauthRemoveProvider", 401, "UNAUTHORIZED");
  }
  const limited = await enforceRateLimit(
    request,
    "account-provider-disconnect",
    { identity: user.id, identityLimit: 5 },
    60 * 60_000,
  );
  if (limited) return limited;
  const body = await readJsonBody(request);
  if (!body.ok) return body.response;
  const parsed = providerDisconnectSchema.safeParse(body.value);
  if (!parsed.success) return apiMessageError("providerInvalid", 400, "INVALID_REQUEST");

  const outcome = await disconnectProviderAccount(user.id, user.sessionVersion, parsed.data.provider);
  if (outcome.status === "NOT_FOUND") return apiMessageError("accountMissing", 404, "NOT_FOUND");
  if (outcome.status === "NOT_CONNECTED") return apiMessageError("providerNotConnected", 404, "NOT_FOUND");
  if (outcome.status === "LAST_LOGIN_METHOD") {
    return apiMessageError("lastSignInMethod", 409, "CONFLICT");
  }
  if (outcome.status === "CONFLICT") {
    return apiMessageError("signInMethodsChanged", 409, "CONFLICT");
  }

  const provider = socialProviderLabel(parsed.data.provider);
  if (emailConfiguration()) {
    await runAfterResponse(
      "provider_disconnect_notice",
      () => notifyProviderDisconnect(outcome.email, provider, requestLocale(request)),
    );
  }
  return NextResponse.json({ disconnected: true, provider: parsed.data.provider }, {
    headers: { "Cache-Control": "no-store" },
  });
}

export const DELETE = apiHandler("DELETE /api/auth/provider", disconnectCurrentProvider);
