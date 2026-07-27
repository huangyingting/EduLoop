import { NextResponse } from "next/server";
import { z } from "zod";
import { enforceRateLimit } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { getOrCreateLearnerForRequest } from "@/lib/learner-identity";

const reportSchema = z.object({
  deviceKey: z.string().min(8).max(100),
  questionId: z.string().min(8),
  category: z.enum(["WRONG_ANSWER", "MISSING_FIGURE", "UNCLEAR", "FORMATTING", "OTHER"]),
  detail: z.string().trim().max(1000).optional(),
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = reportSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid question report" }, { status: 400 });
  const input = parsed.data;
  const limited = enforceRateLimit(request, "reports", input.deviceKey, 6, 10 * 60_000);
  if (limited) return limited;

  const question = await prisma.question.findFirst({ where: { id: input.questionId, status: "PUBLISHED" }, select: { id: true } });
  if (!question) return NextResponse.json({ error: "Question not found" }, { status: 404 });
  const learner = await getOrCreateLearnerForRequest(request, input.deviceKey);
  const report = await prisma.questionReport.create({ data: {
    learnerId: learner.id,
    questionId: question.id,
    category: input.category,
    detail: input.detail || null,
  } });
  return NextResponse.json({ id: report.id, status: report.status }, { status: 201 });
}
