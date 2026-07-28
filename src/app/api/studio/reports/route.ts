import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiError, apiHandler, enforceRateLimit } from "@/lib/api";
import { getSessionUser, isContentOperator, type SessionUser } from "@/lib/auth";
import { isSameOriginRequest } from "@/lib/auth-validation";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const listSchema = z.object({
  status: z.enum(["OPEN", "RESOLVED"]).default("OPEN"),
  page: z.coerce.number().int().min(1).max(1000).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

const updateSchema = z.object({
  reportId: z.string().min(8).max(100),
  action: z.enum(["QUARANTINE", "RESOLVE", "REOPEN"]),
  note: z.string().trim().max(500).optional(),
}).superRefine((input, context) => {
  if (input.action === "RESOLVE" && (!input.note || input.note.length < 3)) {
    context.addIssue({ code: "custom", path: ["note"], message: "Resolution notes must explain the decision." });
  }
});

type OperatorResult = { user: SessionUser; error?: never } | { user?: never; error: NextResponse };

async function operatorFor(request: Request): Promise<OperatorResult> {
  const user = await getSessionUser(request);
  if (!user) return { error: apiError("请先登录。", 401, "UNAUTHORIZED") } as const;
  if (!isContentOperator(user)) return { error: apiError("你没有内容审核权限。", 403, "FORBIDDEN") } as const;
  return { user } as const;
}

async function getReports(request: NextRequest) {
  const operator = await operatorFor(request);
  if (operator.error) return operator.error;
  const limited = enforceRateLimit(request, "studio-reports-list", operator.user.id, 180, 10 * 60_000);
  if (limited) return limited;
  const parsed = listSchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) return apiError("Invalid report filters", 400, "INVALID_REQUEST");
  const { status, page, limit } = parsed.data;
  const where = { status };
  const [reports, total, openCount, resolvedCount] = await Promise.all([
    prisma.questionReport.findMany({
      where,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true,
        questionId: true,
        category: true,
        detail: true,
        status: true,
        createdAt: true,
        resolvedAt: true,
        question: {
          select: {
            stem: true,
            answer: true,
            explanation: true,
            status: true,
            sourceFile: true,
            sourceId: true,
            sourceType: true,
            subject: { select: { name: true } },
            grade: { select: { name: true } },
            options: { orderBy: { sortOrder: "asc" }, select: { label: true, content: true } },
            assets: { select: { role: true, path: true, altText: true, reviewStatus: true } },
          },
        },
        reviewActions: {
          orderBy: { createdAt: "desc" },
          take: 10,
          select: {
            id: true,
            action: true,
            note: true,
            createdAt: true,
            actor: { select: { displayName: true, email: true } },
          },
        },
      },
    }),
    prisma.questionReport.count({ where }),
    prisma.questionReport.count({ where: { status: "OPEN" } }),
    prisma.questionReport.count({ where: { status: "RESOLVED" } }),
  ]);
  return NextResponse.json({
    reports,
    counts: { open: openCount, resolved: resolvedCount },
    pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) },
  }, { headers: { "Cache-Control": "no-store" } });
}

async function patchReport(request: NextRequest) {
  if (!isSameOriginRequest(request)) return apiError("Invalid request origin.", 403, "FORBIDDEN");
  const operator = await operatorFor(request);
  if (operator.error) return operator.error;
  const limited = enforceRateLimit(request, "studio-reports", operator.user.id, 60, 10 * 60_000);
  if (limited) return limited;
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("Invalid review action", 400, "INVALID_REQUEST");
  const { reportId, action, note } = parsed.data;
  const report = await prisma.questionReport.findUnique({
    where: { id: reportId },
    select: { id: true, status: true, questionId: true },
  });
  if (!report) return apiError("Report not found", 404, "NOT_FOUND");

  const changed = await prisma.$transaction(async (transaction) => {
    if (action === "QUARANTINE") {
      if (report.status !== "OPEN") return false;
      const updated = await transaction.question.updateMany({
        where: { id: report.questionId, status: "PUBLISHED" },
        data: { status: "NEEDS_REVIEW" },
      });
      if (!updated.count) return false;
    } else if (action === "RESOLVE") {
      const updated = await transaction.questionReport.updateMany({
        where: { id: reportId, status: "OPEN" },
        data: { status: "RESOLVED", resolvedAt: new Date() },
      });
      if (!updated.count) return false;
    } else {
      const updated = await transaction.questionReport.updateMany({
        where: { id: reportId, status: "RESOLVED" },
        data: { status: "OPEN", resolvedAt: null },
      });
      if (!updated.count) return false;
    }
    await transaction.contentReviewAction.create({
      data: { reportId, actorId: operator.user.id, action, note: note || null },
    });
    return true;
  });
  if (!changed) return apiError("Report state changed; refresh the review queue.", 409, "CONFLICT");

  const updated = await prisma.questionReport.findUniqueOrThrow({
    where: { id: reportId },
    select: { id: true, status: true, resolvedAt: true, question: { select: { status: true } } },
  });
  return NextResponse.json({ report: updated }, { headers: { "Cache-Control": "no-store" } });
}

export const GET = apiHandler("GET /api/studio/reports", getReports);
export const PATCH = apiHandler("PATCH /api/studio/reports", patchReport);
