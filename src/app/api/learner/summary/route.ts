import { NextRequest, NextResponse } from "next/server";
import { apiError, apiHandler, enforceRateLimit } from "@/lib/api";
import { getSessionUser } from "@/lib/auth";
import { activitySummaryQuerySchema } from "@/lib/contracts/practice";
import { findActiveLearner } from "@/lib/family";
import { learnerActivitySummary } from "@/lib/practice/progress";

export const dynamic = "force-dynamic";

// A small daily-activity window for dashboard widgets that do not need the
// full progress view.
async function getLearnerSummary(request: NextRequest) {
  const user = await getSessionUser(request);
  if (!user) return apiError("请先登录。", 401, "UNAUTHORIZED");
  const parsed = activitySummaryQuerySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) return apiError("Invalid summary query", 400, "INVALID_REQUEST");
  const limited = await enforceRateLimit(request, "learner-summary-activity", { identity: user.id, identityLimit: 120 });
  if (limited) return limited;
  const learner = await findActiveLearner(request, user);
  return NextResponse.json(await learnerActivitySummary(learner, parsed.data.timeZone, parsed.data.days));
}

export const GET = apiHandler("GET /api/learner/summary", getLearnerSummary);
