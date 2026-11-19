import type { LearnerProfile } from "@prisma/client";
import type { LearnerActivitySummary, LearnerSnapshot, ProgressPayload } from "@/lib/contracts/practice";
import { calendarDay, previousCalendarDay, visibleStreak } from "@/lib/dates";
import { QUESTION_STATUS, REVIEW_ITEM_STATUS } from "@/lib/domain-constants";
import { prisma } from "@/lib/prisma";
import { levelForXp } from "./rewards";

const ACTIVITY_DAYS = 28;
const WEAK_TOPIC_MINIMUM_ATTEMPTS = 2;
const WEAK_TOPIC_LIMIT = 6;

const accuracy = (correct: number, attempts: number) => (attempts ? Math.round((correct / attempts) * 100) : 0);

const EMPTY_LEARNER = {
  id: "",
  xp: 0,
  currentStreak: 0,
  bestStreak: 0,
  streakFreezes: 1,
  lastActiveOn: null,
} as const;

export async function learnerSnapshot(learner: LearnerProfile | null, timeZone?: string): Promise<LearnerSnapshot> {
  if (!learner) return { xp: 0, level: 1, currentStreak: 0, bestStreak: 0, streakFreezes: EMPTY_LEARNER.streakFreezes, todayAttempts: 0 };
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

export function activityDays(today: string, count: number) {
  const days: string[] = [];
  let cursor = today;
  for (let index = 0; index < count; index += 1) {
    days.unshift(cursor);
    cursor = previousCalendarDay(cursor);
  }
  return days;
}

async function activityWindow(learnerId: string | null, today: string, count: number) {
  const days = activityDays(today, count);
  const activities = learnerId ? await prisma.dailyActivity.findMany({
    where: { learnerId, activityDate: { gte: days[0], lte: today } },
  }) : [];
  const activityByDay = new Map(activities.map((item) => [item.activityDate, item]));
  return days.map((date) => ({
    date,
    attempts: activityByDay.get(date)?.attempts ?? 0,
    correct: activityByDay.get(date)?.correct ?? 0,
    earnedXp: activityByDay.get(date)?.earnedXp ?? 0,
  }));
}

export async function learnerActivitySummary(
  learner: LearnerProfile | null,
  timeZone: string | undefined,
  days: number,
): Promise<LearnerActivitySummary> {
  const today = calendarDay(new Date(), timeZone);
  return { activity: await activityWindow(learner?.id ?? null, today, days) };
}

// Accuracy is all-time over graded attempts and comes from aggregates that the
// attempt transaction maintains, so this view reads a bounded number of rows
// regardless of how much a learner has practiced.
export async function learnerProgress(profile: LearnerProfile | null, timeZone?: string): Promise<ProgressPayload> {
  const now = new Date();
  const learner = profile ?? EMPTY_LEARNER;
  const learnerId = profile?.id ?? null;
  const today = calendarDay(now, timeZone);
  const [subjectStats, topicStats, activity, ownedBadges, badges, reviewItems, sessions] = await Promise.all([
    learnerId ? prisma.learnerSubjectStat.findMany({
      where: { learnerId },
      include: { subject: { select: { slug: true, name: true, color: true } } },
    }) : [],
    learnerId ? prisma.learnerTopicStat.findMany({
      where: { learnerId, attempts: { gte: WEAK_TOPIC_MINIMUM_ATTEMPTS } },
      include: { subject: { select: { slug: true } }, tag: { select: { slug: true, label: true } } },
    }) : [],
    activityWindow(learnerId, today, ACTIVITY_DAYS),
    learnerId ? prisma.learnerBadge.findMany({ where: { learnerId }, select: { badgeId: true, earnedAt: true } }) : [],
    prisma.badge.findMany({ orderBy: { threshold: "asc" } }),
    learnerId ? prisma.reviewItem.findMany({
      where: { learnerId, status: REVIEW_ITEM_STATUS.ACTIVE, question: { status: QUESTION_STATUS.PUBLISHED } },
      orderBy: [{ dueAt: "asc" }, { updatedAt: "desc" }],
      take: 5,
      include: { question: { include: { subject: true, grade: true } } },
    }) : [],
    learnerId ? prisma.practiceSession.findMany({ where: { learnerId }, orderBy: { startedAt: "desc" }, take: 6 }) : [],
  ]);

  const graded = subjectStats.reduce((total, stat) => total + stat.attempts, 0);
  const gradedCorrect = subjectStats.reduce((total, stat) => total + stat.correct, 0);
  const ownedById = new Map(ownedBadges.map((item) => [item.badgeId, item.earnedAt]));

  return {
    summary: {
      totalAttempts: profile?.totalAttempts ?? 0,
      correctRate: accuracy(gradedCorrect, graded),
      xp: learner.xp,
      level: levelForXp(learner.xp),
      currentStreak: visibleStreak(learner, today),
      bestStreak: learner.bestStreak,
    },
    activity,
    subjects: subjectStats.map((stat) => ({
      slug: stat.subject.slug,
      label: stat.subject.name,
      color: stat.subject.color,
      attempts: stat.attempts,
      correct: stat.correct,
      accuracy: accuracy(stat.correct, stat.attempts),
    })).sort((left, right) => right.attempts - left.attempts || left.slug.localeCompare(right.slug)),
    weakTopics: topicStats.map((stat) => ({
      slug: stat.tag.slug,
      subject: stat.subject.slug,
      label: stat.tag.label,
      attempts: stat.attempts,
      correct: stat.correct,
      accuracy: accuracy(stat.correct, stat.attempts),
    })).sort((left, right) => left.accuracy - right.accuracy || right.attempts - left.attempts || left.slug.localeCompare(right.slug))
      .slice(0, WEAK_TOPIC_LIMIT),
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
