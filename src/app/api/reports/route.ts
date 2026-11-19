import { NextResponse } from "next/server";
import { apiError, apiHandler, enforceRateLimit, readJsonBody } from "@/lib/api";
import { getSessionUser } from "@/lib/auth";
import { isSameOriginRequest } from "@/lib/auth-validation";
import { reportRequestSchema } from "@/lib/contracts/practice";
import { findLearnerForRequest } from "@/lib/learner-identity";
import { createQuestionReport, isPublishedQuestion } from "@/lib/practice/review-library";

async function postReport(request: Request) {
  if (!isSameOriginRequest(request)) return apiError("Invalid request origin.", 403, "FORBIDDEN");
  const user = await getSessionUser(request);
  if (!user) return apiError("请先登录。", 401, "UNAUTHORIZED");
  const body = await readJsonBody(request);
  if (!body.ok) return body.response;
  const parsed = reportRequestSchema.safeParse(body.value);
  if (!parsed.success) return apiError("Invalid question report", 400, "INVALID_REQUEST");
  const limited = await enforceRateLimit(
    request,
    "reports",
    { identity: user.id, identityLimit: 6 },
    10 * 60_000,
  );
  if (limited) return limited;
  if (!await isPublishedQuestion(parsed.data.questionId)) return apiError("Question not found", 404, "NOT_FOUND");
  const learner = await findLearnerForRequest(request);
  if (!learner) return apiError("请先登录。", 401, "UNAUTHORIZED");
  const report = await createQuestionReport(learner.id, parsed.data);
  return NextResponse.json(report, { status: 201 });
}

export const POST = apiHandler("POST /api/reports", postReport);
