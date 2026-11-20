import { NextRequest, NextResponse } from "next/server";
import { apiError, apiHandler, enforceRateLimit } from "@/lib/api";
import { hintQuerySchema } from "@/lib/contracts/practice";
import { questionHint } from "@/lib/practice/question-hints";
import { contentLocale } from "@/lib/question-translations";

export const dynamic = "force-dynamic";

async function getQuestionHint(request: NextRequest) {
  const parsed = hintQuerySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) return apiError("Invalid hint request", 400, "INVALID_REQUEST");
  const limited = await enforceRateLimit(request, "question-hints", { addressLimit: 30 });
  if (limited) return limited;
  const hint = await questionHint(parsed.data.questionId, parsed.data.step, contentLocale(request));
  if (!hint) return apiError("Hint not found", 404, "NOT_FOUND");
  return NextResponse.json(hint);
}

export const GET = apiHandler("GET /api/questions/hint", getQuestionHint);
