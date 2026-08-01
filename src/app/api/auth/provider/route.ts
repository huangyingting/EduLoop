import { NextResponse } from "next/server";
import { apiError, apiHandler, enforceRateLimit, readJsonBody } from "@/lib/api";
import { runAfterResponse } from "@/lib/after-response";
import { getSessionUser } from "@/lib/auth";
import { hasRecentAuthentication, isSameOriginRequest, providerDisconnectSchema } from "@/lib/auth-validation";
import { emailConfiguration, sendProviderDisconnectedNotice } from "@/lib/email";
import { errorLogMetadata } from "@/lib/logging";
import { disconnectProviderAccount } from "@/lib/provider-account";
import { socialProviderLabel } from "@/lib/social-providers";

export const runtime = "nodejs";

async function notifyProviderDisconnect(email: string, provider: string) {
  try {
    await sendProviderDisconnectedNotice(email, provider);
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
  if (!user) return apiError("请先登录。", 401, "UNAUTHORIZED");
  if (!hasRecentAuthentication(user.authenticatedAt)) {
    return apiError("移除登录方式前请重新登录，以确认这是你的账号。", 401, "UNAUTHORIZED");
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
  if (!parsed.success) return apiError("请选择有效的社交登录方式。", 400, "INVALID_REQUEST");

  const outcome = await disconnectProviderAccount(user.id, user.sessionVersion, parsed.data.provider);
  if (outcome.status === "NOT_FOUND") return apiError("账号不存在。", 404, "NOT_FOUND");
  if (outcome.status === "NOT_CONNECTED") return apiError("该登录方式未连接到当前账号。", 404, "NOT_FOUND");
  if (outcome.status === "LAST_LOGIN_METHOD") {
    return apiError("不能移除最后一种登录方式。请先设置密码或连接其他社交账号。", 409, "CONFLICT");
  }
  if (outcome.status === "CONFLICT") {
    return apiError("账号登录方式刚刚发生变化，请重新登录后再试。", 409, "CONFLICT");
  }

  const provider = socialProviderLabel(parsed.data.provider);
  if (emailConfiguration()) {
    await runAfterResponse(
      "provider_disconnect_notice",
      () => notifyProviderDisconnect(outcome.email, provider),
    );
  }
  return NextResponse.json({ disconnected: true, provider: parsed.data.provider }, {
    headers: { "Cache-Control": "no-store" },
  });
}

export const DELETE = apiHandler("DELETE /api/auth/provider", disconnectCurrentProvider);
