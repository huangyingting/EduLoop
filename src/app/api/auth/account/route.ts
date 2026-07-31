import { NextResponse } from "next/server";
import { apiError, apiHandler, enforceRateLimit, readJsonBody } from "@/lib/api";
import { runAfterResponse } from "@/lib/after-response";
import { changeAccountPassword, deleteAccount } from "@/lib/account";
import { getSessionUser } from "@/lib/auth";
import { accountDeletionSchema, hasRecentAuthentication, isSameOriginRequest, passwordChangeSchema } from "@/lib/auth-validation";
import { emailConfiguration, sendAccountDeletedNotice, sendPasswordChangedNotice } from "@/lib/email";
import { deliverEmailVerification } from "@/lib/email-verification";

export const runtime = "nodejs";

function accountOrigin(request: Request) {
  const configured = process.env.AUTH_URL?.trim();
  return configured ? new URL(configured).origin : new URL(request.url).origin;
}

async function notifyPasswordChange(email: string) {
  try {
    await sendPasswordChangedNotice(email);
  } catch (error) {
    console.error(JSON.stringify({
      level: "error",
      event: "password_change_notification_failed",
      message: error instanceof Error ? error.message : "Unknown email delivery error",
    }));
  }
}

async function notifyAccountDeletion(email: string) {
  try {
    await sendAccountDeletedNotice(email);
  } catch (error) {
    console.error(JSON.stringify({
      level: "error",
      event: "account_deletion_notification_failed",
      message: error instanceof Error ? error.message : "Unknown email delivery error",
    }));
  }
}

async function patchAccount(request: Request) {
  if (!isSameOriginRequest(request)) return apiError("Invalid request origin.", 403, "FORBIDDEN");
  const user = await getSessionUser(request);
  if (!user) return apiError("请先登录。", 401, "UNAUTHORIZED");
  if (!user.hasPassword && !hasRecentAuthentication(user.authenticatedAt)) {
    return apiError("设置密码前请重新登录，以确认这是你的账号。", 401, "UNAUTHORIZED");
  }
  const limited = await enforceRateLimit(request, "account-password", user.id, 5, 15 * 60_000);
  if (limited) return limited;
  const body = await readJsonBody(request);
  if (!body.ok) return body.response;
  const parsed = passwordChangeSchema.safeParse(body.value);
  if (!parsed.success) return apiError("新密码必须至少 8 位且不超过 72 个 UTF-8 字节。", 400, "INVALID_REQUEST");

  const outcome = await changeAccountPassword(user.id, parsed.data.currentPassword, parsed.data.newPassword);
  if (outcome === "INVALID_PASSWORD") return apiError("当前密码不正确。", 401, "UNAUTHORIZED");
  if (outcome === "NOT_FOUND") return apiError("账号不存在。", 404, "NOT_FOUND");
  if (outcome === "UNCHANGED") return apiError("新密码不能与当前密码相同。", 400, "INVALID_REQUEST");
  if (outcome === "CONFLICT") return apiError("账号安全设置刚刚发生变化，请重新登录后再试。", 409, "CONFLICT");
  if (outcome === "PASSWORD_SET_VERIFICATION_REQUIRED") {
    const verificationScheduled = Boolean(emailConfiguration());
    if (verificationScheduled) {
      const origin = accountOrigin(request);
      await runAfterResponse(() => deliverEmailVerification(user.email, origin));
    }
    return NextResponse.json({ changed: true, verificationRequired: true, verificationScheduled }, {
      headers: { "Cache-Control": "no-store" },
    });
  }
  if (emailConfiguration()) {
    await runAfterResponse(() => notifyPasswordChange(user.email));
  }
  return NextResponse.json({ changed: true }, { headers: { "Cache-Control": "no-store" } });
}

async function deleteCurrentAccount(request: Request) {
  if (!isSameOriginRequest(request)) return apiError("Invalid request origin.", 403, "FORBIDDEN");
  const user = await getSessionUser(request, { allowMissingConsent: true });
  if (!user) return apiError("请先登录。", 401, "UNAUTHORIZED");
  if (!user.hasPassword && !hasRecentAuthentication(user.authenticatedAt)) {
    return apiError("删除账号前请重新登录，以确认这是你的账号。", 401, "UNAUTHORIZED");
  }
  const limited = await enforceRateLimit(request, "account-delete", user.id, 3, 60 * 60_000);
  if (limited) return limited;
  const body = await readJsonBody(request);
  if (!body.ok) return body.response;
  const parsed = accountDeletionSchema.safeParse(body.value);
  if (!parsed.success) return apiError("请输入当前密码。", 400, "INVALID_REQUEST");

  const outcome = await deleteAccount(user.id, parsed.data);
  if (outcome === "NOT_FOUND") return apiError("账号不存在。", 404, "NOT_FOUND");
  if (outcome === "INVALID_CONFIRMATION") {
    return apiError(user.hasPassword ? "当前密码不正确。" : "邮箱确认不正确。", 401, "UNAUTHORIZED");
  }
  if (outcome === "CONFLICT") {
    return apiError("账号安全设置刚刚发生变化，请重新登录后再试。", 409, "CONFLICT");
  }
  if (emailConfiguration()) {
    await runAfterResponse(() => notifyAccountDeletion(user.email));
  }
  return NextResponse.json({ deleted: true }, { headers: { "Cache-Control": "no-store" } });
}

export const PATCH = apiHandler("PATCH /api/auth/account", patchAccount);
export const DELETE = apiHandler("DELETE /api/auth/account", deleteCurrentAccount);
