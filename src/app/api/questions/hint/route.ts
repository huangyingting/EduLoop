import { NextRequest, NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/api";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const questionId = request.nextUrl.searchParams.get("questionId");
  const deviceKey = request.nextUrl.searchParams.get("deviceKey");
  if (!questionId || questionId.length < 8 || !deviceKey || deviceKey.length < 8) {
    return NextResponse.json({ error: "Invalid hint request" }, { status: 400 });
  }
  const limited = enforceRateLimit(request, "question-hints", deviceKey, 30);
  if (limited) return limited;

  const question = await prisma.question.findFirst({
    where: { id: questionId, status: "PUBLISHED" },
    select: { explanation: true },
  });
  if (!question) return NextResponse.json({ error: "Question not found" }, { status: 404 });

  return NextResponse.json({ hint: question.explanation });
}