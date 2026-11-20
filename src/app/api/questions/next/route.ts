import { NextRequest, NextResponse } from "next/server";
import { apiError, apiHandler, enforceRateLimit } from "@/lib/api";
import { getSessionUser } from "@/lib/auth";
import { findActiveLearner } from "@/lib/family";
import { selectNextQuestion } from "@/lib/practice/selection";
import { parseQuestionFilters } from "@/lib/question-filters";
import { contentLocale } from "@/lib/question-translations";

export const dynamic = "force-dynamic";

async function getNextQuestion(request: NextRequest) {
  const filters = parseQuestionFilters(request.nextUrl.searchParams);
  if (!filters) return apiError("Invalid question filters", 400, "INVALID_REQUEST");
  const limited = await enforceRateLimit(request, "questions", { addressLimit: 120 });
  if (limited) return limited;
  const user = await getSessionUser(request);
  const learner = user ? await findActiveLearner(request, user) : null;
  const question = await selectNextQuestion(filters, learner?.id ?? null, contentLocale(request));
  if (!question) return apiError("No matching questions", 404, "NOT_FOUND");
  return NextResponse.json(question);
}

export const GET = apiHandler("GET /api/questions/next", getNextQuestion);
