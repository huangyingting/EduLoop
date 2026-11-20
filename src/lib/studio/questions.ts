import type { Prisma } from "@prisma/client";
import { TAG_DIMENSION } from "@/lib/domain-constants";
import { prisma } from "@/lib/prisma";

const SEARCH_LIMIT = 20;

// Operators find a question by exact ID or by text in its stem.
export async function searchStudioQuestions(query: string, subjectSlug?: string) {
  const text = query.trim();
  const where: Prisma.QuestionWhereInput = {
    ...(subjectSlug ? { subject: { slug: subjectSlug } } : {}),
    ...(text ? { OR: [{ id: text }, { stem: { contains: text } }] } : {}),
  };
  const questions = await prisma.question.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    take: SEARCH_LIMIT,
    select: {
      id: true, stem: true, status: true, type: true, revisionId: true,
      subject: { select: { name: true } }, grade: { select: { name: true } },
      _count: { select: { revisions: true } },
    },
  });
  return questions.map((question) => ({
    id: question.id,
    stem: question.stem.slice(0, 160),
    status: question.status,
    type: question.type,
    subject: question.subject.name,
    grade: question.grade.name,
    edited: Boolean(question.revisionId),
    revisions: question._count.revisions,
  }));
}

export async function studioQuestionDetail(questionId: string) {
  const question = await prisma.question.findUnique({
    where: { id: questionId },
    include: {
      subject: { select: { id: true, name: true, slug: true } },
      grade: { select: { name: true } },
      options: { orderBy: { sortOrder: "asc" }, select: { label: true, content: true } },
      tags: { where: { tag: { dimension: { key: TAG_DIMENSION.TOPIC } } }, select: { source: true, tag: { select: { id: true, slug: true, label: true } } } },
      hints: { orderBy: [{ position: "asc" }, { createdAt: "asc" }], select: { id: true, content: true, source: true, reviewStatus: true, position: true } },
      assets: { orderBy: { role: "asc" }, select: { id: true, role: true, path: true, altText: true, source: true, reviewStatus: true } },
      revisions: {
        orderBy: { createdAt: "desc" },
        take: 20,
        select: {
          id: true, status: true, reason: true, reviewNote: true, createdAt: true, reviewedAt: true,
          stem: true, optionsJson: true, answer: true, correctAnswer: true, explanation: true, topicTagIdsJson: true,
          author: { select: { name: true, email: true } }, reviewer: { select: { name: true, email: true } },
        },
      },
    },
  });
  if (!question) return null;
  // Topic choices are the topics already used within this subject.
  const topics = await prisma.tag.findMany({
    where: { dimension: { key: TAG_DIMENSION.TOPIC }, questions: { some: { question: { subjectId: question.subject.id } } } },
    orderBy: { label: "asc" },
    select: { id: true, slug: true, label: true },
  });
  const operatorName = (user: { name: string | null; email: string } | null) => user ? user.name || user.email : null;
  return {
    id: question.id,
    status: question.status,
    importStatus: question.importStatus,
    type: question.type,
    subject: question.subject.name,
    grade: question.grade.name,
    sourceFile: question.sourceFile,
    stem: question.stem,
    options: question.options,
    answer: question.answer,
    correctLabels: question.correctAnswer ? JSON.parse(question.correctAnswer) as string[] : [],
    explanation: question.explanation,
    topicTags: question.tags.map(({ tag, source }) => ({ ...tag, source })),
    availableTopics: topics,
    hints: question.hints,
    assets: question.assets,
    revisionId: question.revisionId,
    revisions: question.revisions.map((revision) => ({
      id: revision.id,
      status: revision.status,
      reason: revision.reason,
      reviewNote: revision.reviewNote,
      createdAt: revision.createdAt.toISOString(),
      reviewedAt: revision.reviewedAt?.toISOString() ?? null,
      author: operatorName(revision.author),
      reviewer: operatorName(revision.reviewer),
      stem: revision.stem,
      options: JSON.parse(revision.optionsJson) as Array<{ label: string; content: string }>,
      answer: revision.answer,
      correctLabels: revision.correctAnswer ? JSON.parse(revision.correctAnswer) as string[] : [],
      explanation: revision.explanation,
      topicTagIds: revision.topicTagIdsJson ? JSON.parse(revision.topicTagIdsJson) as string[] : null,
    })),
  };
}

export type StudioQuestionDetail = NonNullable<Awaited<ReturnType<typeof studioQuestionDetail>>>;
