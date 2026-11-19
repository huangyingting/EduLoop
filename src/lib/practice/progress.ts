import type { LearnerProfile } from "@prisma/client";
import type { LearnerSnapshot, ProgressPayload } from "@/lib/contracts/practice";
import { calendarDay, previousCalendarDay, visibleStreak } from "@/lib/dates";
import { QUESTION_STATUS, REVIEW_ITEM_STATUS, TAG_DIMENSION } from "@/lib/domain-constants";
import { prisma } from "@/lib/prisma";
import { levelForXp } from "./rewards";

const PROGRESS_ATTEMPT_WINDOW = 500;
const ACTIVITY_DAYS = 28;

type Aggregate = { label: string; color?: string; attempts: number; correct: number };
type TopicAggregate = Aggregate & { slug: string; subject: string };

const accuracy = (correct: number, attempts: number) => (attempts ? Math.round((correct / attempts) * 100) : 0);

export async function learnerSnapshot(learner: LearnerProfile, timeZone?: string): Promise<LearnerSnapshot> {
  const today = calendarDay(new Date(), timeZone);
  const activity = await prisma.dailyActivity.findUnique({
    where: { learnerId_activityDate: { learnerId: learner.id, activityDate: today } },
  });
  return {
    xp: learner.xp,
    level: levelForXp(learner.xp),
    currentStreak: visibleStreak(learner, today),
    bestStreak: learner.bestStreak,
    streakFreezes: learner.streakFreezes,
    todayAttempts: activity?.attempts ?? 0,
  };
}

export async function learnerProgress(learner: LearnerProfile, timeZone?: string): Promise<ProgressPayload> {
  const now = new Date();
  const [attempts, activities, ownedBadges, badges, reviewItems, sessions, totalAttempts] = await Promise.all([
    prisma.practiceAttempt.findMany({
      where: { learnerId: learner.id, isCorrect: { not: null } },
      orderBy: { createdAt: "desc" },
      take: PROGRESS_ATTEMPT_WINDOW,
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
    prisma.dailyActivity.findMany({ where: { learnerId: learner.id }, orderBy: { activityDate: "desc" }, take: ACTIVITY_DAYS + 7 }),
    prisma.learnerBadge.findMany({ where: { learnerId: learner.id }, select: { badgeId: true, earnedAt: true } }),
    prisma.badge.findMany({ orderBy: { threshold: "asc" } }),
    prisma.reviewItem.findMany({
      where: { learnerId: learner.id, status: REVIEW_ITEM_STATUS.ACTIVE, question: { status: QUESTION_STATUS.PUBLISHED } },
      orderBy: [{ dueAt: "asc" }, { updatedAt: "desc" }],
      take: 5,
      include: { question: { include: { subject: true, grade: true } } },
    }),
    prisma.practiceSession.findMany({ where: { learnerId: learner.id }, orderBy: { startedAt: "desc" }, take: 6 }),
    prisma.practiceAttempt.count({ where: { learnerId: learner.id } }),
  ]);

  const subjectMap = new Map<string, Aggregate>();
  const topicMap = new Map<string, TopicAggregate>();
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
      if (tag.dimension.key !== TAG_DIMENSION.TOPIC) continue;
      const topicKey = `${attempt.question.subject.slug}:${tag.slug}`;
      const topic = topicMap.get(topicKey) ?? {
        slug: tag.slug,
        subject: attempt.question.subject.slug,
        label: tag.label,
        attempts: 0,
        correct: 0,
      };
      topic.attempts += 1;
      topic.correct += attempt.isCorrect ? 1 : 0;
      topicMap.set(topicKey, topic);
    }
  }

  const today = calendarDay(now, timeZone);
  const activityByDay = new Map(activities.map((item) => [item.activityDate, item]));
  const days: string[] = [];
  let cursor = today;
  for (let index = 0; index < ACTIVITY_DAYS; index += 1) {
    days.unshift(cursor);
    cursor = previousCalendarDay(cursor);
  }
  const gradedCorrect = attempts.filter((attempt) => attempt.isCorrect).length;
  const ownedById = new Map(ownedBadges.map((item) => [item.badgeId, item.earnedAt]));

  return {
    summary: {
      totalAttempts,
      correctRate: accuracy(gradedCorrect, attempts.length),
      xp: learner.xp,
      level: levelForXp(learner.xp),
      currentStreak: visibleStreak(learner, today),
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
      accuracy: accuracy(item.correct, item.attempts),
    })).sort((left, right) => right.attempts - left.attempts),
    weakTopics: [...topicMap.values()].map((item) => ({
      ...item,
      accuracy: accuracy(item.correct, item.attempts),
    })).filter((item) => item.attempts >= 2)
      .sort((left, right) => left.accuracy - right.accuracy || right.attempts - left.attempts)
      .slice(0, 6),
    recentMistakes: reviewItems.map((item) => ({
      id: item.question.id,
      stem: item.question.stem,
      subject: item.question.subject.name,
      subjectColor: item.question.subject.color,
      grade: item.question.grade.name,
      dueAt: item.dueAt.toISOString(),
      isDue: item.dueAt <= now,
    })),
    badges: badges.map((badge) => ({
      slug: badge.slug,
      name: badge.name,
      description: badge.description,
      icon: badge.icon,
      earnedAt: ownedById.get(badge.id)?.toISOString() ?? null,
    })),
    sessions: sessions.map((session) => ({
      id: session.id,
      status: session.status,
      completedCount: session.completedCount,
      questionGoal: session.questionGoal,
      correctCount: session.correctCount,
      earnedXp: session.earnedXp,
      startedAt: session.startedAt.toISOString(),
    })),
  };
}
