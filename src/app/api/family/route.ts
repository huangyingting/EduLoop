import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiError, apiMessageError, apiHandler, enforceRateLimit, readJsonBody } from "@/lib/api";
import { getSessionUser } from "@/lib/auth";
import { hasRecentAuthentication, isSameOriginRequest } from "@/lib/auth-validation";
import { QUESTION_STATUS } from "@/lib/domain-constants";
import { createChildProfile, deleteChildProfile, familyOverview } from "@/lib/family";
import { catalogSlugSchema } from "@/lib/learner-profile";
import { prisma } from "@/lib/prisma";

const createSchema = z.object({
  displayName: z.string().trim().min(1).max(30),
  knowledgeBand: catalogSlugSchema.nullable(),
  // The guardian confirms, per child, that they are that child's parent or
  // legal guardian and accept the terms on the child's behalf.
  guardianAttestation: z.literal(true),
});
const deleteSchema = z.object({ learnerId: z.string().min(8).max(100) });

async function getFamily(request: NextRequest) {
  const user = await getSessionUser(request);
  if (!user) return apiMessageError("signInRequired", 401, "UNAUTHORIZED");
  const limited = await enforceRateLimit(request, "family-read", { identity: user.id, identityLimit: 60 });
  if (limited) return limited;
  return NextResponse.json(await familyOverview(request, user));
}

async function postChild(request: Request) {
  if (!isSameOriginRequest(request)) return apiError("Invalid request origin.", 403, "FORBIDDEN");
  const user = await getSessionUser(request);
  if (!user) return apiMessageError("signInRequired", 401, "UNAUTHORIZED");
  const body = await readJsonBody(request);
  if (!body.ok) return body.response;
  const parsed = createSchema.safeParse(body.value);
  if (!parsed.success) return apiMessageError("childInvalid", 400, "INVALID_REQUEST");
  const limited = await enforceRateLimit(request, "family-create", { identity: user.id, identityLimit: 10 }, 60 * 60_000);
  if (limited) return limited;
  const band = parsed.data.knowledgeBand
    ? await prisma.gradeBand.findFirst({
      where: { slug: parsed.data.knowledgeBand, questions: { some: { status: QUESTION_STATUS.PUBLISHED } } },
      select: { id: true },
    })
    : null;
  if (parsed.data.knowledgeBand && !band) return apiMessageError("knowledgeBandEmpty", 400, "INVALID_REQUEST");
  const outcome = await createChildProfile(user, { displayName: parsed.data.displayName, knowledgeBandId: band?.id ?? null });
  if (outcome.status === "LIMIT_REACHED") return apiMessageError("childLimit", 409, "CONFLICT");
  return NextResponse.json(outcome.child, { status: 201 });
}

async function deleteChild(request: Request) {
  if (!isSameOriginRequest(request)) return apiError("Invalid request origin.", 403, "FORBIDDEN");
  const user = await getSessionUser(request);
  if (!user) return apiMessageError("signInRequired", 401, "UNAUTHORIZED");
  if (!hasRecentAuthentication(user.authenticatedAt)) {
    return apiMessageError("reauthDeleteChild", 401, "UNAUTHORIZED");
  }
  const body = await readJsonBody(request);
  if (!body.ok) return body.response;
  const parsed = deleteSchema.safeParse(body.value);
  if (!parsed.success) return apiError("Invalid child profile", 400, "INVALID_REQUEST");
  const limited = await enforceRateLimit(request, "family-delete", { identity: user.id, identityLimit: 10 }, 60 * 60_000);
  if (limited) return limited;
  const outcome = await deleteChildProfile(user, parsed.data.learnerId);
  if (outcome === "CONFLICT") return apiMessageError("securityChanged", 409, "CONFLICT");
  if (outcome === "NOT_FOUND") return apiError("Child profile not found", 404, "NOT_FOUND");
  return NextResponse.json({ deleted: true });
}

export const GET = apiHandler("GET /api/family", getFamily);
export const POST = apiHandler("POST /api/family", postChild);
export const DELETE = apiHandler("DELETE /api/family", deleteChild);
