import { NextResponse } from "next/server";
import { apiError, apiHandler, enforceRateLimit, readJsonBody } from "@/lib/api";
import { runAfterResponse } from "@/lib/after-response";
import { normalizeEmail, isSameOriginRequest, passwordResetCompletionSchema, passwordResetRequestSchema } from "@/lib/auth-validation";
import { emailConfiguration, sendPasswordChangedNotice, sendPasswordResetEmail } from "@/lib/email";
import { hashPasswordResetToken, issuePasswordResetToken, resetPasswordWithToken, revokePasswordResetToken } from "@/lib/password-reset";

export const runtime = "nodejs";

const acceptedMessage = "如果该邮箱对应一个账号，我们会发送一封密码重置邮件。";

function resetOrigin(request: Request) {
  const configured = process.env.AUTH_URL?.trim();
  return configured ? new URL(configured).origin : new URL(request.url).origin;
}

async function deliverPasswordReset(email: string, origin: string) {
  const issued = await issuePasswordResetToken(email);
  if (!issued) return;
  const resetUrl = `${origin}/reset-password#token=${encodeURIComponent(issued.token)}`;
  try {
    await sendPasswordResetEmail(issued.email, resetUrl);
  } catch (error) {
    await revokePasswordResetToken(issued.id);
    console.error(JSON.stringify({
      level: "error",
      event: "password_reset_email_failed",
      message: error instanceof Error ? error.message : "Unknown email delivery error",
    }));
  }
}

async function notifyPasswordChange(email: string) {
  try {
    await sendPasswordChangedNotice(email);
  } catch (error) {
    console.error(JSON.stringify({
      level: "error",
      event: "password_reset_notification_failed",
      message: error instanceof Error ? error.message : "Unknown email delivery error",
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
  const limited = await enforceRateLimit(request, "auth-password-reset-request", email, 3, 60 * 60_000);
  if (limited) return limited;

  if (emailConfiguration()) {
    const origin = resetOrigin(request);
    await runAfterResponse(() => deliverPasswordReset(email, origin));
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
    hashPasswordResetToken(parsed.data.token),
    8,
    15 * 60_000,
  );
  if (limited) return limited;

  const outcome = await resetPasswordWithToken(parsed.data.token, parsed.data.newPassword);
  if (outcome.status === "INVALID") return apiError("重置链接无效或已过期，请重新申请。", 400, "INVALID_REQUEST");
  if (outcome.status === "UNCHANGED") return apiError("新密码不能与当前密码相同。", 400, "INVALID_REQUEST");
  if (emailConfiguration()) {
    await runAfterResponse(() => notifyPasswordChange(outcome.email));
  }
  return NextResponse.json({ changed: true }, { headers: { "Cache-Control": "no-store" } });
}

export const POST = apiHandler("POST /api/auth/password-reset", requestPasswordReset);
export const PATCH = apiHandler("PATCH /api/auth/password-reset", completePasswordReset);
