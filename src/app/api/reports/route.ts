import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, apiHandler, enforceRateLimit } from "@/lib/api";
import { getSessionUser } from "@/lib/auth";
import { isSameOriginRequest } from "@/lib/auth-validation";
import { prisma } from "@/lib/prisma";
import { findLearnerForRequest } from "@/lib/learner-identity";

const reportSchema = z.object({
  questionId: z.string().min(8).max(100),
  category: z.enum(["WRONG_ANSWER", "MISSING_FIGURE", "UNCLEAR", "FORMATTING", "OTHER"]),
  detail: z.string().trim().max(1000).optional(),
});

async function postReport(request: Request) {
  if (!isSameOriginRequest(request)) return apiError("Invalid request origin.", 403, "FORBIDDEN");
  const user = await getSessionUser(request);
  if (!user) return apiError("请先登录。", 401, "UNAUTHORIZED");
  const body = await request.json().catch(() => null);
  const parsed = reportSchema.safeParse(body);
  if (!parsed.success) return apiError("Invalid question report", 400, "INVALID_REQUEST");
  const input = parsed.data;
  const limited = enforceRateLimit(request, "reports", user.id, 6, 10 * 60_000);
  if (limited) return limited;

  const question = await prisma.question.findFirst({ where: { id: input.questionId, status: "PUBLISHED" }, select: { id: true } });
  if (!question) return apiError("Question not found", 404, "NOT_FOUND");
  const learner = await findLearnerForRequest(request);
  if (!learner) return apiError("请先登录。", 401, "UNAUTHORIZED");
  const report = await prisma.questionReport.create({ data: {
    learnerId: learner.id,
    questionId: question.id,
    category: input.category,
    detail: input.detail || null,
  } });
  return NextResponse.json({ id: report.id, status: report.status }, { status: 201 });
}

export const POST = apiHandler("POST /api/reports", postReport);
