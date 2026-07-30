import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, apiHandler, enforceRateLimit } from "@/lib/api";
import { getSessionUser } from "@/lib/auth";
import { isSameOriginRequest } from "@/lib/auth-validation";
import { calendarDay, calendarDaysBefore, previousCalendarDay } from "@/lib/dates";
import { prisma } from "@/lib/prisma";
import { nextReviewState } from "@/lib/review";
import { ensureLearnerForUser, findLearnerForRequest } from "@/lib/learner-identity";

const attemptSchema = z.object({
  questionId: z.string().min(8).max(100),
  response: z.union([
    z.string().max(5000).refine((value) => value.trim().length > 0, "Response is required"),
    z.array(z.string().trim().min(1).max(10)).min(1).max(8),
  ]),
  secondsSpent: z.number().int().min(0).max(7200).optional(),
  sessionId: z.string().min(8).max(100).optional(),
  clientAttemptId: z.string().uuid().optional(),
  timeZone: z.string().max(100).optional(),
});

const selfAssessmentSchema = z.object({
  attemptId: z.string().min(8).max(100),
  isCorrect: z.boolean(),
  timeZone: z.string().max(100).optional(),
});

const explanationViewSchema = z.object({
  event: z.literal("EXPLANATION_VIEWED"),
  attemptId: z.string().min(8).max(100),
});

function levelForXp(xp: number) {
  return Math.floor(xp / 120) + 1;
}

async function replayAttempt(
  clientAttemptId: string,
  learnerId: string,
  questionId: string,
  question: { id: string; correctAnswer: string | null; answer: string; explanation: string | null },
  today: string,
) {
  const attempt = await prisma.practiceAttempt.findUnique({
    where: { clientAttemptId },
    include: { learner: true, session: true },
  });
  if (!attempt) return null;
  if (attempt.learnerId !== learnerId || attempt.questionId !== questionId) {
    return apiError("Attempt key already used", 409, "CONFLICT");
  }
  const activity = await prisma.dailyActivity.findUnique({
    where: { learnerId_activityDate: { learnerId: attempt.learnerId, activityDate: today } },
  });
  const correctLabels = question.correctAnswer ? JSON.parse(question.correctAnswer) as string[] : [];
  return NextResponse.json({
    attemptId: attempt.id,
    isCorrect: attempt.isCorrect,
    correctLabels,
    answer: question.answer,
    explanation: question.explanation,
    earnedXp: attempt.earnedXp,
    totalXp: attempt.learner.xp,
    level: levelForXp(attempt.learner.xp),
    currentStreak: attempt.learner.currentStreak,
    streakFreezes: attempt.learner.streakFreezes,
    streakFreezeUsed: false,
    todayAttempts: activity?.attempts ?? 0,
    newBadges: [],
    session: attempt.session ? {
      id: attempt.session.id,
      status: attempt.session.status,
      questionGoal: attempt.session.questionGoal,
      completedCount: attempt.session.completedCount,
      correctCount: attempt.session.correctCount,
      earnedXp: attempt.session.earnedXp,
    } : null,
    replayed: true,
    persisted: true,
  });
}

