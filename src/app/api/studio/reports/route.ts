import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiError, apiHandler, enforceRateLimit, readJsonBody } from "@/lib/api";
import { isSameOriginRequest } from "@/lib/auth-validation";
import { contentOperatorForRequest } from "@/lib/content-operator";
import { transitionContentReport } from "@/lib/content-review";
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

async function getReports(request: NextRequest) {
  const operator = await contentOperatorForRequest(request);
  if (operator.error) return operator.error;
  const limited = await enforceRateLimit(
    request,
    "studio-reports-list",
    { identity: operator.user.id, identityLimit: 180 },
    10 * 60_000,
  );
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
        reporterErasedAt: true,
        question: {
          select: {
            stem: true,
            answer: true,
            explanation: true,
            importStatus: true,
            status: true,
            quarantinedAt: true,
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
            actor: { select: { name: true, email: true } },
          },
        },
      },
    }),
    prisma.questionReport.count({ where }),
    prisma.questionReport.count({ where: { status: "OPEN" } }),
    prisma.questionReport.count({ where: { status: "RESOLVED" } }),
  ]);
  return NextResponse.json({
    reports: reports.map((report) => ({
      ...report,
      reviewActions: report.reviewActions.map((action) => ({
        ...action,
        actor: action.actor ? { displayName: action.actor.name, email: action.actor.email } : null,
      })),
    })),
    counts: { open: openCount, resolved: resolvedCount },
    pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) },
  }, { headers: { "Cache-Control": "no-store" } });
}

async function patchReport(request: NextRequest) {
  if (!isSameOriginRequest(request)) return apiError("Invalid request origin.", 403, "FORBIDDEN");
  const operator = await contentOperatorForRequest(request);
  if (operator.error) return operator.error;
  const limited = await enforceRateLimit(
    request,
    "studio-reports",
    { identity: operator.user.id, identityLimit: 60 },
    10 * 60_000,
  );
  if (limited) return limited;
  const body = await readJsonBody(request);
  if (!body.ok) return body.response;
  const parsed = updateSchema.safeParse(body.value);
  if (!parsed.success) return apiError("Invalid review action", 400, "INVALID_REQUEST");
  const { reportId, action, note } = parsed.data;
  const transition = await transitionContentReport({
    reportId,
    action,
    note,
    actor: {
      id: operator.user.id,
      sessionVersion: operator.user.sessionVersion,
      role: operator.user.role,
    },
  });
  if (transition.status === "NOT_FOUND") return apiError("Report not found", 404, "NOT_FOUND");
  if (transition.status === "SECURITY_CONFLICT") {
    return apiError("内容审核账号的安全状态刚刚发生变化，请重新登录后再试。", 409, "CONFLICT");
  }
  if (transition.status === "STATE_CONFLICT") {
    return apiError("Report state changed; refresh the review queue.", 409, "CONFLICT");
  }

  const updated = await prisma.questionReport.findUniqueOrThrow({
    where: { id: reportId },
    select: { id: true, status: true, resolvedAt: true, question: { select: { status: true } } },
  });
  return NextResponse.json({ report: updated }, { headers: { "Cache-Control": "no-store" } });
}

export const GET = apiHandler("GET /api/studio/reports", getReports);
export const PATCH = apiHandler("PATCH /api/studio/reports", patchReport);
