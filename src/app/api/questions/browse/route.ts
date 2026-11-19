import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiError, apiHandler, enforceRateLimit } from "@/lib/api";
import { getSessionUser } from "@/lib/auth";
import { findLearnerForUser } from "@/lib/learner-identity";
import { browseQuestions } from "@/lib/practice/browse";
import { parseQuestionFilters } from "@/lib/question-filters";

export const dynamic = "force-dynamic";

const pagingSchema = z.object({
  page: z.coerce.number().int().min(1).max(500).default(1),
  paper: z.string().regex(/^[0-9]{4}-[a-z0-9-]{3,20}$/).optional(),
});

async function getBrowse(request: NextRequest) {
  const user = await getSessionUser(request);
  if (!user) return apiError("请先登录。", 401, "UNAUTHORIZED");
  const params = request.nextUrl.searchParams;
  const filters = parseQuestionFilters(params);
  const paging = pagingSchema.safeParse({ page: params.get("page") ?? undefined, paper: params.get("paper") ?? undefined });
  if (!filters || !paging.success) return apiError("Invalid browse query", 400, "INVALID_REQUEST");
  const limited = await enforceRateLimit(request, "question-browse", { identity: user.id, identityLimit: 60 });
  if (limited) return limited;
  const learner = await findLearnerForUser(user);
  return NextResponse.json(await browseQuestions(filters, learner?.id ?? "", paging.data.page, paging.data.paper));
}

export const GET = apiHandler("GET /api/questions/browse", getBrowse);
