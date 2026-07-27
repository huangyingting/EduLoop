import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/api";
import { createSession, hashPassword } from "@/lib/auth";
import { isSameOriginRequest, normalizeEmail, registerInputSchema } from "@/lib/auth-validation";
import { attachLearnerToNewUser } from "@/lib/learner-identity";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  }
  const parsed = registerInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "请填写有效的邮箱、昵称和至少 8 位密码。" }, { status: 400 });
  }
  const input = parsed.data;
  const email = normalizeEmail(input.email);
  const limited = enforceRateLimit(request, "auth-register", email, 5, 15 * 60_000);
  if (limited) return limited;
  const passwordHash = await hashPassword(input.password);

  let user: { id: string; email: string; displayName: string | null };
  try {
    user = await prisma.$transaction(async (transaction) => {
      const created = await transaction.user.create({
        data: { email, passwordHash, displayName: input.displayName ?? null },
        select: { id: true, email: true, displayName: true },
      });
      await attachLearnerToNewUser(transaction, created.id, input.deviceKey, created.displayName);
      return created;
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "该邮箱已注册，请直接登录。" }, { status: 409 });
    }
    throw error;
  }

  await createSession(user.id);
  return NextResponse.json({ user }, { status: 201, headers: { "Cache-Control": "no-store" } });
}
