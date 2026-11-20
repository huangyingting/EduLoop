import { Prisma } from "@prisma/client";
import type { SessionSnapshot } from "@/lib/contracts/practice";
import { PRACTICE_SESSION_STATUS } from "@/lib/domain-constants";

export { DEFAULT_QUESTION_GOAL } from "@/lib/domain-constants";
import { prisma } from "@/lib/prisma";

const RECENT_SESSION_QUESTIONS = 20;

const recentAttempts = {
  attempts: { orderBy: { createdAt: "desc" }, take: RECENT_SESSION_QUESTIONS, select: { questionId: true } },
} as const;

function snapshot(session: {
  id: string;
  status: string;
  questionGoal: number;
  completedCount: number;
  correctCount: number;
  earnedXp: number;
  attempts: Array<{ questionId: string }>;
}, resumed: boolean): SessionSnapshot {
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

export function sessionFiltersJson(filters: Record<string, string>) {
  return JSON.stringify(Object.fromEntries(Object.entries(filters).sort(([left], [right]) => left.localeCompare(right))));
}

// PracticeSession.activeKey is a unique per-learner slot, so the database
// rather than this process guarantees at most one active session.
export async function startPracticeSession(learnerId: string, input: {
  questionGoal: number;
  filters: Record<string, string>;
  restart: boolean;
}): Promise<{ status: "RESUMED" | "CREATED"; session: SessionSnapshot } | { status: "CONFLICT" }> {
  const filtersJson = sessionFiltersJson(input.filters);
  const active = await prisma.practiceSession.findUnique({ where: { activeKey: learnerId }, include: recentAttempts });
  if (!input.restart && active && active.filtersJson === filtersJson && active.questionGoal === input.questionGoal) {
    return { status: "RESUMED", session: snapshot(active, true) };
  }

  try {
    const [, session] = await prisma.$transaction([
      prisma.practiceSession.updateMany({
        where: { learnerId, status: PRACTICE_SESSION_STATUS.ACTIVE },
        data: { activeKey: null, status: PRACTICE_SESSION_STATUS.ABANDONED, completedAt: new Date() },
      }),
      prisma.practiceSession.create({
        data: { learnerId, activeKey: learnerId, filtersJson, questionGoal: input.questionGoal },
        include: { attempts: { select: { questionId: true } } },
      }),
    ]);
    return { status: "CREATED", session: snapshot(session, false) };
  } catch (error) {
    const activeConflict = error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
    if (!activeConflict) throw error;
    const winner = await prisma.practiceSession.findUnique({ where: { activeKey: learnerId }, include: recentAttempts });
    if (!winner) throw error;
    if (winner.filtersJson !== filtersJson || winner.questionGoal !== input.questionGoal) return { status: "CONFLICT" };
    return { status: "RESUMED", session: snapshot(winner, true) };
  }
}
