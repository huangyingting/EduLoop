import { NextResponse } from "next/server";
import { z } from "zod";
import { enforceRateLimit } from "@/lib/api";
import { prisma } from "@/lib/prisma";

const sessionSchema = z.object({
  deviceKey: z.string().min(8).max(100),
  questionGoal: z.number().int().min(1).max(50).default(10),
  filters: z.record(z.string(), z.string().max(100)).default({}),
});

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = sessionSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid session" }, { status: 400 });
  const limited = enforceRateLimit(request, "sessions", parsed.data.deviceKey, 20);
  if (limited) return limited;

  const learner = await prisma.learnerProfile.upsert({
    where: { deviceKey: parsed.data.deviceKey },
    create: { deviceKey: parsed.data.deviceKey },
    update: {},
  });

  const [, session] = await prisma.$transaction([
    prisma.practiceSession.updateMany({
      where: { learnerId: learner.id, status: "ACTIVE" },
      data: { status: "ABANDONED", completedAt: new Date() },
    }),
    prisma.practiceSession.create({
      data: {
        learnerId: learner.id,
        filtersJson: JSON.stringify(parsed.data.filters),
        questionGoal: parsed.data.questionGoal,
      },
    }),
  ]);

  return NextResponse.json({
    id: session.id,
    status: session.status,
    questionGoal: session.questionGoal,
    completedCount: session.completedCount,
  }, { status: 201 });
}
