import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiError, apiHandler, enforceRateLimit, readJsonBody } from "@/lib/api";
import { getSessionUser } from "@/lib/auth";
import { isSameOriginRequest } from "@/lib/auth-validation";
import { prisma } from "@/lib/prisma";
import { findLearnerForRequest, findLearnerForUser } from "@/lib/learner-identity";

export const dynamic = "force-dynamic";

const querySchema = z.object({});
const saveSchema = z.object({
  questionId: z.string().min(8).max(100),
  saved: z.boolean(),
});
const reviewMutationSchema = z.object({
  questionId: z.string().min(8).max(100),
  action: z.literal("DISMISS"),
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
  const user = await getSessionUser(request);
  if (!user) return apiError("请先登录。", 401, "UNAUTHORIZED");
  const parsed = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) return apiError("Invalid review query", 400, "INVALID_REQUEST");
  const limited = await enforceRateLimit(request, "review-list", user.id, 60);
  if (limited) return limited;
  const learner = await findLearnerForUser(user);

  const now = new Date();
  const [reviews, saved, dueCount, activeCount, savedCount] = await Promise.all([
    prisma.reviewItem.findMany({
      where: { learnerId: learner.id, status: "ACTIVE", question: { status: "PUBLISHED" } },
      orderBy: [{ dueAt: "asc" }, { updatedAt: "desc" }],
      take: 50,
      include: { question: { include: {
        ...questionInclude,
        savedBy: { where: { learnerId: learner.id }, take: 1, select: { questionId: true } },
      } } },
    }),
    prisma.savedQuestion.findMany({
      where: { learnerId: learner.id, question: { status: "PUBLISHED" } },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { question: { include: {
        ...questionInclude,
        reviewItems: {
          where: { learnerId: learner.id, status: "ACTIVE" },
          take: 1,
          select: { dueAt: true },
        },
      } } },
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
      isSaved: item.question.savedBy.length > 0,
    })),
    saved: saved.map((item) => ({
      ...questionCard(item.question),
      savedAt: item.createdAt,
      isInReview: item.question.reviewItems.length > 0,
      reviewIsDue: Boolean(item.question.reviewItems[0]?.dueAt && item.question.reviewItems[0].dueAt <= now),
    })),
  });
}

async function postSavedQuestion(request: Request) {
  if (!isSameOriginRequest(request)) return apiError("Invalid request origin.", 403, "FORBIDDEN");
  const user = await getSessionUser(request);
  if (!user) return apiError("请先登录。", 401, "UNAUTHORIZED");
  const body = await readJsonBody(request);
  if (!body.ok) return body.response;
  const parsed = saveSchema.safeParse(body.value);
  if (!parsed.success) return apiError("Invalid saved question", 400, "INVALID_REQUEST");
  const input = parsed.data;
  const limited = await enforceRateLimit(request, "saved-questions", user.id, 30);
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

async function patchReviewItem(request: Request) {
  if (!isSameOriginRequest(request)) return apiError("Invalid request origin.", 403, "FORBIDDEN");
  const user = await getSessionUser(request);
  if (!user) return apiError("请先登录。", 401, "UNAUTHORIZED");
  const body = await readJsonBody(request);
  if (!body.ok) return body.response;
  const parsed = reviewMutationSchema.safeParse(body.value);
  if (!parsed.success) return apiError("Invalid review action", 400, "INVALID_REQUEST");
  const limited = await enforceRateLimit(request, "review-items", user.id, 30);
  if (limited) return limited;
  const learner = await findLearnerForRequest(request);
  if (!learner) return apiError("请先登录。", 401, "UNAUTHORIZED");

  const updated = await prisma.reviewItem.updateMany({
    where: {
      learnerId: learner.id,
      questionId: parsed.data.questionId,
      status: "ACTIVE",
      question: { status: "PUBLISHED" },
    },
    data: { status: "DISMISSED" },
  });
  if (!updated.count) return apiError("Review item not found", 404, "NOT_FOUND");
  return NextResponse.json({ dismissed: true });
}

export const GET = apiHandler("GET /api/review", getReview);
export const POST = apiHandler("POST /api/review", postSavedQuestion);
export const PATCH = apiHandler("PATCH /api/review", patchReviewItem);
