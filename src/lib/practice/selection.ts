import type { Prisma } from "@prisma/client";
import { QUESTION_TYPE_LABELS } from "@/lib/question-labels";
import type { QuestionPayload } from "@/lib/contracts/practice";
import { ASSET_REVIEW_STATUS, REVIEW_ITEM_STATUS, TAG_DIMENSION } from "@/lib/domain-constants";
import { prisma } from "@/lib/prisma";
import { questionWhere, type QuestionFilters } from "@/lib/question-filters";
import { weakestTopic } from "@/lib/recommendation";

const DUE_REVIEW_CANDIDATES = 12;
const DUE_REVIEW_PICK_FROM = 4;
const TOPIC_EVIDENCE_ATTEMPTS = 120;
const SUBJECT_EVIDENCE_ATTEMPTS = 100;
const MINIMUM_SUBJECT_ATTEMPTS = 3;

type Recommendation = {
  where: Prisma.QuestionWhereInput;
  preferredQuestionId: string | null;
  reason: string | null;
};

async function recommend(filters: QuestionFilters, learnerId: string | null): Promise<Recommendation> {
  const { excluded, mode, tagFilters } = filters;
  const where = questionWhere(filters);
  if (!learnerId) return { where, preferredQuestionId: null, reason: null };

  if (mode === "review" || mode === "adaptive") {
    const due = await prisma.reviewItem.findMany({
      where: {
        learnerId,
        status: REVIEW_ITEM_STATUS.ACTIVE,
        dueAt: { lte: new Date() },
        question: excluded.length ? { AND: [where, { id: { notIn: excluded } }] } : where,
      },
      orderBy: { dueAt: "asc" },
      take: DUE_REVIEW_CANDIDATES,
      select: { questionId: true },
    });
    if (due.length) {
      return {
        where,
        preferredQuestionId: due[Math.floor(Math.random() * Math.min(due.length, DUE_REVIEW_PICK_FROM))].questionId,
        reason: "复习一题到期的薄弱知识",
      };
    }
  }
  if (mode !== "adaptive") return { where, preferredQuestionId: null, reason: null };

  if (!tagFilters.length) {
    const recentTopicAttempts = await prisma.practiceAttempt.findMany({
      where: { learnerId, isCorrect: { not: null }, question: where },
      orderBy: { createdAt: "desc" },
      take: TOPIC_EVIDENCE_ATTEMPTS,
      select: {
        isCorrect: true,
        secondsSpent: true,
        question: { select: { tags: {
          where: { tag: { dimension: { key: TAG_DIMENSION.TOPIC } } },
          select: { tag: { select: { slug: true, label: true } } },
        } } },
      },
    });
    const topic = weakestTopic(recentTopicAttempts.flatMap((attempt) => attempt.question.tags.map(({ tag }) => ({
      slug: tag.slug,
      label: tag.label,
      isCorrect: Boolean(attempt.isCorrect),
      secondsSpent: attempt.secondsSpent,
    }))));
    if (topic) {
      return {
        where: { ...where, tags: { some: { tag: { slug: topic.slug, dimension: { key: TAG_DIMENSION.TOPIC } } } } },
        preferredQuestionId: null,
        reason: `结合最近正确率和答题用时，重点巩固${topic.label}`,
      };
    }
  }

  if (!filters.subject) {
    const recentAttempts = await prisma.practiceAttempt.findMany({
      where: { learnerId, isCorrect: { not: null } },
      orderBy: { createdAt: "desc" },
      take: SUBJECT_EVIDENCE_ATTEMPTS,
      select: { isCorrect: true, question: { select: { subject: { select: { slug: true, name: true } } } } },
    });
    const subjectResults = new Map<string, { name: string; attempts: number; correct: number }>();
    for (const attempt of recentAttempts) {
      const subject = attempt.question.subject;
      const current = subjectResults.get(subject.slug) ?? { name: subject.name, attempts: 0, correct: 0 };
      current.attempts += 1;
      current.correct += attempt.isCorrect ? 1 : 0;
      subjectResults.set(subject.slug, current);
    }
    const weakest = [...subjectResults.entries()]
      .filter(([, result]) => result.attempts >= MINIMUM_SUBJECT_ATTEMPTS)
      .sort((left, right) => left[1].correct / left[1].attempts - right[1].correct / right[1].attempts)[0];
    if (weakest) {
      return {
        where: { ...where, subject: { slug: weakest[0] } },
        preferredQuestionId: null,
        reason: `根据最近表现，继续巩固${weakest[1].name}`,
      };
    }
  }
  return { where, preferredQuestionId: null, reason: null };
}

