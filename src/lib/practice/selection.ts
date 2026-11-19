import type { Prisma } from "@prisma/client";
import { QUESTION_TYPE_LABELS } from "@/lib/question-labels";
import type { QuestionHistoryPayload, QuestionHistorySummary, QuestionPayload } from "@/lib/contracts/practice";
import { ASSET_REVIEW_STATUS, REVIEW_ITEM_STATUS, TAG_DIMENSION } from "@/lib/domain-constants";
import { prisma } from "@/lib/prisma";
import { issueQuestionTicket } from "@/lib/question-ticket";
import { questionWhere, type QuestionFilters } from "@/lib/question-filters";
import { weakestTopic } from "@/lib/recommendation";
import { MINIMUM_RATED_ATTEMPTS, targetDifficultyWindow } from "./ability";
import { approvedHintWhere } from "./question-hints";

const DUE_REVIEW_CANDIDATES = 12;
const DUE_REVIEW_PICK_FROM = 4;
const TOPIC_EVIDENCE_ATTEMPTS = 120;
const SUBJECT_EVIDENCE_ATTEMPTS = 100;
const MINIMUM_SUBJECT_ATTEMPTS = 3;

type Recommendation = {
  where: Prisma.QuestionWhereInput;
  preferredQuestionId: string | null;
  reason: string | null;
  subjectSlug?: string | null;
};

type DifficultyWindow = { min: number; max: number };

// The learner's ability for the scope being practiced, as a difficulty window.
// Null until there is enough graded evidence for the rating to mean anything.
async function abilityWindow(learnerId: string, subjectSlug: string | null | undefined): Promise<DifficultyWindow | null> {
  const stats = await prisma.learnerSubjectStat.findMany({
    where: { learnerId, ...(subjectSlug ? { subject: { slug: subjectSlug } } : {}) },
    select: { rating: true, attempts: true },
  });
  const attempts = stats.reduce((total, stat) => total + stat.attempts, 0);
  if (attempts < MINIMUM_RATED_ATTEMPTS) return null;
  const rating = stats.reduce((total, stat) => total + stat.rating * stat.attempts, 0) / attempts;
  return targetDifficultyWindow(rating);
}

