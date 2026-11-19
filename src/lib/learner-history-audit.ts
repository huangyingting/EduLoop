import type { PrismaClient } from "@prisma/client";

export type LearnerHistoryTotals = {
  learnerId: string;
  xp: number;
  activityAttempts: number;
  attemptRows: number;
  attemptXp: number;
};

export type LearnerHistoryAudit = {
  learnersChecked: number;
  learnersMissingAttempts: number;
  missingAttempts: number;
  learnersWithXpGap: number;
  xpGap: number;
  retiredQuestions: number;
  supersededQuestions: number;
};

// Every persisted attempt increments DailyActivity.attempts and LearnerProfile.xp
// exactly once, and nothing except learner erasure removes those aggregates. An
// aggregate that exceeds the surviving attempt rows therefore shows history that
// was deleted underneath it, for example by an older catalog import.
export function summarizeLearnerHistory(totals: LearnerHistoryTotals[]) {
  let learnersMissingAttempts = 0;
  let missingAttempts = 0;
  let learnersWithXpGap = 0;
  let xpGap = 0;
  for (const learner of totals) {
    const attemptGap = learner.activityAttempts - learner.attemptRows;
    if (attemptGap > 0) {
      learnersMissingAttempts += 1;
      missingAttempts += attemptGap;
    }
    const learnerXpGap = learner.xp - learner.attemptXp;
    if (learnerXpGap > 0) {
      learnersWithXpGap += 1;
      xpGap += learnerXpGap;
    }
  }
  return { learnersChecked: totals.length, learnersMissingAttempts, missingAttempts, learnersWithXpGap, xpGap };
}

export async function auditLearnerHistory(client: PrismaClient): Promise<LearnerHistoryAudit> {
  const [learners, activity, attempts, retiredQuestions, supersededQuestions] = await Promise.all([
    client.learnerProfile.findMany({ select: { id: true, xp: true } }),
    client.dailyActivity.groupBy({ by: ["learnerId"], _sum: { attempts: true } }),
    client.practiceAttempt.groupBy({ by: ["learnerId"], _count: { _all: true }, _sum: { earnedXp: true } }),
    client.question.count({ where: { retiredAt: { not: null } } }),
    client.question.count({ where: { supersededById: { not: null } } }),
  ]);
  const activityByLearner = new Map(activity.map((row) => [row.learnerId, row._sum.attempts ?? 0]));
  const attemptsByLearner = new Map(attempts.map((row) => [row.learnerId, row]));
  const summary = summarizeLearnerHistory(learners.map((learner) => ({
    learnerId: learner.id,
    xp: learner.xp,
    activityAttempts: activityByLearner.get(learner.id) ?? 0,
    attemptRows: attemptsByLearner.get(learner.id)?._count._all ?? 0,
    attemptXp: attemptsByLearner.get(learner.id)?._sum.earnedXp ?? 0,
  })));
  return { ...summary, retiredQuestions, supersededQuestions };
}
