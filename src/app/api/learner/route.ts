import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { calendarDay, visibleStreak } from "@/lib/dates";
import { apiError, apiHandler, enforceRateLimit } from "@/lib/api";
import { getSessionUser } from "@/lib/auth";
import { isSameOriginRequest } from "@/lib/auth-validation";
import { prisma } from "@/lib/prisma";
import { findLearnerForRequest } from "@/lib/learner-identity";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  timeZone: z.string().max(100).optional(),
});

async function getLearner(request: NextRequest) {
  if (!await getSessionUser(request)) return apiError("请先登录。", 401, "UNAUTHORIZED");
  const parsed = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) return apiError("Invalid learner query", 400, "INVALID_REQUEST");
  const learner = await findLearnerForRequest(request);
  if (!learner) return apiError("请先登录。", 401, "UNAUTHORIZED");
  const today = calendarDay(new Date(), parsed.data.timeZone);
  const activity = await prisma.dailyActivity.findUnique({
    where: { learnerId_activityDate: { learnerId: learner.id, activityDate: today } },
  });
  const currentStreak = visibleStreak(learner, today);
  return NextResponse.json({
    xp: learner.xp, level: Math.floor(learner.xp / 120) + 1,
    currentStreak, bestStreak: learner.bestStreak,
    streakFreezes: learner.streakFreezes,
    todayAttempts: activity?.attempts ?? 0,
  });
}

async function deleteLearner(request: NextRequest) {
  if (!isSameOriginRequest(request)) return apiError("Invalid request origin.", 403, "FORBIDDEN");
  const user = await getSessionUser(request, { allowMissingConsent: true });
  if (!user) return apiError("请先登录。", 401, "UNAUTHORIZED");
  const parsed = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) return apiError("Invalid learner query", 400, "INVALID_REQUEST");
  const limited = await enforceRateLimit(request, "delete-learner", user.id, 3, 60 * 60_000);
  if (limited) return limited;
  const learner = await findLearnerForRequest(request, { allowMissingConsent: true });
  const removed = learner
    ? await prisma.learnerProfile.deleteMany({ where: { id: learner.id } })
    : { count: 0 };
  return NextResponse.json({ deleted: removed.count > 0 });
}

export const GET = apiHandler("GET /api/learner", getLearner);
export const DELETE = apiHandler("DELETE /api/learner", deleteLearner);
