import type { Prisma } from "@prisma/client";
import { TAG_DIMENSION } from "@/lib/domain-constants";
import { INITIAL_RATING, nextRating } from "./ability";

export type GradedQuestionScope = { subjectId: string; topicTagIds: string[]; difficultyScore: number };

export const topicTagSelect = {
  where: { tag: { dimension: { key: TAG_DIMENSION.TOPIC } } },
  select: { tagId: true },
} as const;

export async function gradedQuestionScope(
  transaction: Prisma.TransactionClient,
  questionId: string,
): Promise<GradedQuestionScope | null> {
  const question = await transaction.question.findUnique({
    where: { id: questionId },
    select: { subjectId: true, difficultyScore: true, tags: topicTagSelect },
  });
  return question
    ? { subjectId: question.subjectId, difficultyScore: question.difficultyScore, topicTagIds: question.tags.map(({ tagId }) => tagId) }
    : null;
}

// Record one graded result (automatic grading or a completed self-assessment)
// in the per-learner subject and topic aggregates. Callers run this inside the
// same transaction that grades the attempt, so aggregates never drift.
export async function recordGradedResult(
  transaction: Prisma.TransactionClient,
  input: { learnerId: string; scope: GradedQuestionScope; isCorrect: boolean; at: Date },
) {
  const correct = input.isCorrect ? 1 : 0;
  const key = { learnerId: input.learnerId, subjectId: input.scope.subjectId };
  const current = await transaction.learnerSubjectStat.findUnique({
    where: { learnerId_subjectId: key },
    select: { attempts: true, rating: true },
  });
  const rating = nextRating(current?.rating ?? INITIAL_RATING, input.scope.difficultyScore, input.isCorrect, current?.attempts ?? 0);
  await transaction.learnerSubjectStat.upsert({
    where: { learnerId_subjectId: key },
    create: { ...key, attempts: 1, correct, rating, lastAttemptAt: input.at },
    update: { attempts: { increment: 1 }, correct: { increment: correct }, rating, lastAttemptAt: input.at },
  });
  for (const tagId of input.scope.topicTagIds) {
    await transaction.learnerTopicStat.upsert({
      where: { learnerId_subjectId_tagId: { learnerId: input.learnerId, subjectId: input.scope.subjectId, tagId } },
      create: { learnerId: input.learnerId, subjectId: input.scope.subjectId, tagId, attempts: 1, correct, lastAttemptAt: input.at },
      update: { attempts: { increment: 1 }, correct: { increment: correct }, lastAttemptAt: input.at },
    });
  }
}
