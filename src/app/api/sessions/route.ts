import { NextResponse } from "next/server";
import { z } from "zod";
import { enforceRateLimit } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { getOrCreateLearnerForRequest } from "@/lib/learner-identity";

const sessionSchema = z.object({
  deviceKey: z.string().min(8).max(100),
  questionGoal: z.number().int().min(1).max(50).default(10),
  filters: z.record(z.string(), z.string().max(100)).default({}),
  restart: z.boolean().default(false),
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = sessionSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid session" }, { status: 400 });
  const limited = enforceRateLimit(request, "sessions", parsed.data.deviceKey, 20);
  if (limited) return limited;

  const learner = await getOrCreateLearnerForRequest(request, parsed.data.deviceKey);

  const filtersJson = JSON.stringify(Object.fromEntries(Object.entries(parsed.data.filters).sort(([left], [right]) => left.localeCompare(right))));
  const active = await prisma.practiceSession.findFirst({
    where: { learnerId: learner.id, status: "ACTIVE" },
    orderBy: { startedAt: "desc" },
    include: { attempts: { orderBy: { createdAt: "desc" }, take: 20, select: { questionId: true } } },
  });
  if (!parsed.data.restart && active && active.filtersJson === filtersJson && active.questionGoal === parsed.data.questionGoal) {
    return NextResponse.json({
      id: active.id,
      status: active.status,
      questionGoal: active.questionGoal,
      completedCount: active.completedCount,
      correctCount: active.correctCount,
      earnedXp: active.earnedXp,
      recentQuestionIds: active.attempts.map((attempt) => attempt.questionId),
      resumed: true,
    });
  }

  const [, session] = await prisma.$transaction([
    prisma.practiceSession.updateMany({
      where: { learnerId: learner.id, status: "ACTIVE" },
      data: { status: "ABANDONED", completedAt: new Date() },
    }),
    prisma.practiceSession.create({
      data: {
        learnerId: learner.id,
        filtersJson,
        questionGoal: parsed.data.questionGoal,
      },
    }),
  ]);

  return NextResponse.json({
    id: session.id,
    status: session.status,
    questionGoal: session.questionGoal,
    completedCount: session.completedCount,
    correctCount: session.correctCount,
    earnedXp: session.earnedXp,
    recentQuestionIds: [],
    resumed: false,
  }, { status: 201 });
}
