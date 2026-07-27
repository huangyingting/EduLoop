import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { calendarDay, previousCalendarDay } from "@/lib/dates";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  deviceKey: z.string().min(8).max(100),
  timeZone: z.string().max(100).optional(),
});

type Aggregate = { label: string; color?: string; attempts: number; correct: number };

export async function GET(request: NextRequest) {
  const parsed = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) return NextResponse.json({ error: "Invalid progress query" }, { status: 400 });
  const learner = await prisma.learnerProfile.findUnique({ where: { deviceKey: parsed.data.deviceKey } });
  if (!learner) return NextResponse.json({
    summary: { totalAttempts: 0, correctRate: 0, xp: 0, level: 1, currentStreak: 0, bestStreak: 0 },
    activity: [], subjects: [], weakTopics: [], recentMistakes: [], badges: [], sessions: [],
  });

  const [attempts, activities, ownedBadges, badges, reviewItems, sessions, totalAttempts] = await Promise.all([
    prisma.practiceAttempt.findMany({
      where: { learnerId: learner.id, isCorrect: { not: null } },
      orderBy: { createdAt: "desc" },
      take: 500,
      include: {
        question: {
          include: {
            subject: { select: { slug: true, name: true, color: true } },
            grade: { select: { name: true } },
            tags: { include: { tag: { include: { dimension: true } } } },
          },
        },
      },
    }),
    prisma.dailyActivity.findMany({ where: { learnerId: learner.id }, orderBy: { activityDate: "desc" }, take: 35 }),
    prisma.learnerBadge.findMany({ where: { learnerId: learner.id }, select: { badgeId: true, earnedAt: true } }),
    prisma.badge.findMany({ orderBy: { threshold: "asc" } }),
    prisma.reviewItem.findMany({
      where: { learnerId: learner.id, status: "ACTIVE" },
      orderBy: [{ dueAt: "asc" }, { updatedAt: "desc" }],
      take: 5,
      include: { question: { include: { subject: true, grade: true } } },
    }),
    prisma.practiceSession.findMany({ where: { learnerId: learner.id }, orderBy: { startedAt: "desc" }, take: 6 }),
    prisma.practiceAttempt.count({ where: { learnerId: learner.id } }),
  ]);

  const subjectMap = new Map<string, Aggregate>();
  const topicMap = new Map<string, Aggregate>();
  for (const attempt of attempts) {
    const subject = subjectMap.get(attempt.question.subject.slug) ?? {
      label: attempt.question.subject.name,
      color: attempt.question.subject.color,
      attempts: 0,
      correct: 0,
    };
    subject.attempts += 1;
    subject.correct += attempt.isCorrect ? 1 : 0;
    subjectMap.set(attempt.question.subject.slug, subject);

    for (const { tag } of attempt.question.tags) {
      if (tag.dimension.key !== "TOPIC") continue;
      const topic = topicMap.get(tag.slug) ?? { label: tag.label, attempts: 0, correct: 0 };
      topic.attempts += 1;
      topic.correct += attempt.isCorrect ? 1 : 0;
      topicMap.set(tag.slug, topic);
    }
  }

  const today = calendarDay(new Date(), parsed.data.timeZone);
  const currentStreak = learner.lastActiveOn === today || learner.lastActiveOn === previousCalendarDay(today)
    ? learner.currentStreak
    : 0;
  const activityByDay = new Map(activities.map((item) => [item.activityDate, item]));
  const days: string[] = [];
  let cursor = today;
  for (let index = 0; index < 28; index += 1) {
    days.unshift(cursor);
    cursor = previousCalendarDay(cursor);
  }
  const gradedAttempts = attempts.length;
  const gradedCorrect = attempts.filter((attempt) => attempt.isCorrect).length;
  const ownedById = new Map(ownedBadges.map((item) => [item.badgeId, item.earnedAt]));

  return NextResponse.json({
    summary: {
      totalAttempts,
      correctRate: gradedAttempts ? Math.round((gradedCorrect / gradedAttempts) * 100) : 0,
      xp: learner.xp,
      level: Math.floor(learner.xp / 120) + 1,
      currentStreak,
      bestStreak: learner.bestStreak,
    },
    activity: days.map((date) => ({
      date,
      attempts: activityByDay.get(date)?.attempts ?? 0,
      correct: activityByDay.get(date)?.correct ?? 0,
      earnedXp: activityByDay.get(date)?.earnedXp ?? 0,
    })),
    subjects: [...subjectMap.entries()].map(([slug, item]) => ({
      slug,
      ...item,
      accuracy: Math.round((item.correct / item.attempts) * 100),
    })).sort((left, right) => right.attempts - left.attempts),
    weakTopics: [...topicMap.entries()].map(([slug, item]) => ({
      slug,
      ...item,
      accuracy: Math.round((item.correct / item.attempts) * 100),
    })).filter((item) => item.attempts >= 2).sort((left, right) => left.accuracy - right.accuracy || right.attempts - left.attempts).slice(0, 6),
    recentMistakes: reviewItems.map((item) => ({
      id: item.question.id,
      stem: item.question.stem,
      subject: item.question.subject.name,
      subjectColor: item.question.subject.color,
      grade: item.question.grade.name,
      dueAt: item.dueAt,
      isDue: item.dueAt <= new Date(),
    })),
    badges: badges.map((badge) => ({
      slug: badge.slug,
      name: badge.name,
      description: badge.description,
      icon: badge.icon,
      earnedAt: ownedById.get(badge.id) ?? null,
    })),
    sessions: sessions.map((session) => ({
      id: session.id,
      status: session.status,
      completedCount: session.completedCount,
      questionGoal: session.questionGoal,
      correctCount: session.correctCount,
      earnedXp: session.earnedXp,
      startedAt: session.startedAt,
    })),
  });
}
