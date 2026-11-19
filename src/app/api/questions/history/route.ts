import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiError, apiMessageError, apiHandler, enforceRateLimit } from "@/lib/api";
import { getSessionUser } from "@/lib/auth";
import { findActiveLearner } from "@/lib/family";
import { questionHistory } from "@/lib/practice/selection";

export const dynamic = "force-dynamic";

const querySchema = z.object({ questionId: z.string().min(8).max(100) });

async function getQuestionHistory(request: NextRequest) {
  const user = await getSessionUser(request);
  if (!user) return apiMessageError("signInRequired", 401, "UNAUTHORIZED");
  const parsed = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) return apiError("Invalid history query", 400, "INVALID_REQUEST");
  const limited = await enforceRateLimit(request, "question-history", { identity: user.id, identityLimit: 60 });
  if (limited) return limited;
  const learner = await findActiveLearner(request, user);
  return NextResponse.json(learner ? await questionHistory(learner.id, parsed.data.questionId) : { attempts: [] });
}

export const GET = apiHandler("GET /api/questions/history", getQuestionHistory);
