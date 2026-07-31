import { NextRequest, NextResponse } from "next/server";
import { apiError, apiHandler, enforceRateLimit } from "@/lib/api";
import { QUESTION_TYPE_LABELS } from "@/lib/content";
import { parseQuestionFilters, questionWhere } from "@/lib/question-filters";
import { prisma } from "@/lib/prisma";
import { weakestTopic } from "@/lib/recommendation";
import { findLearnerForRequest } from "@/lib/learner-identity";

export const dynamic = "force-dynamic";

async function getNextQuestion(request: NextRequest) {
  const filters = parseQuestionFilters(request.nextUrl.searchParams);
  if (!filters) return apiError("Invalid question filters", 400, "INVALID_REQUEST");
  const { excluded, mode, tagFilters } = filters;
  const limited = await enforceRateLimit(request, "questions", { addressLimit: 120 });
  if (limited) return limited;
  const baseWhere = questionWhere(filters);
  const learner = await findLearnerForRequest(request);
  let recommendationReason: string | null = null;
  let preferredQuestionId: string | null = null;

  if (learner && (mode === "review" || mode === "adaptive")) {
    const due = await prisma.reviewItem.findMany({
      where: {
        learnerId: learner.id,
        status: "ACTIVE",
        dueAt: { lte: new Date() },
        question: {
          ...baseWhere,
          ...(excluded.length ? { id: { notIn: excluded } } : {}),
        },
      },
      orderBy: { dueAt: "asc" },
      take: 12,
      select: { questionId: true },
    });
    if (due.length) {
      preferredQuestionId = due[Math.floor(Math.random() * Math.min(due.length, 4))].questionId;
      recommendationReason = "复习一题到期的薄弱知识";
    }
  }

  if (learner && mode === "adaptive" && !preferredQuestionId && !tagFilters.length) {
    const recentTopicAttempts = await prisma.practiceAttempt.findMany({
      where: { learnerId: learner.id, isCorrect: { not: null }, question: baseWhere },
      orderBy: { createdAt: "desc" },
      take: 120,
      select: {
        isCorrect: true,
        secondsSpent: true,
        question: { select: { tags: {
          where: { tag: { dimension: { key: "TOPIC" } } },
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
      baseWhere.tags = { some: { tag: { slug: topic.slug, dimension: { key: "TOPIC" } } } };
      recommendationReason = `结合最近正确率和答题用时，重点巩固${topic.label}`;
    }
  }

  if (learner && mode === "adaptive" && !preferredQuestionId && !recommendationReason && !filters.subject) {
    const recentAttempts = await prisma.practiceAttempt.findMany({
      where: { learnerId: learner.id, isCorrect: { not: null } },
      orderBy: { createdAt: "desc" },
      take: 100,
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
      .filter(([, result]) => result.attempts >= 3)
      .sort((left, right) => left[1].correct / left[1].attempts - right[1].correct / right[1].attempts)[0];
    if (weakest) {
      baseWhere.subject = { slug: weakest[0] };
      recommendationReason = `根据最近表现，继续巩固${weakest[1].name}`;
    }
  }

  let where = preferredQuestionId
    ? { ...baseWhere, id: preferredQuestionId }
    : excluded.length ? { ...baseWhere, id: { notIn: excluded } } : baseWhere;
  let count = await prisma.question.count({ where });
  if (!count && excluded.length && !preferredQuestionId) {
    where = baseWhere;
    count = await prisma.question.count({ where });
  }
  if (!count) return apiError("No matching questions", 404, "NOT_FOUND");
  const question = await prisma.question.findFirst({
    where, skip: Math.floor(Math.random() * count),
    include: {
      subject: { select: { name: true, slug: true, color: true } },
      grade: { select: { name: true } },
      options: { orderBy: { sortOrder: "asc" } },
      assets: { where: { reviewStatus: "APPROVED" }, select: { role: true, path: true, altText: true } },
      tags: { include: { tag: { include: { dimension: true } } } },
    },
  });
  if (!question) return apiError("No matching questions", 404, "NOT_FOUND");
  const assetsByRole = new Map(question.assets.map((asset) => [asset.role, asset]));
  const stemAsset = assetsByRole.get("STEM");
  const saved = learner ? Boolean(await prisma.savedQuestion.findUnique({
    where: { learnerId_questionId: { learnerId: learner.id, questionId: question.id } },
    select: { questionId: true },
  })) : false;
  return NextResponse.json({
    id: question.id, stem: question.stem, type: question.type, typeLabel: QUESTION_TYPE_LABELS[question.type] ?? question.sourceType,
    difficulty: question.difficulty, isAutoGradable: question.isAutoGradable, hasHint: true, subject: question.subject, grade: question.grade.name,
    stemAsset: stemAsset ? { path: stemAsset.path, altText: stemAsset.altText } : null,
    options: question.options.map(({ label, content }) => {
      const asset = assetsByRole.get(`OPTION_${label}`);
      return { label, content, asset: asset ? { path: asset.path, altText: asset.altText } : null };
    }),
    tags: question.tags.map(({ tag }) => ({ dimension: tag.dimension.key, slug: tag.slug, label: tag.label })),
    isSaved: saved,
    recommendationReason,
  });
}

export const GET = apiHandler("GET /api/questions/next", getNextQuestion);
