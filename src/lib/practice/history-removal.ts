import type { Prisma, PrismaClient } from "@prisma/client";
import { calendarDay, effectiveTimeZone } from "@/lib/dates";
import { topicTagSelect } from "./learner-stats";
import { levelForXp } from "./rewards";

type Counter = { attempts: number; correct: number; earnedXp: number; lastAttemptAt: Date };
type Client = Prisma.TransactionClient | PrismaClient;

function add(map: Map<string, Counter>, key: string, attempt: { isCorrect: boolean | null; earnedXp: number; createdAt: Date }) {
  const current = map.get(key) ?? { attempts: 0, correct: 0, earnedXp: 0, lastAttemptAt: attempt.createdAt };
  current.attempts += 1;
  current.correct += attempt.isCorrect ? 1 : 0;
  current.earnedXp += attempt.earnedXp;
  if (attempt.createdAt > current.lastAttemptAt) current.lastAttemptAt = attempt.createdAt;
  map.set(key, current);
}

// Rebuilds every counter that practice attempts feed, from the attempts that
// still exist: XP, level, and attempt total; daily activity; practice-session
// totals; and subject and topic statistics (keeping each subject's ability
// rating). Counters left over from deleted attempts disappear. Streaks and
// earned badges are not recalculated.
export async function reconcileLearnerHistory(client: Client, learnerIds: string[]) {
  for (const learnerId of new Set(learnerIds)) {
    const learner = await client.learnerProfile.findUnique({ where: { id: learnerId }, select: { timeZone: true } });
    if (!learner) continue;
    const timeZone = effectiveTimeZone(learner.timeZone);
    const attempts = await client.practiceAttempt.findMany({
      where: { learnerId },
      select: {
        sessionId: true, isCorrect: true, earnedXp: true, createdAt: true,
        question: { select: { subjectId: true, tags: topicTagSelect } },
      },
    });

    const days = new Map<string, Counter>();
    const sessions = new Map<string, Counter>();
    const subjects = new Map<string, Counter>();
    const topics = new Map<string, Counter>();
    let xp = 0;
    for (const attempt of attempts) {
      xp += attempt.earnedXp;
      add(days, calendarDay(attempt.createdAt, timeZone), attempt);
      if (attempt.sessionId) add(sessions, attempt.sessionId, attempt);
      // Subject and topic statistics count graded results only.
      if (attempt.isCorrect === null) continue;
      add(subjects, attempt.question.subjectId, attempt);
      for (const { tagId } of attempt.question.tags) add(topics, `${attempt.question.subjectId}\u0000${tagId}`, attempt);
    }

    await client.learnerProfile.update({ where: { id: learnerId }, data: { xp, level: levelForXp(xp), totalAttempts: attempts.length } });

    await client.dailyActivity.deleteMany({ where: { learnerId } });
    if (days.size) {
      await client.dailyActivity.createMany({ data: [...days].map(([activityDate, day]) => ({
        learnerId, activityDate, attempts: day.attempts, correct: day.correct, earnedXp: day.earnedXp,
      })) });
    }

    const learnerSessions = await client.practiceSession.findMany({ where: { learnerId }, select: { id: true } });
    for (const { id } of learnerSessions) {
      const totals = sessions.get(id);
      await client.practiceSession.update({ where: { id }, data: {
        completedCount: totals?.attempts ?? 0, correctCount: totals?.correct ?? 0, earnedXp: totals?.earnedXp ?? 0,
      } });
    }

    await client.learnerSubjectStat.deleteMany({ where: { learnerId, subjectId: { notIn: [...subjects.keys()] } } });
    for (const [subjectId, stat] of subjects) {
      await client.learnerSubjectStat.upsert({
        where: { learnerId_subjectId: { learnerId, subjectId } },
        create: { learnerId, subjectId, attempts: stat.attempts, correct: stat.correct, lastAttemptAt: stat.lastAttemptAt },
        update: { attempts: stat.attempts, correct: stat.correct, lastAttemptAt: stat.lastAttemptAt },
      });
    }

    await client.learnerTopicStat.deleteMany({ where: { learnerId } });
    if (topics.size) {
      await client.learnerTopicStat.createMany({ data: [...topics].map(([key, stat]) => {
        const [subjectId, tagId] = key.split("\u0000");
        return { learnerId, subjectId, tagId, attempts: stat.attempts, correct: stat.correct, lastAttemptAt: stat.lastAttemptAt };
      }) });
    }
  }
}

// Deletes every attempt on the given questions and reconciles the learners who
// made them. Callers delete the questions afterwards.
export async function removeQuestionHistory(transaction: Prisma.TransactionClient, questionIds: string[]) {
  if (!questionIds.length) return { attempts: 0, learners: 0 };
  const affected = await transaction.practiceAttempt.findMany({
    where: { questionId: { in: questionIds } },
    distinct: ["learnerId"],
    select: { learnerId: true },
  });
  const removed = await transaction.practiceAttempt.deleteMany({ where: { questionId: { in: questionIds } } });
  await reconcileLearnerHistory(transaction, affected.map(({ learnerId }) => learnerId));
  return { attempts: removed.count, learners: affected.length };
}
