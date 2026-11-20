import type { Prisma } from "@prisma/client";
import { calendarDay, effectiveTimeZone } from "@/lib/dates";
import { REVIEW_ITEM_STATUS, TAG_DIMENSION } from "@/lib/domain-constants";
import { nextReviewState } from "@/lib/practice/review-scheduler";

export type RegradeSummary = { checked: number; nowCorrect: number; nowIncorrect: number; learners: number };

function sameLabels(response: string, correctLabels: string[]) {
  let labels: unknown;
  try {
    labels = JSON.parse(response);
  } catch {
    return false;
  }
  if (!Array.isArray(labels)) return false;
  const given = [...new Set(labels.map((label) => String(label).toUpperCase()))].sort();
  return JSON.stringify(given) === JSON.stringify([...correctLabels].sort());
}

// Re-grade automatically graded attempts after an editor corrects an answer
// key. Correctness, aggregates, daily activity, session counts, and review
// items follow the corrected key; XP already awarded is never taken back.
export async function regradeQuestionAttempts(
  transaction: Prisma.TransactionClient,
  questionId: string,
  correctLabels: string[],
  now = new Date(),
): Promise<RegradeSummary> {
  const attempts = await transaction.practiceAttempt.findMany({
    where: { questionId, isSelfAssessed: false, isCorrect: { not: null } },
    select: {
      id: true, learnerId: true, sessionId: true, response: true, isCorrect: true, createdAt: true,
      learner: { select: { timeZone: true } },
    },
  });
  const question = await transaction.question.findUniqueOrThrow({
    where: { id: questionId },
    select: { subjectId: true, tags: { where: { tag: { dimension: { key: TAG_DIMENSION.TOPIC } } }, select: { tagId: true } } },
  });
  const summary: RegradeSummary = { checked: attempts.length, nowCorrect: 0, nowIncorrect: 0, learners: 0 };
  const learners = new Set<string>();
  for (const attempt of attempts) {
    const isCorrect = correctLabels.length > 0 && sameLabels(attempt.response, correctLabels);
    if (isCorrect === attempt.isCorrect) continue;
    const delta = isCorrect ? 1 : -1;
    learners.add(attempt.learnerId);
    if (isCorrect) summary.nowCorrect += 1;
    else summary.nowIncorrect += 1;
    await transaction.practiceAttempt.update({ where: { id: attempt.id }, data: { isCorrect, regradedAt: now } });
    await transaction.learnerSubjectStat.updateMany({
      where: { learnerId: attempt.learnerId, subjectId: question.subjectId },
      data: { correct: { increment: delta } },
    });
    if (question.tags.length) {
      await transaction.learnerTopicStat.updateMany({
        where: { learnerId: attempt.learnerId, subjectId: question.subjectId, tagId: { in: question.tags.map(({ tagId }) => tagId) } },
        data: { correct: { increment: delta } },
      });
    }
    await transaction.dailyActivity.updateMany({
      where: { learnerId: attempt.learnerId, activityDate: calendarDay(attempt.createdAt, effectiveTimeZone(attempt.learner.timeZone)) },
      data: { correct: { increment: delta } },
    });
    if (attempt.sessionId) {
      await transaction.practiceSession.updateMany({ where: { id: attempt.sessionId }, data: { correctCount: { increment: delta } } });
    }
    if (!isCorrect) {
      // A newly wrong answer enters mistake review unless already there.
      const existing = await transaction.reviewItem.findUnique({
        where: { learnerId_questionId: { learnerId: attempt.learnerId, questionId } },
      });
      if (existing?.status !== REVIEW_ITEM_STATUS.ACTIVE) {
        const review = nextReviewState(existing, false, now);
        await transaction.reviewItem.upsert({
          where: { learnerId_questionId: { learnerId: attempt.learnerId, questionId } },
          create: { learnerId: attempt.learnerId, questionId, ...review },
          update: review,
        });
      }
    }
  }
  summary.learners = learners.size;
  return summary;
}
