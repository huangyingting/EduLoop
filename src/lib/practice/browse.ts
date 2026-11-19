import type { Prisma } from "@prisma/client";
import type { BrowsePayload } from "@/lib/contracts/practice";
import { prisma } from "@/lib/prisma";
import { questionWhere, type QuestionFilters } from "@/lib/question-filters";

export const BROWSE_PAGE_SIZE = 20;
const STEM_EXCERPT_LENGTH = 140;

// A paginated, answer-free list for finding a specific question or reading a
// contest paper in order. Answers and explanations are never included.
export async function browseQuestions(
  filters: QuestionFilters,
  learnerId: string,
  page: number,
  paperKey?: string,
): Promise<BrowsePayload> {
  const where: Prisma.QuestionWhereInput = paperKey
    ? { AND: [questionWhere(filters), { contestSlots: { some: { paperKey } } }] }
    : questionWhere(filters);
  const [total, questions] = await Promise.all([
    prisma.question.count({ where }),
    prisma.question.findMany({
      where,
      orderBy: paperKey ? undefined : [{ subjectId: "asc" }, { gradeId: "asc" }, { id: "asc" }],
      skip: paperKey ? undefined : (page - 1) * BROWSE_PAGE_SIZE,
      take: paperKey ? undefined : BROWSE_PAGE_SIZE,
      select: {
        id: true, stem: true, difficulty: true, type: true,
        subject: { select: { slug: true, name: true, color: true } },
        grade: { select: { name: true } },
        contestSlots: paperKey ? { where: { paperKey }, select: { problemNumber: true } } : false,
        attempts: { where: { learnerId }, orderBy: { createdAt: "desc" }, select: { isCorrect: true } },
      },
    }),
  ]);
  const items = questions.map((question) => ({
    id: question.id,
    stem: question.stem.length > STEM_EXCERPT_LENGTH ? `${question.stem.slice(0, STEM_EXCERPT_LENGTH)}…` : question.stem,
    subject: question.subject,
    grade: question.grade.name,
    difficulty: question.difficulty,
    type: question.type,
    problemNumber: question.contestSlots?.[0]?.problemNumber ?? null,
    attempts: question.attempts.length,
    lastResult: question.attempts[0]?.isCorrect ?? null,
  }));
  // A paper is short and read in problem order.
  if (paperKey) items.sort((left, right) => (left.problemNumber ?? 0) - (right.problemNumber ?? 0));
  return { page: paperKey ? 1 : page, pageSize: paperKey ? items.length : BROWSE_PAGE_SIZE, total, items };
}
