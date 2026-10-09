import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { apiError, apiHandler, enforceRateLimit, readJsonBody } from "@/lib/api";
import { runAfterResponse } from "@/lib/after-response";
import { hashPassword } from "@/lib/auth";
import { isSameOriginRequest, normalizeEmail, registerInputSchema } from "@/lib/auth-validation";
import { deliverEmailVerification } from "@/lib/email-verification";
import { emailConfiguration } from "@/lib/email";
import { createLearnerForUser } from "@/lib/learner-identity";
import { PRIVACY_VERSION, TERMS_VERSION } from "@/lib/legal";
import { prisma } from "@/lib/prisma";
import {
  deleteExpiredUnusedRegistration,
  registrationExpiration,
} from "@/lib/retention";

export const runtime = "nodejs";

function registrationOrigin(request: Request) {
  const configured = process.env.AUTH_URL?.trim();
  return configured ? new URL(configured).origin : new URL(request.url).origin;
}

async function postRegistration(request: Request) {
  if (process.env.EDULOOP_PRIVATE_DEPLOYMENT === "true") {
    return apiError("Registration is disabled for this deployment.", 403, "FORBIDDEN");
  }
  if (!isSameOriginRequest(request)) {
    return apiError("Invalid request origin.", 403, "FORBIDDEN");
  }
  const body = await readJsonBody(request);
  if (!body.ok) return body.response;
  const parsed = registerInputSchema.safeParse(body.value);
  if (!parsed.success) {
    return apiError("请填写有效的邮箱、昵称和至少 8 位密码。", 400, "INVALID_REQUEST");
  }
  const input = parsed.data;
  const email = normalizeEmail(input.email);
  const verificationRequired = process.env.NODE_ENV === "production" || Boolean(emailConfiguration());
  const limited = await enforceRateLimit(request, "auth-register", {
    addressLimit: 20,
    identity: email,
    identityLimit: 5,
  }, 15 * 60_000);
  if (limited) return limited;
  const passwordHash = await hashPassword(input.password);
  const knowledgeBand = input.knowledgeBand ? await prisma.gradeBand.findFirst({
    where: { slug: input.knowledgeBand, questions: { some: { status: "PUBLISHED" } } },
    select: { id: true },
  }) : null;
  if (input.knowledgeBand && !knowledgeBand) {
    return apiError("请选择题库中可用的知识阶段。", 400, "INVALID_REQUEST");
  }

  const acceptedAt = new Date();
  await deleteExpiredUnusedRegistration(email, acceptedAt);
  try {
    await prisma.$transaction(async (transaction) => {
      const created = await transaction.user.create({
        data: {
          email,
          passwordHash,
          name: input.displayName ?? null,
          emailVerified: verificationRequired ? null : new Date(),
          registrationExpiresAt: verificationRequired ? registrationExpiration(acceptedAt) : null,
          termsAcceptedAt: acceptedAt,
          termsVersion: TERMS_VERSION,
          privacyAcceptedAt: acceptedAt,
          privacyVersion: PRIVACY_VERSION,
          consentBasis: input.consentBasis,
          consentRecords: {
            create: {
              termsVersion: TERMS_VERSION,
              privacyVersion: PRIVACY_VERSION,
              basis: input.consentBasis,
              method: "PASSWORD_REGISTRATION",
              acceptedAt,
            },
          },
        },
        select: { id: true, name: true },
      });
      await createLearnerForUser(transaction, created.id, created.name, knowledgeBand?.id);
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return apiError("该邮箱已注册，请直接登录。", 409, "CONFLICT");
    }
    throw error;
  }

  if (verificationRequired) {
    const origin = registrationOrigin(request);
    await runAfterResponse(
      "email_verification_delivery",
      () => deliverEmailVerification(email, origin),
    );
  }

  return NextResponse.json({ created: true, verificationRequired }, {
    status: 201,
    headers: { "Cache-Control": "no-store" },
  });
}

export const POST = apiHandler("POST /api/auth/register", postRegistration);
