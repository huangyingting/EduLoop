import { NextResponse } from "next/server";
import { apiError, apiHandler, enforceRateLimit } from "@/lib/api";
import { createSession, hashPassword, passwordHashNeedsUpgrade, verifyPassword } from "@/lib/auth";
import { isSameOriginRequest, loginInputSchema, normalizeEmail } from "@/lib/auth-validation";
import { linkLearnerToUser } from "@/lib/learner-identity";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

async function postLogin(request: Request) {
  if (!isSameOriginRequest(request)) {
    return apiError("Invalid request origin.", 403, "FORBIDDEN");
  }
  const parsed = loginInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return apiError("邮箱或密码不正确。", 401, "UNAUTHORIZED");
  }
  const input = parsed.data;
  const email = normalizeEmail(input.email);
  const limited = enforceRateLimit(request, "auth-login", email, 10, 15 * 60_000);
  if (limited) return limited;

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, displayName: true, role: true, passwordHash: true },
  });
  const valid = user
    ? await verifyPassword(input.password, user.passwordHash)
    : (await hashPassword(input.password), false);
  if (!user || !valid) {
    return apiError("邮箱或密码不正确。", 401, "UNAUTHORIZED");
  }

  if (passwordHashNeedsUpgrade(user.passwordHash)) {
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await hashPassword(input.password) },
    });
  }
  await linkLearnerToUser(user.id, input.deviceKey);
  await createSession(user.id);
  return NextResponse.json({
    user: { id: user.id, email: user.email, displayName: user.displayName, role: user.role },
  }, { headers: { "Cache-Control": "no-store" } });
}

export const POST = apiHandler("POST /api/auth/login", postLogin);