async function postAttempt(request: Request) {
  if (!isSameOriginRequest(request)) return apiError("Invalid request origin.", 403, "FORBIDDEN");
  const body = await request.json().catch(() => null);
  const parsed = attemptSchema.safeParse(body);
  if (!parsed.success) return apiError("Invalid attempt", 400, "INVALID_REQUEST", parsed.error.flatten());
  const input = parsed.data;
  const user = await getSessionUser(request);
  const limited = enforceRateLimit(request, "attempts", user?.id ?? "guest", 45);
  if (limited) return limited;
  const question = await prisma.question.findUnique({
    where: { id: input.questionId },
    include: { options: { select: { label: true } } },
  });
  if (!question || question.status !== "PUBLISHED") return apiError("Question not found", 404, "NOT_FOUND");
  const optionResponse = Array.isArray(input.response);
  if (optionResponse !== (question.options.length > 0)) {
    return apiError("Invalid response type", 400, "INVALID_REQUEST");
  }
  if (Array.isArray(input.response)) {
    const validLabels = new Set(question.options.map(({ label }) => label.toUpperCase()));
    if (input.response.some((label) => !validLabels.has(label.toUpperCase()))) {
      return apiError("Invalid response option", 400, "INVALID_REQUEST");
    }
  }

  const responseLabels = Array.isArray(input.response)
    ? [...new Set(input.response.map((item) => item.toUpperCase()))].sort()
    : [];
  const correctLabels = question.correctAnswer ? JSON.parse(question.correctAnswer) as string[] : [];
  const isCorrect = question.isAutoGradable
    ? JSON.stringify(responseLabels) === JSON.stringify([...correctLabels].sort())
    : null;
  const difficultyBonus = { EASY: 4, MEDIUM: 7, HARD: 11 }[question.difficulty] ?? 5;
  const earnedXp = isCorrect === true ? 6 + difficultyBonus : isCorrect === false ? 2 : 3;

  if (!user) {
    return NextResponse.json({
      attemptId: null,
      isCorrect,
      correctLabels,
      answer: question.answer,
      explanation: question.explanation,
      earnedXp: 0,
      totalXp: 0,
      level: 1,
      currentStreak: 0,
      streakFreezes: 0,
      streakFreezeUsed: false,
      todayAttempts: 0,
      newBadges: [],
      session: null,
      replayed: false,
      persisted: false,
    }, { headers: { "Cache-Control": "no-store" } });
  }

  const today = calendarDay(new Date(), input.timeZone);
  const now = new Date();
  const identity = await ensureLearnerForUser(user.id, user.displayName);

  if (input.clientAttemptId) {
    const replay = await replayAttempt(input.clientAttemptId, identity.id, input.questionId, question, today);
    if (replay) return replay;
  }

  let result;
  try {
    result = await prisma.$transaction(async (transaction) => {
      const learner = await transaction.learnerProfile.findUniqueOrThrow({ where: { id: identity.id } });
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
        clientAttemptId: input.clientAttemptId,
        learnerId: learner.id,
        sessionId: session?.id,
        questionId: question.id,
        response: JSON.stringify(input.response),
        isCorrect,
        isSelfAssessed: isCorrect === null,
        secondsSpent: input.secondsSpent,
        earnedXp,
      } });
      let updatedLearner = await transaction.learnerProfile.update({
        where: { id: learner.id },
        data: {
          xp: { increment: earnedXp },
          level: levelForXp(learner.xp + earnedXp),
          currentStreak: nextStreak,
          bestStreak: Math.max(learner.bestStreak, nextStreak),
          streakFreezes: nextStreakFreezes,
          lastFreezeUsedOn: usesFreeze ? today : learner.lastFreezeUsedOn,
          lastActiveOn: today,
        },
      });
      const storedLevel = levelForXp(updatedLearner.xp);
      if (updatedLearner.level !== storedLevel) {
        updatedLearner = await transaction.learnerProfile.update({
          where: { id: learner.id },
          data: { level: storedLevel },
        });
      }
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
        const incremented = await transaction.practiceSession.updateMany({
          where: { id: session.id, status: "ACTIVE", activeKey: learner.id },
          data: {
            completedCount: { increment: 1 },
            correctCount: { increment: isCorrect ? 1 : 0 },
            earnedXp: { increment: earnedXp },
          },
        });
        if (!incremented.count) {
          // Another device restarted this learner's session after the read
          // above. Keep the immutable attempt, but do not attach it to or
          // resurrect a session that is no longer active.
          await transaction.practiceAttempt.update({
            where: { id: attempt.id },
            data: { sessionId: null },
          });
        } else {
          const updatedSession = await transaction.practiceSession.findUniqueOrThrow({ where: { id: session.id } });
          const completed = updatedSession.completedCount >= updatedSession.questionGoal;
          const finalSession = completed ? await transaction.practiceSession.update({
            where: { id: session.id }, data: { activeKey: null, status: "COMPLETED", completedAt: now },
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
      }

      const attempts = await transaction.practiceAttempt.count({ where: { learnerId: learner.id } });
      const recent = await transaction.practiceAttempt.findMany({
        where: { learnerId: learner.id, isCorrect: { not: null }, isSelfAssessed: false },
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
        const badge = await transaction.badge.findUnique({ where: { slug } });
        if (!badge) continue;
        const inserted = await transaction.$executeRaw`
          INSERT INTO "LearnerBadge" ("learnerId", "badgeId", "earnedAt")
          VALUES (${learner.id}, ${badge.id}, ${new Date()})
          ON CONFLICT ("learnerId", "badgeId") DO NOTHING
        `;
        if (inserted) newBadges.push({ name: badge.name, icon: badge.icon });
      }

      return { attempt, updatedLearner, activity, nextStreak, usesFreeze, sessionProgress, newBadges };
    });
  } catch (error) {
    const uniqueConflict = error && typeof error === "object" && "code" in error && error.code === "P2002";
    if (uniqueConflict && input.clientAttemptId) {
      const replay = await replayAttempt(input.clientAttemptId, identity.id, input.questionId, question, today);
      if (replay) return replay;
    }
    throw error;
  }

  const totalXp = result.updatedLearner.xp;
  const level = levelForXp(totalXp);

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
    newBadges: result.newBadges,
    session: result.sessionProgress,
    replayed: false,
    persisted: true,
  });
}

