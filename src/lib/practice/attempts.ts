import { Prisma } from "@prisma/client";
import type { AttemptRequest, AttemptResult, SelfAssessmentRequest } from "@/lib/contracts/practice";
import { calendarDay, effectiveTimeZone } from "@/lib/dates";
import { PRACTICE_SESSION_STATUS, QUESTION_STATUS } from "@/lib/domain-constants";
import { prisma } from "@/lib/prisma";
import { awardEarnedBadges } from "./badges";
import { correctLabelsFor } from "./grading";
import { gradedQuestionScope, recordGradedResult, topicTagSelect } from "./learner-stats";
import { nextReviewState, shouldRescheduleReview } from "./review-scheduler";
import { attemptXp, levelForXp, nextStreakState } from "./rewards";

export type AttemptQuestion = {
  id: string;
  difficulty: string;
  correctAnswer: string | null;
  answer: string;
  explanation: string | null;
  isAutoGradable: boolean;
  options: Array<{ label: string }>;
  subjectId: string;
  difficultyScore: number;
  tags: Array<{ tagId: string }>;
};

export async function findAttemptQuestion(questionId: string): Promise<AttemptQuestion | null> {
  return prisma.question.findFirst({
    where: { id: questionId, status: QUESTION_STATUS.PUBLISHED },
    select: {
      id: true,
      difficulty: true,
      correctAnswer: true,
      answer: true,
      explanation: true,
      isAutoGradable: true,
      options: { select: { label: true } },
      subjectId: true,
      difficultyScore: true,
      tags: topicTagSelect,
    },
  });
}

// Guests are graded statelessly: nothing about the attempt is persisted.
export function guestAttemptResult(
  question: AttemptQuestion,
  grading: { isCorrect: boolean | null; correctLabels: string[] },
): AttemptResult {
  return {
    attemptId: null,
    isCorrect: grading.isCorrect,
    correctLabels: grading.correctLabels,
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
  };
}

type RecordedAttempt = { status: "RECORDED"; result: AttemptResult } | { status: "CONFLICT" };

async function replayAttempt(
  clientAttemptId: string,
  learnerId: string,
  question: AttemptQuestion,
  today: string,
): Promise<RecordedAttempt | null> {
  const attempt = await prisma.practiceAttempt.findUnique({
    where: { clientAttemptId },
    include: { learner: true, session: true },
  });
  if (!attempt) return null;
  if (attempt.learnerId !== learnerId || attempt.questionId !== question.id) return { status: "CONFLICT" };
  const activity = await prisma.dailyActivity.findUnique({
    where: { learnerId_activityDate: { learnerId: attempt.learnerId, activityDate: today } },
  });
  return {
    status: "RECORDED",
    result: {
      attemptId: attempt.id,
      isCorrect: attempt.isCorrect,
      correctLabels: correctLabelsFor(question),
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
    },
  };
}

