import { NextResponse } from "next/server";
import { apiHandler, enforceRateLimit } from "@/lib/api";
import { calendarDay, calendarDaysBefore } from "@/lib/dates";
import { contentOperatorForRequest } from "@/lib/content-operator";
import { percentage, repeatTopicChange } from "@/lib/learning-health";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DAY_MS = 86_400_000;
const WINDOW_DAYS = 28;
const TOPIC_OBSERVATION_LIMIT = 20_000;

async function getLearningHealth(request: Request) {
  const operator = await contentOperatorForRequest(request);
  if (operator.error) return operator.error;
  const limited = enforceRateLimit(request, "studio-metrics", operator.user.id, 60, 10 * 60_000);
  if (limited) return limited;

  const now = new Date();
  const since = new Date(now.getTime() - WINDOW_DAYS * DAY_MS);
  const today = calendarDay(now, "UTC");
  const currentWeekStart = calendarDaysBefore(today, 6);
  const priorWeekStart = calendarDaysBefore(today, 13);
  const [sessions, eligibleMisses, viewedExplanations, currentWeekLearners, priorWeekLearners, daily, rawTopicAttempts] = await Promise.all([
    prisma.practiceSession.findMany({
      where: { startedAt: { gte: since } },
      select: { status: true, completedCount: true },
    }),
    prisma.practiceAttempt.count({
      where: { createdAt: { gte: since }, isCorrect: false, question: { explanation: { not: null } } },
    }),
    prisma.practiceAttempt.count({
      where: { createdAt: { gte: since }, isCorrect: false, explanationViewedAt: { not: null }, question: { explanation: { not: null } } },
    }),
    prisma.dailyActivity.findMany({
      where: { activityDate: { gte: currentWeekStart, lte: today } },
      distinct: ["learnerId"],
      select: { learnerId: true },
    }),
    prisma.dailyActivity.findMany({
      where: { activityDate: { gte: priorWeekStart, lt: currentWeekStart } },
      distinct: ["learnerId"],
      select: { learnerId: true },
    }),
    prisma.dailyActivity.groupBy({
      by: ["activityDate"],
      where: { activityDate: { gte: calendarDaysBefore(today, WINDOW_DAYS - 1), lte: today } },
      _sum: { attempts: true, correct: true },
      _count: { learnerId: true },
      orderBy: { activityDate: "asc" },
    }),
    prisma.practiceAttempt.findMany({
      where: {
        createdAt: { gte: since },
        isCorrect: { not: null },
        question: { tags: { some: { tag: { dimension: { key: "TOPIC" } } } } },
      },
      orderBy: { createdAt: "desc" },
      take: TOPIC_OBSERVATION_LIMIT + 1,
      select: {
        learnerId: true,
        isCorrect: true,
        question: { select: { tags: {
          where: { tag: { dimension: { key: "TOPIC" } } },
          select: { tag: { select: { slug: true } } },
        } } },
      },
    }),
  ]);

  const currentLearnerIds = new Set(currentWeekLearners.map(({ learnerId }) => learnerId));
  const returnedLearners = priorWeekLearners.filter(({ learnerId }) => currentLearnerIds.has(learnerId)).length;
  const completedSessions = sessions.filter(({ status }) => status === "COMPLETED").length;
  const totalQuestions = sessions.reduce((total, session) => total + session.completedCount, 0);
  const sampled = rawTopicAttempts.length > TOPIC_OBSERVATION_LIMIT;
  const topicAttempts = rawTopicAttempts.slice(0, TOPIC_OBSERVATION_LIMIT).reverse().map((attempt) => ({
    learnerId: attempt.learnerId,
    isCorrect: Boolean(attempt.isCorrect),
    topicSlugs: attempt.question.tags.map(({ tag }) => tag.slug),
  }));

  return NextResponse.json({
    windowDays: WINDOW_DAYS,
    generatedAt: now,
    sessions: {
      started: sessions.length,
      completed: completedSessions,
      completionRate: percentage(completedSessions, sessions.length),
      averageQuestions: sessions.length ? Math.round((totalQuestions / sessions.length) * 10) / 10 : 0,
    },
    explanations: {
      eligibleMisses,
      viewed: viewedExplanations,
      viewRate: percentage(viewedExplanations, eligibleMisses),
    },
    weeklyReturn: {
      priorWeekLearners: priorWeekLearners.length,
      returnedLearners,
      rate: percentage(returnedLearners, priorWeekLearners.length),
    },
    repeatPractice: repeatTopicChange(topicAttempts, sampled),
    activity: daily.map((day) => ({
      date: day.activityDate,
      learners: day._count.learnerId,
      attempts: day._sum.attempts ?? 0,
      correct: day._sum.correct ?? 0,
    })),
  }, { headers: { "Cache-Control": "no-store" } });
}

export const GET = apiHandler("GET /api/studio/metrics", getLearningHealth);
