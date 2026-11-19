import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiError, apiHandler, enforceRateLimit } from "@/lib/api";
import { contentOperatorForRequest } from "@/lib/content-operator";
import { searchStudioQuestions, studioQuestionDetail } from "@/lib/studio/questions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const querySchema = z.object({
  id: z.string().min(1).max(100).optional(),
  query: z.string().max(200).default(""),
  subject: z.string().regex(/^[a-z0-9-]{1,80}$/).optional(),
});

// Without an id: search by exact ID or stem text. With an id: full editorial
// context including answer key, hints, assets, and revision history.
async function getStudioQuestions(request: NextRequest) {
  const operator = await contentOperatorForRequest(request);
  if (operator.error) return operator.error;
  const limited = await enforceRateLimit(request, "studio-questions", { identity: operator.user.id, identityLimit: 180 }, 10 * 60_000);
  if (limited) return limited;
  const parsed = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) return apiError("Invalid question query", 400, "INVALID_REQUEST");
  if (parsed.data.id) {
    const detail = await studioQuestionDetail(parsed.data.id);
    return detail ? NextResponse.json(detail) : apiError("Question not found", 404, "NOT_FOUND");
  }
  return NextResponse.json({ questions: await searchStudioQuestions(parsed.data.query, parsed.data.subject) });
}

export const GET = apiHandler("GET /api/studio/questions", getStudioQuestions);
