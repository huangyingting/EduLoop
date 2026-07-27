import { NextResponse } from "next/server";
import { z } from "zod";
import { enforceRateLimit } from "@/lib/api";
import { calendarDay, calendarDaysBefore, previousCalendarDay } from "@/lib/dates";
import { prisma } from "@/lib/prisma";
import { nextReviewState } from "@/lib/review";

const attemptSchema = z.object({
  questionId: z.string().min(8),
  deviceKey: z.string().min(8).max(100),
  response: z.union([z.string().max(5000), z.array(z.string().max(10)).max(8)]),
  secondsSpent: z.number().int().min(0).max(7200).optional(),
  sessionId: z.string().min(8).max(100).optional(),
  timeZone: z.string().max(100).optional(),
});

const selfAssessmentSchema = z.object({
  attemptId: z.string().min(8),
  deviceKey: z.string().min(8).max(100),
  isCorrect: z.boolean(),
  timeZone: z.string().max(100).optional(),
});

function levelForXp(xp: number) {
  return Math.floor(xp / 120) + 1;
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = attemptSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid attempt", details: parsed.error.flatten() }, { status: 400 });
  const input = parsed.data;
  const limited = enforceRateLimit(request, "attempts", input.deviceKey, 45);
  if (limited) return limited;
  const question = await prisma.question.findUnique({ where: { id: input.questionId } });
  if (!question || question.status !== "PUBLISHED") return NextResponse.json({ error: "Question not found" }, { status: 404 });

  const responseLabels = Array.isArray(input.response)
    ? [...new Set(input.response.map((item) => item.toUpperCase()))].sort()
    : [];
  const correctLabels = question.correctAnswer ? JSON.parse(question.correctAnswer) as string[] : [];
  const isCorrect = question.isAutoGradable
    ? JSON.stringify(responseLabels) === JSON.stringify([...correctLabels].sort())
    : null;
  const difficultyBonus = { EASY: 4, MEDIUM: 7, HARD: 11 }[question.difficulty] ?? 5;
  const earnedXp = isCorrect === true ? 6 + difficultyBonus : isCorrect === false ? 2 : 3;
  const today = calendarDay(new Date(), input.timeZone);
  const now = new Date();

  const result = await prisma.$transaction(async (transaction) => {
    const learner = await transaction.learnerProfile.upsert({
      where: { deviceKey: input.deviceKey },
      create: { deviceKey: input.deviceKey },
      update: {},
    });
    const session = input.sessionId ? await transaction.practiceSession.findFirst({
      where: { id: input.sessionId, learnerId: learner.id, status: "ACTIVE" },
    }) : null;
    const activeToday = learner.lastActiveOn === today;
    const usesFreeze = !activeToday
      && learner.lastActiveOn === calendarDaysBefore(today, 2)
      && learner.streakFreezes > 0;
    const nextStreak = activeToday
      ? learner.currentStreak
      : learner.lastActiveOn === previousCalendarDay(today) || usesFreeze ? learner.currentStreak + 1 : 1;
    const milestoneFreeze = !activeToday && nextStreak > 0 && nextStreak % 7 === 0 ? 1 : 0;
    const nextStreakFreezes = Math.min(2, learner.streakFreezes - (usesFreeze ? 1 : 0) + milestoneFreeze);
    const existingReview = isCorrect !== null ? await transaction.reviewItem.findUnique({
      where: { learnerId_questionId: { learnerId: learner.id, questionId: question.id } },
    }) : null;

    const attempt = await transaction.practiceAttempt.create({ data: {
      learnerId: learner.id,
      sessionId: session?.id,
      questionId: question.id,
      response: JSON.stringify(input.response),
      isCorrect,
      isSelfAssessed: isCorrect === null,
      secondsSpent: input.secondsSpent,
      earnedXp,
    } });
    const updatedLearner = await transaction.learnerProfile.update({
      where: { id: learner.id },
      data: {
        xp: { increment: earnedXp },
        currentStreak: nextStreak,
        bestStreak: Math.max(learner.bestStreak, nextStreak),
        streakFreezes: nextStreakFreezes,
        lastFreezeUsedOn: usesFreeze ? today : learner.lastFreezeUsedOn,
        lastActiveOn: today,
      },
    });
    const activity = await transaction.dailyActivity.upsert({
      where: { learnerId_activityDate: { learnerId: learner.id, activityDate: today } },
      create: { learnerId: learner.id, activityDate: today, attempts: 1, correct: isCorrect ? 1 : 0, earnedXp },
      update: { attempts: { increment: 1 }, correct: { increment: isCorrect ? 1 : 0 }, earnedXp: { increment: earnedXp } },
    });

    const shouldUpdateReview = isCorrect === false || Boolean(
      isCorrect && existingReview?.status === "ACTIVE" && existingReview.dueAt <= now,
    );
    if (shouldUpdateReview) {
      const review = nextReviewState(existingReview, Boolean(isCorrect), now);
      await transaction.reviewItem.upsert({
        where: { learnerId_questionId: { learnerId: learner.id, questionId: question.id } },
        create: { learnerId: learner.id, questionId: question.id, ...review },
        update: review,
      });
    }

    let sessionProgress = null;
    if (session) {
      const updatedSession = await transaction.practiceSession.update({
        where: { id: session.id },
        data: {
          completedCount: { increment: 1 },
          correctCount: { increment: isCorrect ? 1 : 0 },
          earnedXp: { increment: earnedXp },
        },
      });
      const completed = updatedSession.completedCount >= updatedSession.questionGoal;
      const finalSession = completed ? await transaction.practiceSession.update({
        where: { id: session.id }, data: { status: "COMPLETED", completedAt: now },
      }) : updatedSession;
      sessionProgress = {
        id: finalSession.id,
        status: finalSession.status,
        questionGoal: finalSession.questionGoal,
        completedCount: finalSession.completedCount,
        correctCount: finalSession.correctCount,
        earnedXp: finalSession.earnedXp,
      };
    }

    return { learner, attempt, updatedLearner, activity, nextStreak, usesFreeze, sessionProgress };
  });

  const totalXp = result.updatedLearner.xp;
  const level = levelForXp(totalXp);
  await prisma.learnerProfile.updateMany({
    where: { id: result.learner.id, xp: totalXp },
    data: { level },
  });

  const attempts = await prisma.practiceAttempt.count({ where: { learnerId: result.learner.id } });
  const recent = await prisma.practiceAttempt.findMany({
    where: { learnerId: result.learner.id, isCorrect: { not: null }, isSelfAssessed: false },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: { isCorrect: true },
  });
  const earnedBadgeSlugs = [
    attempts >= 1 ? "first-spark" : null,
    attempts >= 100 ? "century-club" : null,
    recent.length === 10 && recent.every((item) => item.isCorrect) ? "ten-in-a-row" : null,
  ].filter(Boolean) as string[];
  const newBadges: Array<{ name: string; icon: string }> = [];
  for (const slug of earnedBadgeSlugs) {
    const badge = await prisma.badge.findUnique({ where: { slug } });
    if (!badge) continue;
    const inserted = await prisma.$executeRaw`
      INSERT INTO "LearnerBadge" ("learnerId", "badgeId", "earnedAt")
      VALUES (${result.learner.id}, ${badge.id}, ${new Date()})
      ON CONFLICT ("learnerId", "badgeId") DO NOTHING
    `;
    if (inserted) newBadges.push({ name: badge.name, icon: badge.icon });
  }

  return NextResponse.json({
    attemptId: result.attempt.id,
    isCorrect,
    correctLabels,
    answer: question.answer,
    explanation: question.explanation,
    earnedXp,
    totalXp,
    level,
    currentStreak: result.nextStreak,
    streakFreezes: result.updatedLearner.streakFreezes,
    streakFreezeUsed: result.usesFreeze,
    todayAttempts: result.activity.attempts,
    newBadges,
    session: result.sessionProgress,
  });
}

