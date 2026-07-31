import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, apiHandler, enforceRateLimit } from "@/lib/api";
import { getSessionUser } from "@/lib/auth";
import { isSameOriginRequest } from "@/lib/auth-validation";
import { prisma } from "@/lib/prisma";
import { findLearnerForRequest } from "@/lib/learner-identity";

const sessionSchema = z.object({
  questionGoal: z.number().int().min(1).max(50).default(10),
  filters: z.record(z.string().max(40), z.string().max(1000))
    .refine((filters) => Object.keys(filters).length <= 16, "Too many session filters")
    .default({}),
  restart: z.boolean().default(false),
});

function sessionPayload(session: {
  id: string;
  status: string;
  questionGoal: number;
  completedCount: number;
  correctCount: number;
  earnedXp: number;
  attempts: Array<{ questionId: string }>;
}, resumed: boolean) {
  return {
    id: session.id,
    status: session.status,
    questionGoal: session.questionGoal,
    completedCount: session.completedCount,
    correctCount: session.correctCount,
    earnedXp: session.earnedXp,
    recentQuestionIds: session.attempts.map((attempt) => attempt.questionId),
    resumed,
  };
}

async function postSession(request: Request) {
  if (!isSameOriginRequest(request)) return apiError("Invalid request origin.", 403, "FORBIDDEN");
  const user = await getSessionUser(request);
  if (!user) return apiError("请先登录。", 401, "UNAUTHORIZED");
  const body = await request.json().catch(() => null);
  const parsed = sessionSchema.safeParse(body);
  if (!parsed.success) return apiError("Invalid session", 400, "INVALID_REQUEST");
  const limited = await enforceRateLimit(request, "sessions", user.id, 20);
  if (limited) return limited;

  const learner = await findLearnerForRequest(request);
  if (!learner) return apiError("请先登录。", 401, "UNAUTHORIZED");

  const filtersJson = JSON.stringify(Object.fromEntries(Object.entries(parsed.data.filters).sort(([left], [right]) => left.localeCompare(right))));
  const active = await prisma.practiceSession.findUnique({
    where: { activeKey: learner.id },
    include: { attempts: { orderBy: { createdAt: "desc" }, take: 20, select: { questionId: true } } },
  });
  if (!parsed.data.restart && active && active.filtersJson === filtersJson && active.questionGoal === parsed.data.questionGoal) {
    return NextResponse.json(sessionPayload(active, true));
  }

  let session;
  try {
    [, session] = await prisma.$transaction([
      prisma.practiceSession.updateMany({
        where: { learnerId: learner.id, status: "ACTIVE" },
        data: { activeKey: null, status: "ABANDONED", completedAt: new Date() },
      }),
      prisma.practiceSession.create({
        data: {
          learnerId: learner.id,
          activeKey: learner.id,
          filtersJson,
          questionGoal: parsed.data.questionGoal,
        },
        include: { attempts: { select: { questionId: true } } },
      }),
    ]);
  } catch (error) {
    const activeConflict = error && typeof error === "object" && "code" in error && error.code === "P2002";
    if (!activeConflict) throw error;
    const winner = await prisma.practiceSession.findUnique({
      where: { activeKey: learner.id },
      include: { attempts: { orderBy: { createdAt: "desc" }, take: 20, select: { questionId: true } } },
    });
    if (!winner) throw error;
    if (winner.filtersJson !== filtersJson || winner.questionGoal !== parsed.data.questionGoal) {
      return apiError("Another device changed the active session. Please retry.", 409, "CONFLICT");
    }
    return NextResponse.json(sessionPayload(winner, true));
  }

  return NextResponse.json(sessionPayload(session, false), { status: 201 });
}

export const POST = apiHandler("POST /api/sessions", postSession);