// Pick a uniformly placed random key and take the first matching question at
// or after it, wrapping to the start of the key range. Both lookups use the
// (status, randomKey) index instead of COUNT(*) plus a large OFFSET scan.
async function randomQuestionId(where: Prisma.QuestionWhereInput, random = Math.random()) {
  const after = await prisma.question.findFirst({
    where: { AND: [where, { randomKey: { gte: random } }] },
    orderBy: { randomKey: "asc" },
    select: { id: true },
  });
  if (after) return after.id;
  const wrapped = await prisma.question.findFirst({
    where: { AND: [where, { randomKey: { lt: random } }] },
    orderBy: { randomKey: "asc" },
    select: { id: true },
  });
  return wrapped?.id ?? null;
}

async function pickQuestionId(recommendation: Recommendation, excluded: string[]) {
  const { where, preferredQuestionId } = recommendation;
  if (preferredQuestionId) {
    const preferred = await prisma.question.findFirst({ where: { AND: [where, { id: preferredQuestionId }] }, select: { id: true } });
    return preferred?.id ?? null;
  }
  if (excluded.length) {
    // AND keeps a targeted questionId filter from being replaced by exclusions.
    const fresh = await randomQuestionId({ AND: [where, { id: { notIn: excluded } }] });
    if (fresh) return fresh;
  }
  return randomQuestionId(where);
}

export async function loadQuestionPayload(
  questionId: string,
  learnerId: string | null,
  recommendationReason: string | null = null,
): Promise<QuestionPayload | null> {
  const question = await prisma.question.findUnique({
    where: { id: questionId },
    include: {
      subject: { select: { name: true, slug: true, color: true } },
      grade: { select: { name: true } },
      options: { orderBy: { sortOrder: "asc" } },
      assets: { where: { reviewStatus: ASSET_REVIEW_STATUS.APPROVED }, select: { role: true, path: true, altText: true } },
      tags: { include: { tag: { include: { dimension: true } } } },
    },
  });
  if (!question) return null;
  const assetsByRole = new Map(question.assets.map((asset) => [asset.role, asset]));
  const stemAsset = assetsByRole.get("STEM");
  const saved = learnerId ? Boolean(await prisma.savedQuestion.findUnique({
    where: { learnerId_questionId: { learnerId, questionId: question.id } },
    select: { questionId: true },
  })) : false;
  return {
    id: question.id,
    stem: question.stem,
    type: question.type,
    typeLabel: QUESTION_TYPE_LABELS[question.type] ?? question.sourceType,
    difficulty: question.difficulty,
    isAutoGradable: question.isAutoGradable,
    hasHint: true,
    subject: question.subject,
    grade: question.grade.name,
    stemAsset: stemAsset ? { path: stemAsset.path, altText: stemAsset.altText } : null,
    options: question.options.map(({ label, content }) => {
      const asset = assetsByRole.get(`OPTION_${label}`);
      return { label, content, asset: asset ? { path: asset.path, altText: asset.altText } : null };
    }),
    tags: question.tags.map(({ tag }) => ({ dimension: tag.dimension.key, slug: tag.slug, label: tag.label })),
    isSaved: saved,
    recommendationReason,
  };
}

export async function selectNextQuestion(filters: QuestionFilters, learnerId: string | null) {
  const recommendation = await recommend(filters, learnerId);
  const questionId = await pickQuestionId(recommendation, filters.excluded);
  if (!questionId) return null;
  return loadQuestionPayload(questionId, learnerId, recommendation.reason);
}