export async function PATCH(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = selfAssessmentSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid self-assessment" }, { status: 400 });
  const input = parsed.data;
  const limited = enforceRateLimit(request, "assessments", input.deviceKey, 45);
  if (limited) return limited;
  const now = new Date();

  const outcome = await prisma.$transaction(async (transaction) => {
    const attempt = await transaction.practiceAttempt.findFirst({
      where: { id: input.attemptId, learner: { deviceKey: input.deviceKey } },
      include: { learner: { select: { id: true } } },
    });
    if (!attempt) return { error: "Attempt not found" as const };
    if (!attempt.isSelfAssessed || attempt.isCorrect !== null) return { error: "Attempt already assessed" as const };

    const existingReview = await transaction.reviewItem.findUnique({
      where: { learnerId_questionId: { learnerId: attempt.learner.id, questionId: attempt.questionId } },
    });
    const review = nextReviewState(existingReview, input.isCorrect, now);
    await transaction.practiceAttempt.update({ where: { id: attempt.id }, data: { isCorrect: input.isCorrect } });
    if (input.isCorrect) {
      const activityDate = calendarDay(attempt.createdAt, input.timeZone);
      await transaction.dailyActivity.updateMany({
        where: { learnerId: attempt.learner.id, activityDate },
        data: { correct: { increment: 1 } },
      });
      if (attempt.sessionId) {
        await transaction.practiceSession.updateMany({
          where: { id: attempt.sessionId },
          data: { correctCount: { increment: 1 } },
        });
      }
    }
    const shouldUpdateReview = !input.isCorrect || Boolean(
      existingReview?.status === "ACTIVE" && existingReview.dueAt <= now,
    );
    if (shouldUpdateReview) {
      await transaction.reviewItem.upsert({
        where: { learnerId_questionId: { learnerId: attempt.learner.id, questionId: attempt.questionId } },
        create: { learnerId: attempt.learner.id, questionId: attempt.questionId, ...review },
        update: review,
      });
    }
    return { isCorrect: input.isCorrect };
  });

  if ("error" in outcome) {
    const status = outcome.error === "Attempt not found" ? 404 : 409;
    return NextResponse.json({ error: outcome.error }, { status });
  }
  return NextResponse.json(outcome);
}
