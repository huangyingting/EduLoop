import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { enforceRateLimit } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { findLearnerForRequest, getOrCreateLearnerForRequest } from "@/lib/learner-identity";

export const dynamic = "force-dynamic";

const querySchema = z.object({ deviceKey: z.string().min(8).max(100) });
const saveSchema = z.object({
  deviceKey: z.string().min(8).max(100),
  questionId: z.string().min(8),
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

export async function GET(request: NextRequest) {
  const parsed = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) return NextResponse.json({ error: "Invalid review query" }, { status: 400 });
  const learner = await findLearnerForRequest(request, parsed.data.deviceKey);
  if (!learner) return NextResponse.json({ dueCount: 0, activeCount: 0, savedCount: 0, reviews: [], saved: [] });

  const now = new Date();
  const [reviews, saved, dueCount, activeCount, savedCount] = await Promise.all([
    prisma.reviewItem.findMany({
      where: { learnerId: learner.id, status: "ACTIVE" },
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
    prisma.reviewItem.count({ where: { learnerId: learner.id, status: "ACTIVE", dueAt: { lte: now } } }),
    prisma.reviewItem.count({ where: { learnerId: learner.id, status: "ACTIVE" } }),
    prisma.savedQuestion.count({ where: { learnerId: learner.id } }),
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

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = saveSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid saved question" }, { status: 400 });
  const input = parsed.data;
  const limited = enforceRateLimit(request, "saved-questions", input.deviceKey, 30);
  if (limited) return limited;
  const question = await prisma.question.findFirst({ where: { id: input.questionId, status: "PUBLISHED" }, select: { id: true } });
  if (!question) return NextResponse.json({ error: "Question not found" }, { status: 404 });
  const learner = await getOrCreateLearnerForRequest(request, input.deviceKey);

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
