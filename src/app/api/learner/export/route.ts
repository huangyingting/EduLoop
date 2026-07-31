import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiError, apiHandler, enforceRateLimit } from "@/lib/api";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { findLearnerForRequest } from "@/lib/learner-identity";

export const dynamic = "force-dynamic";

const querySchema = z.object({});
const EXPORT_PAGE_SIZE = 250;

type ExportEntry = { cursor: string; value: unknown };
type ExportSection = {
  name: string;
  load: (cursor: string | null) => Promise<ExportEntry[]>;
};

function streamExport(
  exportedAt: Date,
  learner: Record<string, unknown> | null,
  sections: ExportSection[],
) {
  const encoder = new TextEncoder();
  let cancelled = false;
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const write = (value: string) => controller.enqueue(encoder.encode(value));
      try {
        const header = JSON.stringify({
          format: "EduLoop learner export",
          version: 1,
          exportedAt: exportedAt.toISOString(),
        });
        write(`${header.slice(0, -1)},"learner":`);
        if (!learner) {
          write("null}");
          controller.close();
          return;
        }

        const metadata = JSON.stringify(learner);
        write(`${metadata.slice(0, -1)}`);
        for (const section of sections) {
          if (cancelled) return;
          write(`,"${section.name}":[`);
          let first = true;
          let cursor: string | null = null;
          while (!cancelled) {
            const page = await section.load(cursor);
            for (const entry of page) {
              write(`${first ? "" : ","}${JSON.stringify(entry.value) ?? "null"}`);
              first = false;
            }
            if (page.length < EXPORT_PAGE_SIZE) break;
            cursor = page.at(-1)?.cursor ?? null;
            if (!cursor) break;
          }
          if (cancelled) return;
          write("]");
        }
        write("}}");
        controller.close();
      } catch (error) {
        console.error(JSON.stringify({
          level: "error",
          event: "learner_export_stream_failed",
          message: error instanceof Error ? error.message : "Unknown error",
        }));
        controller.error(error);
      }
    },
    cancel() {
      cancelled = true;
    },
  });
}

async function getLearnerExport(request: NextRequest) {
  const user = await getSessionUser(request, { allowMissingConsent: true });
  if (!user) return apiError("请先登录。", 401, "UNAUTHORIZED");
  const parsed = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) return apiError("Invalid export request", 400, "INVALID_REQUEST");
  const limited = await enforceRateLimit(request, "export-learner", user.id, 3, 60 * 60_000);
  if (limited) return limited;

  const identity = await findLearnerForRequest(request, { allowMissingConsent: true });
  const learner = identity ? await prisma.learnerProfile.findUnique({
    where: { id: identity.id },
    select: {
      displayName: true,
      knowledgeBand: { select: { slug: true, name: true } },
      knowledgeGrade: { select: { slug: true, name: true } },
      xp: true,
      level: true,
      currentStreak: true,
      bestStreak: true,
      lastActiveOn: true,
      createdAt: true,
      updatedAt: true,
    },
  }) : null;

  const exportedAt = new Date();
  const learnerId = identity?.id;
  const sections: ExportSection[] = learnerId ? [
    {
      name: "sessions",
      load: async (cursor) => (await prisma.practiceSession.findMany({
        where: { learnerId }, orderBy: { id: "asc" }, take: EXPORT_PAGE_SIZE,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        select: {
          id: true, status: true, filtersJson: true, questionGoal: true, completedCount: true,
          correctCount: true, earnedXp: true, startedAt: true, completedAt: true,
        },
      })).map(({ id, ...value }) => ({ cursor: id, value })),
    },
    {
      name: "attempts",
      load: async (cursor) => (await prisma.practiceAttempt.findMany({
        where: { learnerId }, orderBy: { id: "asc" }, take: EXPORT_PAGE_SIZE,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        select: {
          id: true, response: true, isCorrect: true, isSelfAssessed: true, secondsSpent: true,
          earnedXp: true, explanationViewedAt: true, createdAt: true,
          question: { select: { sourceId: true, stem: true, subject: { select: { name: true } }, grade: { select: { name: true } } } },
        },
      })).map(({ id, ...value }) => ({ cursor: id, value })),
    },
    {
      name: "activities",
      load: async (cursor) => (await prisma.dailyActivity.findMany({
        where: { learnerId }, orderBy: { id: "asc" }, take: EXPORT_PAGE_SIZE,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        select: { id: true, activityDate: true, attempts: true, correct: true, earnedXp: true },
      })).map(({ id, ...value }) => ({ cursor: id, value })),
    },
    {
      name: "badges",
      load: async (cursor) => (await prisma.learnerBadge.findMany({
        where: { learnerId }, orderBy: { badgeId: "asc" }, take: EXPORT_PAGE_SIZE,
        ...(cursor ? { cursor: { learnerId_badgeId: { learnerId, badgeId: cursor } }, skip: 1 } : {}),
        select: { badgeId: true, earnedAt: true, badge: { select: { slug: true, name: true, description: true } } },
      })).map(({ badgeId, ...value }) => ({ cursor: badgeId, value })),
    },
    {
      name: "savedQuestions",
      load: async (cursor) => (await prisma.savedQuestion.findMany({
        where: { learnerId }, orderBy: { questionId: "asc" }, take: EXPORT_PAGE_SIZE,
        ...(cursor ? { cursor: { learnerId_questionId: { learnerId, questionId: cursor } }, skip: 1 } : {}),
        select: { questionId: true, createdAt: true, question: { select: { sourceId: true, stem: true } } },
      })).map(({ questionId, ...value }) => ({ cursor: questionId, value })),
    },
    {
      name: "reviewItems",
      load: async (cursor) => (await prisma.reviewItem.findMany({
        where: { learnerId }, orderBy: { questionId: "asc" }, take: EXPORT_PAGE_SIZE,
        ...(cursor ? { cursor: { learnerId_questionId: { learnerId, questionId: cursor } }, skip: 1 } : {}),
        select: {
          questionId: true, status: true, dueAt: true, intervalDays: true, repetitions: true,
          consecutiveCorrect: true, lastResult: true, lastAttemptAt: true,
          question: { select: { sourceId: true, stem: true } },
        },
      })).map(({ questionId, ...value }) => ({ cursor: questionId, value })),
    },
    {
      name: "reports",
      load: async (cursor) => (await prisma.questionReport.findMany({
        where: { learnerId }, orderBy: { id: "asc" }, take: EXPORT_PAGE_SIZE,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        select: {
          id: true, category: true, detail: true, status: true, createdAt: true, resolvedAt: true,
          question: { select: { sourceId: true } },
        },
      })).map(({ id, ...value }) => ({ cursor: id, value })),
    },
  ] : [];
  const filename = `eduloop-learning-data-${exportedAt.toISOString().slice(0, 10)}.json`;
  return new NextResponse(streamExport(exportedAt, learner, sections), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

export const GET = apiHandler("GET /api/learner/export", getLearnerExport);
