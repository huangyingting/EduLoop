import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiError, apiHandler, enforceRateLimit } from "@/lib/api";
import { getSessionUser } from "@/lib/auth";
import { contestLevelSchema } from "@/lib/contracts/contests";
import { findLearnerForUser } from "@/lib/learner-identity";
import { listContestPapers } from "@/lib/practice/contests";

export const dynamic = "force-dynamic";

const querySchema = z.object({ level: contestLevelSchema.optional() });

async function getContests(request: NextRequest) {
  const user = await getSessionUser(request);
  if (!user) return apiError("请先登录。", 401, "UNAUTHORIZED");
  const parsed = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) return apiError("Invalid contest query", 400, "INVALID_REQUEST");
  const limited = await enforceRateLimit(request, "contest-list", { identity: user.id, identityLimit: 60 });
  if (limited) return limited;
  const learner = await findLearnerForUser(user);
  return NextResponse.json(await listContestPapers(learner?.id ?? null, parsed.data.level));
}

export const GET = apiHandler("GET /api/contests", getContests);
