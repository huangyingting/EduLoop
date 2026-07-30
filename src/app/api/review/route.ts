import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiError, apiHandler, enforceRateLimit } from "@/lib/api";
import { getSessionUser } from "@/lib/auth";
import { isSameOriginRequest } from "@/lib/auth-validation";
import { prisma } from "@/lib/prisma";
import { findLearnerForRequest } from "@/lib/learner-identity";

export const dynamic = "force-dynamic";

const querySchema = z.object({});
const saveSchema = z.object({
  questionId: z.string().min(8).max(100),
  saved: z.boolean(),
});

const questionInclude = {
  subject: { select: { slug: true, name: true, color: true } },
  grade: { select: { name: true } },
  tags: {
    where: { tag: { dimension: { key: "TOPIC" } } },
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
}) {
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

async function getReview(request: NextRequest) {
  if (!await getSessionUser(request)) return apiError("请先登录。", 401, "UNAUTHORIZED");
  const parsed = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) return apiError("Invalid review query", 400, "INVALID_REQUEST");
  const learner = await findLearnerForRequest(request);
  if (!learner) return apiError("请先登录。", 401, "UNAUTHORIZED");

  const now = new Date();
  const [reviews, saved, dueCount, activeCount, savedCount] = await Promise.all([
    prisma.reviewItem.findMany({
      where: { learnerId: learner.id, status: "ACTIVE", question: { status: "PUBLISHED" } },
      orderBy: [{ dueAt: "asc" }, { updatedAt: "desc" }],
      take: 50,
      include: { question: { include: questionInclude } },
    }),
    prisma.savedQuestion.findMany({
      where: { learnerId: learner.id, question: { status: "PUBLISHED" } },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { question: { include: questionInclude } },
    }),
    prisma.reviewItem.count({ where: { learnerId: learner.id, status: "ACTIVE", dueAt: { lte: now }, question: { status: "PUBLISHED" } } }),
    prisma.reviewItem.count({ where: { learnerId: learner.id, status: "ACTIVE", question: { status: "PUBLISHED" } } }),
    prisma.savedQuestion.count({ where: { learnerId: learner.id, question: { status: "PUBLISHED" } } }),
  ]);

  return NextResponse.json({
    dueCount,
    activeCount,
    savedCount,
    reviews: reviews.map((item) => ({
      ...questionCard(item.question),
      dueAt: item.dueAt,
      isDue: item.dueAt <= now,
      intervalDays: item.intervalDays,
      repetitions: item.repetitions,
      lastResult: item.lastResult,
    })),
    saved: saved.map((item) => ({ ...questionCard(item.question), savedAt: item.createdAt })),
  });
}

async function postSavedQuestion(request: Request) {
  if (!isSameOriginRequest(request)) return apiError("Invalid request origin.", 403, "FORBIDDEN");
  const user = await getSessionUser(request);
  if (!user) return apiError("请先登录。", 401, "UNAUTHORIZED");
  const body = await request.json().catch(() => null);
  const parsed = saveSchema.safeParse(body);
  if (!parsed.success) return apiError("Invalid saved question", 400, "INVALID_REQUEST");
  const input = parsed.data;
  const limited = enforceRateLimit(request, "saved-questions", user.id, 30);
  if (limited) return limited;
  const question = await prisma.question.findFirst({ where: { id: input.questionId, status: "PUBLISHED" }, select: { id: true } });
  if (!question) return apiError("Question not found", 404, "NOT_FOUND");
  const learner = await findLearnerForRequest(request);
  if (!learner) return apiError("请先登录。", 401, "UNAUTHORIZED");

  if (input.saved) {
    await prisma.savedQuestion.upsert({
      where: { learnerId_questionId: { learnerId: learner.id, questionId: question.id } },
      create: { learnerId: learner.id, questionId: question.id },
      update: {},
    });
  } else {
    await prisma.savedQuestion.deleteMany({ where: { learnerId: learner.id, questionId: question.id } });
  }
  return NextResponse.json({ saved: input.saved });
}

export const GET = apiHandler("GET /api/review", getReview);
export const POST = apiHandler("POST /api/review", postSavedQuestion);
