import { NextRequest, NextResponse } from "next/server";
import { apiError, apiHandler, enforceRateLimit } from "@/lib/api";
import { buildQuestionHint } from "@/lib/hints";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

async function getQuestionHint(request: NextRequest) {
  const questionId = request.nextUrl.searchParams.get("questionId");
  if (!questionId || questionId.length < 8 || questionId.length > 100) {
    return apiError("Invalid hint request", 400, "INVALID_REQUEST");
  }
  const limited = await enforceRateLimit(request, "question-hints", "public", 30);
  if (limited) return limited;

  const question = await prisma.question.findFirst({
    where: { id: questionId, status: "PUBLISHED" },
    select: {
      type: true,
      difficulty: true,
      tags: { include: { tag: { include: { dimension: true } } } },
    },
  });
  if (!question) return apiError("Question not found", 404, "NOT_FOUND");

  return NextResponse.json({ hint: buildQuestionHint(question) });
}

export const GET = apiHandler("GET /api/questions/hint", getQuestionHint);
