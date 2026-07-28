import { randomUUID } from "node:crypto";
import type { LearnerProfile, Prisma } from "@prisma/client";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type Transaction = Prisma.TransactionClient;

function accountDeviceKey() {
  return `account_${randomUUID()}`;
}

function latestDay(left: string | null, right: string | null) {
  if (!left) return right;
  if (!right) return left;
  return left > right ? left : right;
}

async function mergeLearners(transaction: Transaction, target: LearnerProfile, source: LearnerProfile) {
  const [activities, badges, savedQuestions, reviewItems] = await Promise.all([
    transaction.dailyActivity.findMany({ where: { learnerId: source.id } }),
    transaction.learnerBadge.findMany({ where: { learnerId: source.id } }),
    transaction.savedQuestion.findMany({ where: { learnerId: source.id } }),
    transaction.reviewItem.findMany({ where: { learnerId: source.id } }),
  ]);

  for (const activity of activities) {
    await transaction.dailyActivity.upsert({
      where: { learnerId_activityDate: { learnerId: target.id, activityDate: activity.activityDate } },
      create: {
        learnerId: target.id,
        activityDate: activity.activityDate,
        attempts: activity.attempts,
        correct: activity.correct,
        earnedXp: activity.earnedXp,
      },
      update: {
        attempts: { increment: activity.attempts },
        correct: { increment: activity.correct },
        earnedXp: { increment: activity.earnedXp },
      },
    });
  }
  await transaction.dailyActivity.deleteMany({ where: { learnerId: source.id } });

  for (const item of badges) {
    await transaction.learnerBadge.upsert({
      where: { learnerId_badgeId: { learnerId: target.id, badgeId: item.badgeId } },
      create: { learnerId: target.id, badgeId: item.badgeId, earnedAt: item.earnedAt },
      update: {},
    });
  }
  await transaction.learnerBadge.deleteMany({ where: { learnerId: source.id } });

  for (const item of savedQuestions) {
    await transaction.savedQuestion.upsert({
      where: { learnerId_questionId: { learnerId: target.id, questionId: item.questionId } },
      create: { learnerId: target.id, questionId: item.questionId, createdAt: item.createdAt },
      update: {},
    });
  }
  await transaction.savedQuestion.deleteMany({ where: { learnerId: source.id } });

  for (const item of reviewItems) {
    const existing = await transaction.reviewItem.findUnique({
      where: { learnerId_questionId: { learnerId: target.id, questionId: item.questionId } },
    });
    const sourceIsNewer = !existing || item.lastAttemptAt > existing.lastAttemptAt;
    await transaction.reviewItem.upsert({
      where: { learnerId_questionId: { learnerId: target.id, questionId: item.questionId } },
      create: {
        learnerId: target.id,
        questionId: item.questionId,
        status: item.status,
        dueAt: item.dueAt,
        intervalDays: item.intervalDays,
        repetitions: item.repetitions,
        consecutiveCorrect: item.consecutiveCorrect,
        lastResult: item.lastResult,
        lastAttemptAt: item.lastAttemptAt,
        createdAt: item.createdAt,
      },
      update: existing ? {
        status: existing.status === "ACTIVE" || item.status === "ACTIVE" ? "ACTIVE" : existing.status,
        dueAt: existing.dueAt < item.dueAt ? existing.dueAt : item.dueAt,
        intervalDays: Math.min(existing.intervalDays, item.intervalDays),
        repetitions: Math.max(existing.repetitions, item.repetitions),
        consecutiveCorrect: sourceIsNewer ? item.consecutiveCorrect : existing.consecutiveCorrect,
        lastResult: sourceIsNewer ? item.lastResult : existing.lastResult,
        lastAttemptAt: sourceIsNewer ? item.lastAttemptAt : existing.lastAttemptAt,
      } : {},
    });
  }
  await transaction.reviewItem.deleteMany({ where: { learnerId: source.id } });

  await transaction.practiceSession.updateMany({ where: { learnerId: source.id }, data: { learnerId: target.id } });
  await transaction.practiceAttempt.updateMany({ where: { learnerId: source.id }, data: { learnerId: target.id } });
  await transaction.questionReport.updateMany({ where: { learnerId: source.id }, data: { learnerId: target.id } });

  const xp = target.xp + source.xp;
  const updated = await transaction.learnerProfile.update({
    where: { id: target.id },
    data: {
      displayName: target.displayName ?? source.displayName,
      xp,
      level: Math.floor(xp / 120) + 1,
      currentStreak: Math.max(target.currentStreak, source.currentStreak),
      bestStreak: Math.max(target.bestStreak, source.bestStreak),
      streakFreezes: Math.max(target.streakFreezes, source.streakFreezes),
      lastFreezeUsedOn: latestDay(target.lastFreezeUsedOn, source.lastFreezeUsedOn),
      lastActiveOn: latestDay(target.lastActiveOn, source.lastActiveOn),
    },
  });
  await transaction.learnerProfile.delete({ where: { id: source.id } });
  return updated;
}

export async function attachLearnerToNewUser(
  transaction: Transaction,
  userId: string,
  deviceKey: string,
  displayName: string | null,
) {
  const deviceLearner = await transaction.learnerProfile.findUnique({ where: { deviceKey } });
  if (deviceLearner && !deviceLearner.userId) {
    return transaction.learnerProfile.update({
      where: { id: deviceLearner.id },
      data: { userId, deviceKey: accountDeviceKey(), displayName: displayName ?? deviceLearner.displayName },
    });
  }
  return transaction.learnerProfile.create({
    data: { userId, deviceKey: accountDeviceKey(), displayName },
  });
}

export async function linkLearnerToUser(userId: string, deviceKey: string) {
  return prisma.$transaction(async (transaction) => {
    const [accountLearner, deviceLearner] = await Promise.all([
      transaction.learnerProfile.findUnique({ where: { userId } }),
      transaction.learnerProfile.findUnique({ where: { deviceKey } }),
    ]);

    if (!accountLearner) {
      if (deviceLearner && !deviceLearner.userId) {
        return transaction.learnerProfile.update({
          where: { id: deviceLearner.id },
          data: { userId, deviceKey: accountDeviceKey() },
        });
      }
      return transaction.learnerProfile.create({ data: { userId, deviceKey: accountDeviceKey() } });
    }
    if (!deviceLearner || deviceLearner.id === accountLearner.id || deviceLearner.userId) return accountLearner;
    return mergeLearners(transaction, accountLearner, deviceLearner);
  });
}

export async function findLearnerForRequest(request: Request, deviceKey: string) {
  const user = await getSessionUser(request);
  return user
    ? prisma.learnerProfile.findUnique({ where: { userId: user.id } })
    : prisma.learnerProfile.findUnique({ where: { deviceKey } });
}

export async function getOrCreateLearnerForRequest(request: Request, deviceKey: string) {
  const user = await getSessionUser(request);
  if (user) {
    const learner = await prisma.learnerProfile.findUnique({ where: { userId: user.id } });
    return learner ?? linkLearnerToUser(user.id, deviceKey);
  }
  try {
    return await prisma.learnerProfile.upsert({ where: { deviceKey }, create: { deviceKey }, update: {} });
  } catch (error) {
    const racedWithAnotherCreate = error && typeof error === "object" && "code" in error && error.code === "P2002";
    if (!racedWithAnotherCreate) throw error;
    return prisma.learnerProfile.findUniqueOrThrow({ where: { deviceKey } });
  }
}
