import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { calendarDay, calendarDaysBefore, previousCalendarDay } from "@/lib/dates";
import { enforceRateLimit } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { findLearnerForRequest } from "@/lib/learner-identity";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  deviceKey: z.string().min(8).max(100),
  timeZone: z.string().max(100).optional(),
});

export async function GET(request: NextRequest) {
  const parsed = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) return NextResponse.json({ error: "Invalid learner query" }, { status: 400 });
  const learner = await findLearnerForRequest(request, parsed.data.deviceKey);
  if (!learner) return NextResponse.json({ xp: 0, level: 1, currentStreak: 0, bestStreak: 0, streakFreezes: 1, todayAttempts: 0 });
  const today = calendarDay(new Date(), parsed.data.timeZone);
  const activity = await prisma.dailyActivity.findUnique({
    where: { learnerId_activityDate: { learnerId: learner.id, activityDate: today } },
  });
  const streakIsProtected = learner.lastActiveOn === calendarDaysBefore(today, 2) && learner.streakFreezes > 0;
  const currentStreak = learner.lastActiveOn === today
    || learner.lastActiveOn === previousCalendarDay(today)
    || streakIsProtected
    ? learner.currentStreak
    : 0;
  return NextResponse.json({
    xp: learner.xp, level: Math.floor(learner.xp / 120) + 1,
    currentStreak, bestStreak: learner.bestStreak,
    streakFreezes: learner.streakFreezes,
    todayAttempts: activity?.attempts ?? 0,
  });
}

export async function DELETE(request: NextRequest) {
  const parsed = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) return NextResponse.json({ error: "Invalid learner query" }, { status: 400 });
  const limited = enforceRateLimit(request, "delete-learner", parsed.data.deviceKey, 3, 60 * 60_000);
  if (limited) return limited;
  const learner = await findLearnerForRequest(request, parsed.data.deviceKey);
  const removed = learner
    ? await prisma.learnerProfile.deleteMany({ where: { id: learner.id } })
    : { count: 0 };
  return NextResponse.json({ deleted: removed.count > 0 });
}