async function recordExplanationView(request: Request, input: z.infer<typeof explanationViewSchema>) {
  const user = await getSessionUser(request);
  if (!user) return apiError("请先登录。", 401, "UNAUTHORIZED");
  const limited = enforceRateLimit(request, "explanation-views", user.id, 90);
  if (limited) return limited;
  const learner = await findLearnerForRequest(request);
  if (!learner) return apiError("Attempt not found", 404, "NOT_FOUND");
  const viewedAt = new Date();
  const updated = await prisma.practiceAttempt.updateMany({
    where: {
      id: input.attemptId,
      learnerId: learner.id,
      isCorrect: false,
      explanationViewedAt: null,
      question: { explanation: { not: null } },
    },
    data: { explanationViewedAt: viewedAt },
  });
  if (updated.count) return NextResponse.json({ recorded: true, viewedAt });

  const attempt = await prisma.practiceAttempt.findFirst({
    where: { id: input.attemptId, learnerId: learner.id },
    select: { explanationViewedAt: true },
  });
  if (!attempt) return apiError("Attempt not found", 404, "NOT_FOUND");
  if (attempt.explanationViewedAt) {
    return NextResponse.json({ recorded: false, viewedAt: attempt.explanationViewedAt });
  }
  return apiError("Explanation view is not eligible for this attempt", 409, "CONFLICT");
}

async function patchAttempt(request: Request) {
  if (!isSameOriginRequest(request)) return apiError("Invalid request origin.", 403, "FORBIDDEN");
  const user = await getSessionUser(request);
  if (!user) return apiError("请先登录。", 401, "UNAUTHORIZED");
  const body = await request.json().catch(() => null);
  const explanationView = explanationViewSchema.safeParse(body);
  if (explanationView.success) return recordExplanationView(request, explanationView.data);
  const parsed = selfAssessmentSchema.safeParse(body);
  if (!parsed.success) return apiError("Invalid self-assessment", 400, "INVALID_REQUEST");
  const input = parsed.data;
  const limited = enforceRateLimit(request, "assessments", user.id, 45);
  if (limited) return limited;
  const now = new Date();
  const learner = await findLearnerForRequest(request);
  if (!learner) return apiError("Attempt not found", 404, "NOT_FOUND");

  const outcome = await prisma.$transaction(async (transaction) => {
    const attempt = await transaction.practiceAttempt.findFirst({
      where: { id: input.attemptId, learnerId: learner.id },
      select: { id: true, learnerId: true, questionId: true, sessionId: true, createdAt: true, isSelfAssessed: true, isCorrect: true },
    });
    if (!attempt) return { error: "Attempt not found" as const };
    if (!attempt.isSelfAssessed || attempt.isCorrect !== null) return { error: "Attempt already assessed" as const };

    const claimed = await transaction.practiceAttempt.updateMany({
      where: { id: attempt.id, learnerId: learner.id, isSelfAssessed: true, isCorrect: null },
      data: { isCorrect: input.isCorrect },
    });
    if (!claimed.count) return { error: "Attempt already assessed" as const };

    const existingReview = await transaction.reviewItem.findUnique({
      where: { learnerId_questionId: { learnerId: attempt.learnerId, questionId: attempt.questionId } },
    });
    const review = nextReviewState(existingReview, input.isCorrect, now);
    if (input.isCorrect) {
      const activityDate = calendarDay(attempt.createdAt, input.timeZone);
      await transaction.dailyActivity.updateMany({
        where: { learnerId: attempt.learnerId, activityDate },
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
        where: { learnerId_questionId: { learnerId: attempt.learnerId, questionId: attempt.questionId } },
        create: { learnerId: attempt.learnerId, questionId: attempt.questionId, ...review },
        update: review,
      });
    }
    return { isCorrect: input.isCorrect };
  });

  if ("error" in outcome) {
    const error = outcome.error ?? "Attempt already assessed";
    const status = error === "Attempt not found" ? 404 : 409;
    return apiError(error, status, status === 404 ? "NOT_FOUND" : "CONFLICT");
  }
  return NextResponse.json(outcome);
}

export const POST = apiHandler("POST /api/attempts", postAttempt);
export const PATCH = apiHandler("PATCH /api/attempts", patchAttempt);
