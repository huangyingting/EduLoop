import type { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/api";
import { QUESTION_TYPE_LABELS } from "@/lib/content";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const mode = params.get("mode");
  const deviceKey = params.get("deviceKey");
  const limited = enforceRateLimit(request, "questions", deviceKey || "anonymous", 120);
  if (limited) return limited;
  const excluded = (params.get("exclude") ?? "").split(",").filter(Boolean).slice(0, 20);
  const tagSlugs = (params.get("tags") ?? "").split(",").filter(Boolean).slice(0, 8);
  const baseWhere: Prisma.QuestionWhereInput = {
    status: "PUBLISHED",
    ...(params.get("subject") ? { subject: { slug: params.get("subject")! } } : {}),
    ...(params.get("gradeBand") ? { gradeBand: { slug: params.get("gradeBand")! } } : {}),
    ...(params.get("grade") ? { grade: { slug: params.get("grade")! } } : {}),
    ...(params.get("difficulty") ? { difficulty: params.get("difficulty")! } : {}),
    ...(params.get("type") ? { type: params.get("type")! } : {}),
    ...(params.get("autoGradable") === "true" ? { isAutoGradable: true } : {}),
    ...(tagSlugs.length ? { tags: { some: { tag: { slug: { in: tagSlugs } } } } } : {}),
  };
  const learner = deviceKey && deviceKey.length >= 8 ? await prisma.learnerProfile.findUnique({
    where: { deviceKey }, select: { id: true },
  }) : null;
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

  if (learner && mode === "adaptive" && !preferredQuestionId && !params.get("subject")) {
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

  let where: Prisma.QuestionWhereInput = preferredQuestionId
    ? { ...baseWhere, id: preferredQuestionId }
    : excluded.length ? { ...baseWhere, id: { notIn: excluded } } : baseWhere;
  let count = await prisma.question.count({ where });
  if (!count && excluded.length && !preferredQuestionId) {
    where = baseWhere;
    count = await prisma.question.count({ where });
  }
  if (!count) return NextResponse.json({ error: "No matching questions" }, { status: 404 });
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
  if (!question) return NextResponse.json({ error: "No matching questions" }, { status: 404 });
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
