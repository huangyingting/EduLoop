import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiError, apiHandler, enforceRateLimit } from "@/lib/api";
import { getSessionUser } from "@/lib/auth";
import { findLearnerForUser } from "@/lib/learner-identity";
import { questionHistory } from "@/lib/practice/selection";

export const dynamic = "force-dynamic";

const querySchema = z.object({ questionId: z.string().min(8).max(100) });

async function getQuestionHistory(request: NextRequest) {
  const user = await getSessionUser(request);
  if (!user) return apiError("请先登录。", 401, "UNAUTHORIZED");
  const parsed = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) return apiError("Invalid history query", 400, "INVALID_REQUEST");
  const limited = await enforceRateLimit(request, "question-history", { identity: user.id, identityLimit: 60 });
  if (limited) return limited;
  const learner = await findLearnerForUser(user);
  return NextResponse.json(learner ? await questionHistory(learner.id, parsed.data.questionId) : { attempts: [] });
}

export const GET = apiHandler("GET /api/questions/history", getQuestionHistory);