function isUniqueConflict(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

export async function recordLearnerAttempt(params: {
  learnerId: string;
  // The learner's stored zone wins over the request so a learner cannot gain
  // extra streak days by switching zones; the first attempt stores it.
  storedTimeZone?: string | null;
  question: AttemptQuestion;
  grading: { isCorrect: boolean | null; correctLabels: string[] };
  input: AttemptRequest;
  // Internal link for answers submitted as part of a timed contest paper.
  contestSessionId?: string;
  now?: Date;
}): Promise<RecordedAttempt> {
  const { learnerId, question, input } = params;
  const { isCorrect, correctLabels } = params.grading;
  const now = params.now ?? new Date();
  const timeZone = effectiveTimeZone(params.storedTimeZone, input.timeZone);
  const today = calendarDay(now, timeZone);
  const hintsUsed = input.hintsUsed ?? 0;
  const earnedXp = attemptXp(isCorrect, question.difficulty, hintsUsed);

  if (input.clientAttemptId) {
    const replay = await replayAttempt(input.clientAttemptId, learnerId, question, today);
    if (replay) return replay;
  }

  let recorded;
  try {
    recorded = await prisma.$transaction(async (transaction) => {
      const learner = await transaction.learnerProfile.findUniqueOrThrow({ where: { id: learnerId } });
      const session = input.sessionId ? await transaction.practiceSession.findFirst({
        where: { id: input.sessionId, learnerId, status: PRACTICE_SESSION_STATUS.ACTIVE },
      }) : null;
      const streak = nextStreakState(learner, today);
      const existingReview = isCorrect !== null ? await transaction.reviewItem.findUnique({
        where: { learnerId_questionId: { learnerId, questionId: question.id } },
      }) : null;

      const attempt = await transaction.practiceAttempt.create({ data: {
        clientAttemptId: input.clientAttemptId,
        learnerId,
        sessionId: session?.id,
        contestSessionId: params.contestSessionId,
        questionId: question.id,
        response: JSON.stringify(input.response),
        isCorrect,
        isSelfAssessed: isCorrect === null,
        secondsSpent: input.secondsSpent,
        hintsUsed,
        earnedXp,
      } });
      let updatedLearner = await transaction.learnerProfile.update({
        where: { id: learnerId },
        data: {
          xp: { increment: earnedXp },
          level: levelForXp(learner.xp + earnedXp),
          currentStreak: streak.currentStreak,
          bestStreak: streak.bestStreak,
          streakFreezes: streak.streakFreezes,
          lastFreezeUsedOn: streak.lastFreezeUsedOn,
          lastActiveOn: streak.lastActiveOn,
          totalAttempts: { increment: 1 },
          // The automatic first choice does not start the 24-hour change lock.
          ...(learner.timeZone ? {} : { timeZone }),
          // Self-assessed work neither extends nor breaks the correct run.
          ...(isCorrect === true ? { correctRun: { increment: 1 } } : isCorrect === false ? { correctRun: 0 } : {}),
        },
      });
      // A concurrent attempt can increment XP between the read and the update;
      // correct the stored level only in that rare case.
      if (updatedLearner.level !== levelForXp(updatedLearner.xp)) {
        updatedLearner = await transaction.learnerProfile.update({
          where: { id: learnerId },
          data: { level: levelForXp(updatedLearner.xp) },
        });
      }
      const activity = await transaction.dailyActivity.upsert({
        where: { learnerId_activityDate: { learnerId, activityDate: today } },
        create: { learnerId, activityDate: today, attempts: 1, correct: isCorrect ? 1 : 0, earnedXp },
        update: { attempts: { increment: 1 }, correct: { increment: isCorrect ? 1 : 0 }, earnedXp: { increment: earnedXp } },
      });

      if (isCorrect !== null) {
        await recordGradedResult(transaction, {
          learnerId,
          scope: { subjectId: question.subjectId, difficultyScore: question.difficultyScore, topicTagIds: question.tags.map(({ tagId }) => tagId) },
          isCorrect,
          at: now,
        });
      }

      if (isCorrect !== null && shouldRescheduleReview(existingReview, isCorrect, now)) {
        const review = nextReviewState(existingReview, Boolean(isCorrect), now, { assisted: hintsUsed > 0 });
        await transaction.reviewItem.upsert({
          where: { learnerId_questionId: { learnerId, questionId: question.id } },
          create: { learnerId, questionId: question.id, ...review },
          update: review,
        });
      }

      let sessionProgress = null;
      if (session) {
        const incremented = await transaction.practiceSession.updateMany({
          where: { id: session.id, status: PRACTICE_SESSION_STATUS.ACTIVE, activeKey: learnerId },
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
            where: { id: session.id },
            data: { activeKey: null, status: PRACTICE_SESSION_STATUS.COMPLETED, completedAt: now },
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

      const newBadges = await awardEarnedBadges(transaction, learnerId, {
        totalAttempts: updatedLearner.totalAttempts,
        correctRun: updatedLearner.correctRun,
        currentStreak: updatedLearner.currentStreak,
      });

      return { attempt, updatedLearner, activity, streak, sessionProgress, newBadges };
    });
  } catch (error) {
    if (isUniqueConflict(error) && input.clientAttemptId) {
      const replay = await replayAttempt(input.clientAttemptId, learnerId, question, today);
      if (replay) return replay;
    }
    throw error;
  }

  return {
    status: "RECORDED",
    result: {
      attemptId: recorded.attempt.id,
      isCorrect,
      correctLabels,
      answer: question.answer,
      explanation: question.explanation,
      earnedXp,
      totalXp: recorded.updatedLearner.xp,
      level: levelForXp(recorded.updatedLearner.xp),
      currentStreak: recorded.streak.currentStreak,
      streakFreezes: recorded.updatedLearner.streakFreezes,
      streakFreezeUsed: recorded.streak.usedFreeze,
      todayAttempts: recorded.activity.attempts,
      newBadges: recorded.newBadges,
      session: recorded.sessionProgress,
      replayed: false,
      persisted: true,
    },
  };
}

export async function recordExplanationView(learnerId: string, attemptId: string) {
  const viewedAt = new Date();
  const updated = await prisma.practiceAttempt.updateMany({
    where: {
      id: attemptId,
      learnerId,
      isCorrect: false,
      explanationViewedAt: null,
      question: { explanation: { not: null } },
    },
    data: { explanationViewedAt: viewedAt },
  });
  if (updated.count) return { status: "RECORDED" as const, viewedAt };

  const attempt = await prisma.practiceAttempt.findFirst({
    where: { id: attemptId, learnerId },
    select: { explanationViewedAt: true },
  });
  if (!attempt) return { status: "NOT_FOUND" as const };
  if (attempt.explanationViewedAt) return { status: "ALREADY_RECORDED" as const, viewedAt: attempt.explanationViewedAt };
  return { status: "INELIGIBLE" as const };
}

export async function assessWrittenAttempt(
  learner: { id: string; timeZone: string | null },
  input: SelfAssessmentRequest,
  now = new Date(),
) {
  const learnerId = learner.id;
  return prisma.$transaction(async (transaction) => {
    const attempt = await transaction.practiceAttempt.findFirst({
      where: { id: input.attemptId, learnerId },
      select: { id: true, learnerId: true, questionId: true, sessionId: true, createdAt: true, isSelfAssessed: true, isCorrect: true },
    });
    if (!attempt) return { status: "NOT_FOUND" as const };
    if (!attempt.isSelfAssessed || attempt.isCorrect !== null) return { status: "ALREADY_ASSESSED" as const };

    const claimed = await transaction.practiceAttempt.updateMany({
      where: { id: attempt.id, learnerId, isSelfAssessed: true, isCorrect: null },
      data: { isCorrect: input.isCorrect },
    });
    if (!claimed.count) return { status: "ALREADY_ASSESSED" as const };
    const scope = await gradedQuestionScope(transaction, attempt.questionId);
    if (scope) await recordGradedResult(transaction, { learnerId, scope, isCorrect: input.isCorrect, at: now });

    const existingReview = await transaction.reviewItem.findUnique({
      where: { learnerId_questionId: { learnerId: attempt.learnerId, questionId: attempt.questionId } },
    });
    const review = nextReviewState(existingReview, input.isCorrect, now);
    if (input.isCorrect) {
      const activityDate = calendarDay(attempt.createdAt, effectiveTimeZone(learner.timeZone, input.timeZone));
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
    if (shouldRescheduleReview(existingReview, input.isCorrect, now)) {
      await transaction.reviewItem.upsert({
        where: { learnerId_questionId: { learnerId: attempt.learnerId, questionId: attempt.questionId } },
        create: { learnerId: attempt.learnerId, questionId: attempt.questionId, ...review },
        update: review,
      });
    }
    return { status: "ASSESSED" as const, isCorrect: input.isCorrect };
  });
}
