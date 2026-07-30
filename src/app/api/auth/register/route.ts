import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { apiError, apiHandler, enforceRateLimit } from "@/lib/api";
import { hashPassword } from "@/lib/auth";
import { isSameOriginRequest, normalizeEmail, registerInputSchema } from "@/lib/auth-validation";
import { createLearnerForUser } from "@/lib/learner-identity";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

async function postRegistration(request: Request) {
  if (!isSameOriginRequest(request)) {
    return apiError("Invalid request origin.", 403, "FORBIDDEN");
  }
  const parsed = registerInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return apiError("请填写有效的邮箱、昵称和至少 8 位密码。", 400, "INVALID_REQUEST");
  }
  const input = parsed.data;
  const email = normalizeEmail(input.email);
  const limited = enforceRateLimit(request, "auth-register", email, 5, 15 * 60_000);
  if (limited) return limited;
  const passwordHash = await hashPassword(input.password);

  try {
    await prisma.$transaction(async (transaction) => {
      const created = await transaction.user.create({
        data: { email, passwordHash, name: input.displayName ?? null },
        select: { id: true, name: true },
      });
      await createLearnerForUser(transaction, created.id, created.name);
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return apiError("该邮箱已注册，请直接登录。", 409, "CONFLICT");
    }
    throw error;
  }

  return NextResponse.json({ created: true }, { status: 201, headers: { "Cache-Control": "no-store" } });
}

export const POST = apiHandler("POST /api/auth/register", postRegistration);
