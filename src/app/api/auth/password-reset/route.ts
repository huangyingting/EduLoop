import { NextResponse } from "next/server";
import { apiError, apiHandler, enforceRateLimit, readJsonBody } from "@/lib/api";
import { runAfterResponse } from "@/lib/after-response";
import { normalizeEmail, isSameOriginRequest, passwordResetCompletionSchema, passwordResetRequestSchema } from "@/lib/auth-validation";
import { emailConfiguration, sendPasswordChangedNotice } from "@/lib/email";
import { errorLogMetadata } from "@/lib/logging";
import { deliverPasswordReset, hashPasswordResetToken, resetPasswordWithToken } from "@/lib/password-reset";

export const runtime = "nodejs";

const acceptedMessage = "如果该邮箱对应一个账号，我们会发送一封密码重置邮件。";

function resetOrigin(request: Request) {
  const configured = process.env.AUTH_URL?.trim();
  return configured ? new URL(configured).origin : new URL(request.url).origin;
}

async function notifyPasswordChange(email: string) {
  try {
    await sendPasswordChangedNotice(email);
  } catch (error) {
    console.error(JSON.stringify({
      level: "error",
      event: "password_reset_notification_failed",
      ...errorLogMetadata(error),
    }));
  }
}

async function requestPasswordReset(request: Request) {
  if (!isSameOriginRequest(request)) return apiError("Invalid request origin.", 403, "FORBIDDEN");
  const body = await readJsonBody(request);
  if (!body.ok) return body.response;
  const parsed = passwordResetRequestSchema.safeParse(body.value);
  if (!parsed.success) return apiError("请输入有效的邮箱地址。", 400, "INVALID_REQUEST");
  const email = normalizeEmail(parsed.data.email);
  const limited = await enforceRateLimit(request, "auth-password-reset-request", {
    addressLimit: 20,
    identity: email,
    identityLimit: 3,
  }, 60 * 60_000);
  if (limited) return limited;

  if (emailConfiguration()) {
    const origin = resetOrigin(request);
    await runAfterResponse("password_reset_delivery", () => deliverPasswordReset(email, origin));
  }

  return NextResponse.json({ accepted: true, message: acceptedMessage }, {
    status: 202,
    headers: { "Cache-Control": "no-store" },
  });
}

async function completePasswordReset(request: Request) {
  if (!isSameOriginRequest(request)) return apiError("Invalid request origin.", 403, "FORBIDDEN");
  const body = await readJsonBody(request);
  if (!body.ok) return body.response;
  const parsed = passwordResetCompletionSchema.safeParse(body.value);
  if (!parsed.success) return apiError("重置链接无效，或新密码不符合要求。", 400, "INVALID_REQUEST");
  const limited = await enforceRateLimit(
    request,
    "auth-password-reset-complete",
    {
      addressLimit: 40,
      identity: hashPasswordResetToken(parsed.data.token),
      identityLimit: 8,
    },
    15 * 60_000,
  );
  if (limited) return limited;

  const outcome = await resetPasswordWithToken(parsed.data.token, parsed.data.newPassword);
  if (outcome.status === "INVALID") return apiError("重置链接无效或已过期，请重新申请。", 400, "INVALID_REQUEST");
  if (outcome.status === "UNCHANGED") return apiError("新密码不能与当前密码相同。", 400, "INVALID_REQUEST");
  if (outcome.status === "CONFLICT") {
    return apiError("账号安全设置刚刚发生变化，请重新申请重置链接。", 409, "CONFLICT");
  }
  if (emailConfiguration()) {
    await runAfterResponse("password_change_notice", () => notifyPasswordChange(outcome.email));
  }
  return NextResponse.json({
    changed: true,
    providersDisconnected: outcome.providersDisconnected,
  }, { headers: { "Cache-Control": "no-store" } });
}

export const POST = apiHandler("POST /api/auth/password-reset", requestPasswordReset);
export const PATCH = apiHandler("PATCH /api/auth/password-reset", completePasswordReset);
