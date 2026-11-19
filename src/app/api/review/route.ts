import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiError, apiHandler, enforceRateLimit, readJsonBody } from "@/lib/api";
import { getSessionUser } from "@/lib/auth";
import { isSameOriginRequest } from "@/lib/auth-validation";
import { reviewItemRequestSchema, savedQuestionRequestSchema } from "@/lib/contracts/practice";
import { ensureActiveLearner, findActiveLearner } from "@/lib/family";
import { dismissReviewItem, isPublishedQuestion, reviewLibrary, setSavedQuestion } from "@/lib/practice/review-library";

export const dynamic = "force-dynamic";

const querySchema = z.object({});

async function getReview(request: NextRequest) {
  const user = await getSessionUser(request);
  if (!user) return apiError("请先登录。", 401, "UNAUTHORIZED");
  const parsed = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) return apiError("Invalid review query", 400, "INVALID_REQUEST");
  const limited = await enforceRateLimit(
    request,
    "review-list",
    { identity: user.id, identityLimit: 60 },
  );
  if (limited) return limited;
  const learner = await findActiveLearner(request, user);
  return NextResponse.json(await reviewLibrary(learner?.id ?? null));
}

async function postSavedQuestion(request: Request) {
  if (!isSameOriginRequest(request)) return apiError("Invalid request origin.", 403, "FORBIDDEN");
  const user = await getSessionUser(request);
  if (!user) return apiError("请先登录。", 401, "UNAUTHORIZED");
  const body = await readJsonBody(request);
  if (!body.ok) return body.response;
  const parsed = savedQuestionRequestSchema.safeParse(body.value);
  if (!parsed.success) return apiError("Invalid saved question", 400, "INVALID_REQUEST");
  const limited = await enforceRateLimit(
    request,
    "saved-questions",
    { identity: user.id, identityLimit: 30 },
  );
  if (limited) return limited;
  if (!await isPublishedQuestion(parsed.data.questionId)) return apiError("Question not found", 404, "NOT_FOUND");
  const learner = await ensureActiveLearner(request, user);
  await setSavedQuestion(learner.id, parsed.data.questionId, parsed.data.saved);
  return NextResponse.json({ saved: parsed.data.saved });
}

async function patchReviewItem(request: Request) {
  if (!isSameOriginRequest(request)) return apiError("Invalid request origin.", 403, "FORBIDDEN");
  const user = await getSessionUser(request);
  if (!user) return apiError("请先登录。", 401, "UNAUTHORIZED");
  const body = await readJsonBody(request);
  if (!body.ok) return body.response;
  const parsed = reviewItemRequestSchema.safeParse(body.value);
  if (!parsed.success) return apiError("Invalid review action", 400, "INVALID_REQUEST");
  const limited = await enforceRateLimit(
    request,
    "review-items",
    { identity: user.id, identityLimit: 30 },
  );
  if (limited) return limited;
  const learner = await findActiveLearner(request, user);
  if (!learner || !await dismissReviewItem(learner.id, parsed.data.questionId)) {
    return apiError("Review item not found", 404, "NOT_FOUND");
  }
  return NextResponse.json({ dismissed: true });
}

export const GET = apiHandler("GET /api/review", getReview);
export const POST = apiHandler("POST /api/review", postSavedQuestion);
export const PATCH = apiHandler("PATCH /api/review", patchReviewItem);
