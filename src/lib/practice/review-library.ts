import type { ReviewPayload, ReviewQuestionCard } from "@/lib/contracts/practice";
import { QUESTION_STATUS, REVIEW_ITEM_STATUS, TAG_DIMENSION } from "@/lib/domain-constants";
import { prisma } from "@/lib/prisma";

const REVIEW_LIST_LIMIT = 50;

const questionInclude = {
  subject: { select: { slug: true, name: true, color: true } },
  grade: { select: { name: true } },
  tags: {
    where: { tag: { dimension: { key: TAG_DIMENSION.TOPIC } } },
    include: { tag: true },
    take: 2,
  },
} as const;

function questionCard(question: {
  id: string;
  stem: string;
  type: string;
  difficulty: string;
  subject: { slug: string; name: string; color: string };
  grade: { name: string };
  tags: Array<{ tag: { slug: string; label: string } }>;
}): ReviewQuestionCard {
  return {
    id: question.id,
    stem: question.stem,
    type: question.type,
    difficulty: question.difficulty,
    subject: question.subject,
    grade: question.grade.name,
    tags: question.tags.map(({ tag }) => ({ slug: tag.slug, label: tag.label })),
  };
}

export async function reviewLibrary(learnerId: string | null): Promise<ReviewPayload> {
  if (!learnerId) return { dueCount: 0, activeCount: 0, savedCount: 0, reviews: [], saved: [] };
  const now = new Date();
  const published = { status: QUESTION_STATUS.PUBLISHED };
  const [reviews, saved, dueCount, activeCount, savedCount] = await Promise.all([
    prisma.reviewItem.findMany({
      where: { learnerId, status: REVIEW_ITEM_STATUS.ACTIVE, question: published },
      orderBy: [{ dueAt: "asc" }, { updatedAt: "desc" }],
      take: REVIEW_LIST_LIMIT,
      include: { question: { include: {
        ...questionInclude,
        savedBy: { where: { learnerId }, take: 1, select: { questionId: true } },
      } } },
    }),
    prisma.savedQuestion.findMany({
      where: { learnerId, question: published },
      orderBy: { createdAt: "desc" },
      take: REVIEW_LIST_LIMIT,
      include: { question: { include: {
        ...questionInclude,
        reviewItems: {
          where: { learnerId, status: REVIEW_ITEM_STATUS.ACTIVE },
          take: 1,
          select: { dueAt: true },
        },
      } } },
    }),
    prisma.reviewItem.count({ where: { learnerId, status: REVIEW_ITEM_STATUS.ACTIVE, dueAt: { lte: now }, question: published } }),
    prisma.reviewItem.count({ where: { learnerId, status: REVIEW_ITEM_STATUS.ACTIVE, question: published } }),
    prisma.savedQuestion.count({ where: { learnerId, question: published } }),
  ]);

  return {
    dueCount,
    activeCount,
    savedCount,
    reviews: reviews.map((item) => ({
      ...questionCard(item.question),
      dueAt: item.dueAt.toISOString(),
      isDue: item.dueAt <= now,
      intervalDays: item.intervalDays,
      repetitions: item.repetitions,
      lastResult: item.lastResult,
      isSaved: item.question.savedBy.length > 0,
    })),
    saved: saved.map((item) => ({
      ...questionCard(item.question),
      savedAt: item.createdAt.toISOString(),
      isInReview: item.question.reviewItems.length > 0,
      reviewIsDue: Boolean(item.question.reviewItems[0]?.dueAt && item.question.reviewItems[0].dueAt <= now),
    })),
  };
}

export async function isPublishedQuestion(questionId: string) {
  return Boolean(await prisma.question.findFirst({
    where: { id: questionId, status: QUESTION_STATUS.PUBLISHED },
    select: { id: true },
  }));
}

export async function setSavedQuestion(learnerId: string, questionId: string, saved: boolean) {
  if (saved) {
    await prisma.savedQuestion.upsert({
      where: { learnerId_questionId: { learnerId, questionId } },
      create: { learnerId, questionId },
      update: {},
    });
  } else {
    await prisma.savedQuestion.deleteMany({ where: { learnerId, questionId } });
  }
}

export async function dismissReviewItem(learnerId: string, questionId: string) {
  const updated = await prisma.reviewItem.updateMany({
    where: {
      learnerId,
      questionId,
      status: REVIEW_ITEM_STATUS.ACTIVE,
      question: { status: QUESTION_STATUS.PUBLISHED },
    },
    data: { status: REVIEW_ITEM_STATUS.DISMISSED },
  });
  return updated.count > 0;
}

export async function createQuestionReport(
  learnerId: string,
  input: { questionId: string; category: string; detail?: string },
) {
  return prisma.questionReport.create({
    data: {
      learnerId,
      questionId: input.questionId,
      category: input.category,
      detail: input.detail || null,
    },
    select: { id: true, status: true },
  });
}
