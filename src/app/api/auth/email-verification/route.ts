import { NextResponse } from "next/server";
import { apiError, apiHandler, enforceRateLimit, readJsonBody } from "@/lib/api";
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

export const runtime = "nodejs";

const acceptedMessage = "如果该邮箱需要验证，我们会发送一封验证邮件。";

function verificationOrigin(request: Request) {
  const configured = process.env.AUTH_URL?.trim();
  return configured ? new URL(configured).origin : new URL(request.url).origin;
}

async function requestEmailVerification(request: Request) {
  if (!isSameOriginRequest(request)) return apiError("Invalid request origin.", 403, "FORBIDDEN");
  const body = await readJsonBody(request);
  if (!body.ok) return body.response;
  const parsed = emailVerificationRequestSchema.safeParse(body.value);
  if (!parsed.success) return apiError("请输入有效的邮箱地址。", 400, "INVALID_REQUEST");
  const email = normalizeEmail(parsed.data.email);
  const limited = await enforceRateLimit(request, "auth-email-verification-request", email, 3, 60 * 60_000);
  if (limited) return limited;

  if (emailConfiguration()) {
    const origin = verificationOrigin(request);
    await runAfterResponse(() => deliverEmailVerification(email, origin));
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
  if (!parsed.success) return apiError("验证链接无效。", 400, "INVALID_REQUEST");
  const limited = await enforceRateLimit(
    request,
    "auth-email-verification-complete",
    hashEmailVerificationToken(parsed.data.token),
    8,
    15 * 60_000,
  );
  if (limited) return limited;

  const outcome = await verifyEmailWithToken(parsed.data.token, parsed.data.password);
  if (outcome.status === "INVALID") {
    return apiError("验证链接无效或已过期，请重新申请。", 400, "INVALID_REQUEST");
  }
  if (outcome.status === "INVALID_PASSWORD") {
    return apiError("密码不正确，邮箱尚未验证。", 401, "UNAUTHORIZED");
  }
  if (outcome.status === "CONFLICT") {
    return apiError("账号安全设置刚刚发生变化，请重新打开验证链接后再试。", 409, "CONFLICT");
  }
  return NextResponse.json({
    verified: true,
    providersDisconnected: outcome.providersDisconnected,
  }, { headers: { "Cache-Control": "no-store" } });
}

export const POST = apiHandler("POST /api/auth/email-verification", requestEmailVerification);
export const PATCH = apiHandler("PATCH /api/auth/email-verification", completeEmailVerification);
