import { NextRequest, NextResponse } from "next/server";
import { apiError, apiMessageError, apiHandler, enforceRateLimit } from "@/lib/api";
import { getSessionUser } from "@/lib/auth";
import { timeZoneQuerySchema } from "@/lib/contracts/practice";
import { findActiveLearner } from "@/lib/family";
import { learnerProgress } from "@/lib/practice/progress";

export const dynamic = "force-dynamic";

async function getLearnerProgress(request: NextRequest) {
  const user = await getSessionUser(request);
  if (!user) return apiMessageError("signInRequired", 401, "UNAUTHORIZED");
  const parsed = timeZoneQuerySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) return apiError("Invalid progress query", 400, "INVALID_REQUEST");
  const limited = await enforceRateLimit(
    request,
    "learner-progress",
    { identity: user.id, identityLimit: 30 },
  );
  if (limited) return limited;
  const learner = await findActiveLearner(request, user);
  return NextResponse.json(await learnerProgress(learner, parsed.data.timeZone));
}

export const GET = apiHandler("GET /api/learner/progress", getLearnerProgress);
