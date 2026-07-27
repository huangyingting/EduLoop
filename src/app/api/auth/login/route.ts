import { NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/api";
import { createSession, hashPassword, verifyPassword } from "@/lib/auth";
import { isSameOriginRequest, loginInputSchema, normalizeEmail } from "@/lib/auth-validation";
import { linkLearnerToUser } from "@/lib/learner-identity";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }
  const parsed = loginInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "邮箱或密码不正确。" }, { status: 401 });
  }
  const input = parsed.data;
  const email = normalizeEmail(input.email);
  const limited = enforceRateLimit(request, "auth-login", email, 10, 15 * 60_000);
  if (limited) return limited;

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, displayName: true, passwordHash: true },
  });
  const valid = user
    ? await verifyPassword(input.password, user.passwordHash)
    : (await hashPassword(input.password), false);
  if (!user || !valid) {
    return NextResponse.json({ error: "邮箱或密码不正确。" }, { status: 401 });
  }

  await linkLearnerToUser(user.id, input.deviceKey);
  await createSession(user.id);
  return NextResponse.json({
    user: { id: user.id, email: user.email, displayName: user.displayName },
  }, { headers: { "Cache-Control": "no-store" } });
}
