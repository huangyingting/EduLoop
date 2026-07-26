import { NextResponse } from "next/server";
import { z } from "zod";
import { calendarDay, previousCalendarDay } from "@/lib/dates";
import { prisma } from "@/lib/prisma";

const attemptSchema = z.object({
  questionId: z.string().min(8), deviceKey: z.string().min(8).max(100),
  response: z.union([z.string().max(5000), z.array(z.string().max(10)).max(8)]),
  secondsSpent: z.number().int().min(0).max(7200).optional(), sessionId: z.string().optional(),
  timeZone: z.string().max(100).optional(),
});

function levelForXp(xp: number) { return Math.floor(xp / 120) + 1; }

export async function POST(request: Request) {
  const parsed = attemptSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid attempt", details: parsed.error.flatten() }, { status: 400 });
  const input = parsed.data;
  const question = await prisma.question.findUnique({ where: { id: input.questionId } });
  if (!question || question.status !== "PUBLISHED") return NextResponse.json({ error: "Question not found" }, { status: 404 });

  const responseLabels = Array.isArray(input.response) ? [...new Set(input.response.map((item) => item.toUpperCase()))].sort() : [];
  const correctLabels = question.correctAnswer ? JSON.parse(question.correctAnswer) as string[] : [];
  const isCorrect = question.isAutoGradable ? JSON.stringify(responseLabels) === JSON.stringify([...correctLabels].sort()) : null;
  const difficultyBonus = { EASY: 4, MEDIUM: 7, HARD: 11 }[question.difficulty] ?? 5;
  const earnedXp = isCorrect === true ? 6 + difficultyBonus : isCorrect === false ? 2 : 3;
  const today = calendarDay(new Date(), input.timeZone);

  const learner = await prisma.learnerProfile.upsert({
    where: { deviceKey: input.deviceKey }, create: { deviceKey: input.deviceKey }, update: {},
  });
  const activeToday = learner.lastActiveOn === today;
  const nextStreak = activeToday ? learner.currentStreak : learner.lastActiveOn === previousCalendarDay(today) ? learner.currentStreak + 1 : 1;
  const [, updatedLearner, activity] = await prisma.$transaction([
    prisma.practiceAttempt.create({ data: {
      learnerId: learner.id, sessionId: input.sessionId, questionId: question.id,
      response: JSON.stringify(input.response), isCorrect, isSelfAssessed: isCorrect === null,
      secondsSpent: input.secondsSpent, earnedXp,
    } }),
    prisma.learnerProfile.update({ where: { id: learner.id }, data: {
      xp: { increment: earnedXp }, currentStreak: nextStreak,
      bestStreak: Math.max(learner.bestStreak, nextStreak), lastActiveOn: today,
    } }),
    prisma.dailyActivity.upsert({
      where: { learnerId_activityDate: { learnerId: learner.id, activityDate: today } },
      create: { learnerId: learner.id, activityDate: today, attempts: 1, correct: isCorrect ? 1 : 0, earnedXp },
      update: { attempts: { increment: 1 }, correct: { increment: isCorrect ? 1 : 0 }, earnedXp: { increment: earnedXp } },
    }),
  ]);
  const totalXp = updatedLearner.xp;
  const level = levelForXp(totalXp);
  await prisma.learnerProfile.updateMany({
    where: { id: learner.id, xp: totalXp }, data: { level },
  });

  const attempts = await prisma.practiceAttempt.count({ where: { learnerId: learner.id } });
  const recent = await prisma.practiceAttempt.findMany({ where: { learnerId: learner.id, isCorrect: { not: null } }, orderBy: { createdAt: "desc" }, take: 10, select: { isCorrect: true } });
  const earnedBadgeSlugs = [attempts >= 1 ? "first-spark" : null, attempts >= 100 ? "century-club" : null, recent.length === 10 && recent.every((item) => item.isCorrect) ? "ten-in-a-row" : null].filter(Boolean) as string[];
  const newBadges: Array<{ name: string; icon: string }> = [];
  for (const slug of earnedBadgeSlugs) {
    const badge = await prisma.badge.findUnique({ where: { slug } });
    if (!badge) continue;
    const inserted = await prisma.$executeRaw`
      INSERT INTO "LearnerBadge" ("learnerId", "badgeId", "earnedAt")
      VALUES (${learner.id}, ${badge.id}, ${new Date()})
      ON CONFLICT ("learnerId", "badgeId") DO NOTHING
    `;
    if (inserted) newBadges.push({ name: badge.name, icon: badge.icon });
  }

  return NextResponse.json({
    isCorrect, correctLabels, answer: question.answer, explanation: question.explanation,
    earnedXp, totalXp, level, currentStreak: nextStreak, todayAttempts: activity.attempts, newBadges,
  });
}
