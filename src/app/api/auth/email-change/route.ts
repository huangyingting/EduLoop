import { NextResponse } from "next/server";
import { apiError, apiHandler, enforceRateLimit, readJsonBody } from "@/lib/api";
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
  if (!user) return apiError("请先登录。", 401, "UNAUTHORIZED");
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
  if (!parsed.success) return apiError("请输入有效的新邮箱和账号确认信息。", 400, "INVALID_REQUEST");

  if (user.hasPassword) {
    const stored = await prisma.user.findUnique({
      where: { id: user.id },
      select: { passwordHash: true },
    });
    if (!parsed.data.currentPassword || !stored?.passwordHash || !await verifyPassword(parsed.data.currentPassword, stored.passwordHash)) {
      return apiError("当前密码不正确。", 401, "UNAUTHORIZED");
    }
  } else if (!hasRecentAuthentication(user.authenticatedAt)) {
    return apiError("更改邮箱前请重新登录，以确认这是你的账号。", 401, "UNAUTHORIZED");
  }
  if (!emailConfiguration()) {
    return apiError("邮箱更改服务暂未配置。", 503, "SERVICE_UNAVAILABLE");
  }

  const newEmail = normalizeEmail(parsed.data.newEmail);
  const issued = await issueEmailChangeToken(user.id, newEmail, user.sessionVersion);
  if (issued.status === "NOT_FOUND") return apiError("账号不存在。", 404, "NOT_FOUND");
  if (issued.status === "UNCHANGED") return apiError("新邮箱不能与当前邮箱相同。", 400, "INVALID_REQUEST");
  if (issued.status === "SECURITY_CONFLICT") {
    return apiError("账号安全设置刚刚发生变化，请重新登录后再试。", 409, "CONFLICT");
  }
  if (issued.status === "CONFLICT") return apiError("该邮箱已被其他账号使用。", 409, "CONFLICT");

  const origin = emailChangeOrigin(request);
  await runAfterResponse(() => deliverEmailChangeVerification(issued, origin));
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
  if (!parsed.success) return apiError("邮箱更改链接无效。", 400, "INVALID_REQUEST");
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
    return apiError("邮箱更改链接无效或已过期，请重新申请。", 400, "INVALID_REQUEST");
  }
  if (outcome.status === "CONFLICT") {
    return apiError("该邮箱已被其他账号使用，请重新申请。", 409, "CONFLICT");
  }
  if (emailConfiguration()) {
    await runAfterResponse(() => notifyPreviousEmail(outcome.oldEmail, outcome.newEmail));
  }
  return NextResponse.json({ changed: true }, { headers: { "Cache-Control": "no-store" } });
}

export const POST = apiHandler("POST /api/auth/email-change", requestEmailChange);
export const PATCH = apiHandler("PATCH /api/auth/email-change", confirmEmailChange);
