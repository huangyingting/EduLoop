import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiError, apiHandler, enforceRateLimit } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { findLearnerForRequest } from "@/lib/learner-identity";

export const dynamic = "force-dynamic";

const querySchema = z.object({ deviceKey: z.string().min(8).max(100) });

async function getLearnerExport(request: NextRequest) {
  const parsed = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) return apiError("Invalid export request", 400, "INVALID_REQUEST");
  const limited = enforceRateLimit(request, "export-learner", parsed.data.deviceKey, 3, 60 * 60_000);
  if (limited) return limited;

  const identity = await findLearnerForRequest(request, parsed.data.deviceKey);
  const learner = identity ? await prisma.learnerProfile.findUnique({
    where: { id: identity.id },
    select: {
      displayName: true,
      xp: true,
      level: true,
      currentStreak: true,
      bestStreak: true,
      lastActiveOn: true,
      createdAt: true,
      updatedAt: true,
      sessions: {
        orderBy: { startedAt: "asc" },
        select: {
          status: true, filtersJson: true, questionGoal: true, completedCount: true,
          correctCount: true, earnedXp: true, startedAt: true, completedAt: true,
        },
      },
      attempts: {
        orderBy: { createdAt: "asc" },
        select: {
          response: true, isCorrect: true, isSelfAssessed: true, secondsSpent: true, earnedXp: true, createdAt: true,
          question: { select: { sourceId: true, stem: true, subject: { select: { name: true } }, grade: { select: { name: true } } } },
        },
      },
      activities: { orderBy: { activityDate: "asc" }, select: { activityDate: true, attempts: true, correct: true, earnedXp: true } },
      badges: { orderBy: { earnedAt: "asc" }, select: { earnedAt: true, badge: { select: { slug: true, name: true, description: true } } } },
      savedQuestions: { orderBy: { createdAt: "asc" }, select: { createdAt: true, question: { select: { sourceId: true, stem: true } } } },
      reviewItems: {
        orderBy: { updatedAt: "asc" },
        select: {
          status: true, dueAt: true, intervalDays: true, repetitions: true, consecutiveCorrect: true,
          lastResult: true, lastAttemptAt: true, question: { select: { sourceId: true, stem: true } },
        },
      },
      reports: {
        orderBy: { createdAt: "asc" },
        select: { category: true, detail: true, status: true, createdAt: true, resolvedAt: true, question: { select: { sourceId: true } } },
      },
    },
  }) : null;

  const exportedAt = new Date();
  const payload = {
    format: "EduLoop learner export",
    version: 1,
    exportedAt: exportedAt.toISOString(),
    learner: learner ?? null,
  };
  const filename = `eduloop-learning-data-${exportedAt.toISOString().slice(0, 10)}.json`;
  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

export const GET = apiHandler("GET /api/learner/export", getLearnerExport);
