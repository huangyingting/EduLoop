import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, apiHandler, enforceRateLimit, readJsonBody } from "@/lib/api";
import { isSameOriginRequest } from "@/lib/auth-validation";
import { contentOperatorForRequest } from "@/lib/content-operator";
import { HINT_STATUS } from "@/lib/domain-constants";
import { addCuratedHint, setHintStatus } from "@/lib/studio/hints";

export const runtime = "nodejs";

const createSchema = z.object({
  questionId: z.string().min(8).max(100),
  content: z.string().trim().min(4).max(500),
  position: z.number().int().min(0).max(20).optional(),
});
const reviewSchema = z.object({
  hintId: z.string().min(8).max(100),
  reviewStatus: z.enum([HINT_STATUS.APPROVED, HINT_STATUS.REJECTED]),
});

async function postHint(request: Request) {
  if (!isSameOriginRequest(request)) return apiError("Invalid request origin.", 403, "FORBIDDEN");
  const operator = await contentOperatorForRequest(request);
  if (operator.error) return operator.error;
  const body = await readJsonBody(request);
  if (!body.ok) return body.response;
  const parsed = createSchema.safeParse(body.value);
  if (!parsed.success) return apiError("Invalid hint", 400, "INVALID_REQUEST");
  const limited = await enforceRateLimit(request, "studio-hints", { identity: operator.user.id, identityLimit: 60 }, 10 * 60_000);
  if (limited) return limited;
  const hint = await addCuratedHint(parsed.data.questionId, parsed.data.content, parsed.data.position);
  return hint ? NextResponse.json(hint, { status: 201 }) : apiError("Question not found", 404, "NOT_FOUND");
}

async function patchHint(request: Request) {
  if (!isSameOriginRequest(request)) return apiError("Invalid request origin.", 403, "FORBIDDEN");
  const operator = await contentOperatorForRequest(request);
  if (operator.error) return operator.error;
  const body = await readJsonBody(request);
  if (!body.ok) return body.response;
  const parsed = reviewSchema.safeParse(body.value);
  if (!parsed.success) return apiError("Invalid hint review", 400, "INVALID_REQUEST");
  const limited = await enforceRateLimit(request, "studio-hints", { identity: operator.user.id, identityLimit: 60 }, 10 * 60_000);
  if (limited) return limited;
  return await setHintStatus(parsed.data.hintId, parsed.data.reviewStatus)
    ? NextResponse.json({ updated: true })
    : apiError("Hint not found", 404, "NOT_FOUND");
}

export const POST = apiHandler("POST /api/studio/hints", postHint);
export const PATCH = apiHandler("PATCH /api/studio/hints", patchHint);
