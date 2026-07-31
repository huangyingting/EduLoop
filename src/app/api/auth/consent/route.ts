import { NextResponse } from "next/server";
import { apiError, apiHandler, enforceRateLimit, readJsonBody } from "@/lib/api";
import { getSessionUser } from "@/lib/auth";
import { isSameOriginRequest, legalConsentSchema } from "@/lib/auth-validation";
import { ensureLearnerForUser } from "@/lib/learner-identity";
import { PRIVACY_VERSION, TERMS_VERSION } from "@/lib/legal";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

async function acceptConsent(request: Request) {
  if (!isSameOriginRequest(request)) return apiError("Invalid request origin.", 403, "FORBIDDEN");
  const user = await getSessionUser(request, { allowMissingConsent: true });
  if (!user) return apiError("请先登录。", 401, "UNAUTHORIZED");
  const limited = await enforceRateLimit(request, "auth-consent", user.id, 5, 15 * 60_000);
  if (limited) return limited;
  const body = await readJsonBody(request);
  if (!body.ok) return body.response;
  const parsed = legalConsentSchema.safeParse(body.value);
  if (!parsed.success) {
    return apiError("请确认账号由成年学习者或父母、法定监护人操作，并接受现行条款。", 400, "INVALID_REQUEST");
  }

  const acceptedAt = new Date();
  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: {
        termsAcceptedAt: acceptedAt,
        termsVersion: TERMS_VERSION,
        privacyAcceptedAt: acceptedAt,
        privacyVersion: PRIVACY_VERSION,
        consentBasis: parsed.data.consentBasis,
      },
    }),
    prisma.consentRecord.create({
      data: {
        userId: user.id,
        termsVersion: TERMS_VERSION,
        privacyVersion: PRIVACY_VERSION,
        basis: parsed.data.consentBasis,
        method: "AUTHENTICATED_CONSENT",
        acceptedAt,
      },
    }),
  ]);
  await ensureLearnerForUser(user.id, user.displayName);
  return NextResponse.json({ accepted: true }, { headers: { "Cache-Control": "no-store" } });
}

export const POST = apiHandler("POST /api/auth/consent", acceptConsent);