async function recommend(filters: QuestionFilters, learnerId: string | null): Promise<Recommendation> {
  const { excluded, mode, tagFilters } = filters;
  const where = questionWhere(filters);
  if (!learnerId) return { where, preferredQuestionId: null, reason: null };

  if (mode === "review" || mode === "adaptive") {
    // Due learning reviews come first; due long-term checks of mastered items
    // fill in only when nothing is still being learned.
    for (const [status, reason] of [
      [REVIEW_ITEM_STATUS.ACTIVE, "复习一题到期的薄弱知识"],
      [REVIEW_ITEM_STATUS.MASTERED, "长期巩固：回顾一道已经掌握的题"],
    ] as const) {
      const due = await prisma.reviewItem.findMany({
        where: {
          learnerId,
          status,
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
          reason,
        };
      }
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
        subjectSlug: filters.subject,
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
        subjectSlug: weakest[0],
      };
    }
  }
  return { where, preferredQuestionId: null, reason: null, subjectSlug: filters.subject };
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

async function pickQuestionId(
  recommendation: Recommendation,
  excluded: string[],
  learnerId: string | null,
  difficultyWindow: DifficultyWindow | null,
) {
  const { where, preferredQuestionId } = recommendation;
  if (preferredQuestionId) {
    const preferred = await prisma.question.findFirst({ where: { AND: [where, { id: preferredQuestionId }] }, select: { id: true } });
    return { id: preferred?.id ?? null, targeted: false };
  }
  // AND keeps a targeted questionId filter from being replaced by exclusions.
  const notExcluded: Prisma.QuestionWhereInput = excluded.length ? { id: { notIn: excluded } } : {};
  // Signed-in learners see questions they have never attempted first, then
  // questions still in active review, and only then repeats.
  const tiers: Prisma.QuestionWhereInput[] = learnerId ? [
    { attempts: { none: { learnerId } } },
    { reviewItems: { some: { learnerId, status: REVIEW_ITEM_STATUS.ACTIVE } } },
  ] : [];
  const windows: Array<Prisma.QuestionWhereInput | null> = difficultyWindow
    ? [{ difficultyScore: { gte: difficultyWindow.min, lte: difficultyWindow.max } }, null]
    : [null];
  for (const window of windows) {
    for (const tier of tiers) {
      const id = await randomQuestionId({ AND: [where, tier, notExcluded, window ?? {}] });
      if (id) return { id, targeted: window !== null };
    }
  }
  if (excluded.length) {
    const fresh = await randomQuestionId({ AND: [where, notExcluded] });
    if (fresh) return { id: fresh, targeted: false };
  }
  return { id: await randomQuestionId(where), targeted: false };
}

const HISTORY_LIMIT = 50;

export async function questionHistorySummary(learnerId: string, questionId: string): Promise<QuestionHistorySummary | null> {
  const attempts = await prisma.practiceAttempt.findMany({
    where: { learnerId, questionId },
    orderBy: { createdAt: "desc" },
    take: HISTORY_LIMIT,
    select: { isCorrect: true, createdAt: true },
  });
  if (!attempts.length) return null;
  return {
    attempts: attempts.length,
    correct: attempts.filter(({ isCorrect }) => isCorrect).length,
    lastResult: attempts[0].isCorrect,
    lastAttemptAt: attempts[0].createdAt.toISOString(),
  };
}

export async function questionHistory(learnerId: string, questionId: string): Promise<QuestionHistoryPayload> {
  const attempts = await prisma.practiceAttempt.findMany({
    where: { learnerId, questionId },
    orderBy: { createdAt: "desc" },
    take: HISTORY_LIMIT,
    select: { createdAt: true, isCorrect: true, response: true, secondsSpent: true, hintsUsed: true },
  });
  return {
    attempts: attempts.map((attempt) => ({
      createdAt: attempt.createdAt.toISOString(),
      isCorrect: attempt.isCorrect,
      response: JSON.parse(attempt.response) as string | string[],
      secondsSpent: attempt.secondsSpent,
      hintsUsed: attempt.hintsUsed,
    })),
  };
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
      _count: { select: { hints: { where: approvedHintWhere } } },
    },
  });
  if (!question) return null;
  const assetsByRole = new Map(question.assets.map((asset) => [asset.role, asset]));
  const stemAsset = assetsByRole.get("STEM");
  const [savedRow, history] = learnerId ? await Promise.all([
    prisma.savedQuestion.findUnique({
      where: { learnerId_questionId: { learnerId, questionId: question.id } },
      select: { questionId: true },
    }),
    questionHistorySummary(learnerId, question.id),
  ]) : [null, null];
  const saved = Boolean(savedRow);
  return {
    id: question.id,
    stem: question.stem,
    type: question.type,
    typeLabel: QUESTION_TYPE_LABELS[question.type] ?? question.sourceType,
    difficulty: question.difficulty,
    isAutoGradable: question.isAutoGradable,
    hasHint: question._count.hints > 0,
    hintCount: question._count.hints,
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
    history,
    ticket: issueQuestionTicket(question.id),
  };
}

export async function selectNextQuestion(filters: QuestionFilters, learnerId: string | null) {
  const recommendation = await recommend(filters, learnerId);
  // Difficulty targeting applies in adaptive mode unless the learner chose a
  // difficulty explicitly.
  const window = learnerId && filters.mode === "adaptive" && !filters.difficulty && !recommendation.preferredQuestionId
    ? await abilityWindow(learnerId, recommendation.subjectSlug)
    : null;
  const picked = await pickQuestionId(recommendation, filters.excluded, learnerId, window);
  if (!picked.id) return null;
  const reason = picked.targeted
    ? `${recommendation.reason ?? "智能练习"}，难度贴近你目前的水平`
    : recommendation.reason;
  return loadQuestionPayload(picked.id, learnerId, reason);
}
