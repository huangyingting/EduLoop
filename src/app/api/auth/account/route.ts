import { NextResponse } from "next/server";
import { apiError, apiHandler, enforceRateLimit } from "@/lib/api";
import { changeAccountPassword, deleteAccount } from "@/lib/account";
import { createSession, destroySession, getSessionUser } from "@/lib/auth";
import { accountDeletionSchema, isSameOriginRequest, passwordChangeSchema } from "@/lib/auth-validation";

export const runtime = "nodejs";

async function patchAccount(request: Request) {
  if (!isSameOriginRequest(request)) return apiError("Invalid request origin.", 403, "FORBIDDEN");
  const user = await getSessionUser(request);
  if (!user) return apiError("请先登录。", 401, "UNAUTHORIZED");
  const limited = enforceRateLimit(request, "account-password", user.id, 5, 15 * 60_000);
  if (limited) return limited;
  const parsed = passwordChangeSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("新密码必须至少 8 位且不超过 72 个 UTF-8 字节。", 400, "INVALID_REQUEST");

  const outcome = await changeAccountPassword(user.id, parsed.data.currentPassword, parsed.data.newPassword);
  if (outcome === "INVALID_PASSWORD") return apiError("当前密码不正确。", 401, "UNAUTHORIZED");
  if (outcome === "NOT_FOUND") return apiError("账号不存在。", 404, "NOT_FOUND");
  if (outcome === "UNCHANGED") return apiError("新密码不能与当前密码相同。", 400, "INVALID_REQUEST");
  await createSession(user.id);
  return NextResponse.json({ changed: true }, { headers: { "Cache-Control": "no-store" } });
}

async function deleteCurrentAccount(request: Request) {
  if (!isSameOriginRequest(request)) return apiError("Invalid request origin.", 403, "FORBIDDEN");
  const user = await getSessionUser(request);
  if (!user) return apiError("请先登录。", 401, "UNAUTHORIZED");
  const limited = enforceRateLimit(request, "account-delete", user.id, 3, 60 * 60_000);
  if (limited) return limited;
  const parsed = accountDeletionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("请输入当前密码。", 400, "INVALID_REQUEST");

  if (!await deleteAccount(user.id, parsed.data.currentPassword)) {
    return apiError("当前密码不正确。", 401, "UNAUTHORIZED");
  }
  await destroySession(request);
  return NextResponse.json({ deleted: true }, { headers: { "Cache-Control": "no-store" } });
}

export const PATCH = apiHandler("PATCH /api/auth/account", patchAccount);
export const DELETE = apiHandler("DELETE /api/auth/account", deleteCurrentAccount);
