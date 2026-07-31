import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiError, apiHandler, enforceRateLimit } from "@/lib/api";
import { getSessionUser } from "@/lib/auth";
import { hasRecentAuthentication } from "@/lib/auth-validation";
import { prisma } from "@/lib/prisma";

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
  account: Record<string, unknown>,
  accountSections: ExportSection[],
  learner: Record<string, unknown> | null,
  learnerSections: ExportSection[],
) {
  const encoder = new TextEncoder();
  let cancelled = false;
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const write = (value: string) => controller.enqueue(encoder.encode(value));
      try {
        const header = JSON.stringify({
          format: "EduLoop account export",
          version: 2,
          exportedAt: exportedAt.toISOString(),
        });
        const writeSectionedObject = async (
          metadata: Record<string, unknown>,
          sections: ExportSection[],
        ) => {
          const serialized = JSON.stringify(metadata);
          write(serialized.slice(0, -1));
          for (const section of sections) {
            if (cancelled) return;
            write(`,${JSON.stringify(section.name)}:[`);
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
          write("}");
        };

        write(`${header.slice(0, -1)},"account":`);
        await writeSectionedObject(account, accountSections);
        if (cancelled) return;
        write(",\"learner\":");
        if (!learner) {
          write("null}");
          controller.close();
          return;
        }
        await writeSectionedObject(learner, learnerSections);
        if (cancelled) return;
        write("}");
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

async function getAccountExport(request: NextRequest) {
  const user = await getSessionUser(request, { allowMissingConsent: true });
  if (!user) return apiError("请先登录。", 401, "UNAUTHORIZED");
  if (!hasRecentAuthentication(user.authenticatedAt)) {
    return apiError(
      "导出账号数据前请重新登录，以确认这是你的账号。",
      401,
      "UNAUTHORIZED",
    );
  }
  const parsed = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) return apiError("Invalid export request", 400, "INVALID_REQUEST");
  const limited = await enforceRateLimit(request, "export-account", user.id, 3, 60 * 60_000);
  if (limited) return limited;

  const storedAccount = await prisma.user.findUnique({
    where: { id: user.id },
    select: {
      email: true,
      emailVerified: true,
      name: true,
      image: true,
      role: true,
      termsAcceptedAt: true,
      termsVersion: true,
      privacyAcceptedAt: true,
      privacyVersion: true,
      consentBasis: true,
      accounts: {
        where: { type: { in: ["oauth", "oidc"] } },
        orderBy: [{ provider: "asc" }, { providerAccountId: "asc" }],
        select: { type: true, provider: true, providerAccountId: true },
      },
      consentRecords: {
        orderBy: [{ acceptedAt: "asc" }, { id: "asc" }],
        select: {
          termsVersion: true,
          privacyVersion: true,
          basis: true,
          method: true,
          acceptedAt: true,
        },
      },
      emailVerificationTokens: {
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: { expiresAt: true, createdAt: true },
      },
      emailChangeTokens: {
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: { newEmail: true, expiresAt: true, createdAt: true },
      },
      passwordResetTokens: {
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: { expiresAt: true, createdAt: true },
      },
      sessions: {
        orderBy: { expires: "asc" },
        select: { expires: true },
      },
      createdAt: true,
      updatedAt: true,
    },
  });
  if (!storedAccount) return apiError("请先登录。", 401, "UNAUTHORIZED");

  const account = {
    email: storedAccount.email,
    emailVerifiedAt: storedAccount.emailVerified,
    displayName: storedAccount.name,
    image: storedAccount.image,
    role: storedAccount.role,
    hasPassword: user.hasPassword,
    currentConsent: {
      termsAcceptedAt: storedAccount.termsAcceptedAt,
      termsVersion: storedAccount.termsVersion,
      privacyAcceptedAt: storedAccount.privacyAcceptedAt,
      privacyVersion: storedAccount.privacyVersion,
      basis: storedAccount.consentBasis,
    },
    linkedProviders: storedAccount.accounts,
    consentHistory: storedAccount.consentRecords,
    pendingAccountActions: {
      emailVerifications: storedAccount.emailVerificationTokens,
      emailChanges: storedAccount.emailChangeTokens,
      passwordResets: storedAccount.passwordResetTokens,
    },
    sessionRecords: storedAccount.sessions,
    createdAt: storedAccount.createdAt,
    updatedAt: storedAccount.updatedAt,
  };

  const accountSections: ExportSection[] = [{
    name: "contentReviewActions",
    load: async (cursor) => (await prisma.contentReviewAction.findMany({
      where: { actorId: user.id }, orderBy: { id: "asc" }, take: EXPORT_PAGE_SIZE,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true,
        action: true,
        note: true,
        createdAt: true,
        report: {
          select: {
            category: true,
            status: true,
            createdAt: true,
            resolvedAt: true,
            question: { select: { sourceId: true } },
          },
        },
      },
    })).map(({ id, ...value }) => ({ cursor: id, value })),
  }];

  // Export is a data-rights read and must never create a learner profile for
  // an account that has not accepted current terms or deleted learning data.
  const identity = await prisma.learnerProfile.findUnique({
    where: { userId: user.id },
    select: { id: true },
  });
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
  const filename = `eduloop-account-data-${exportedAt.toISOString().slice(0, 10)}.json`;
  return new NextResponse(streamExport(exportedAt, account, accountSections, learner, sections), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

export const GET = apiHandler("GET /api/learner/export", getAccountExport);
