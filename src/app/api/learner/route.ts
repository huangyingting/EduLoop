import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { deleteLearningData } from "@/lib/account";
import { apiError, apiHandler, enforceRateLimit } from "@/lib/api";
import { runAfterResponse } from "@/lib/after-response";
import { getSessionUser } from "@/lib/auth";
import { hasRecentAuthentication, isSameOriginRequest } from "@/lib/auth-validation";
import { calendarDay, visibleStreak } from "@/lib/dates";
import { emailConfiguration, sendLearningDataDeletedNotice } from "@/lib/email";
import { findLearnerForUser } from "@/lib/learner-identity";
import { errorLogMetadata } from "@/lib/logging";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const querySchema = z.object({
  timeZone: z.string().max(100).optional(),
});

async function notifyLearningDataDeletion(email: string) {
  try {
    await sendLearningDataDeletedNotice(email);
  } catch (error) {
    console.error(JSON.stringify({
      level: "error",
      event: "learning_data_deletion_notification_failed",
      ...errorLogMetadata(error),
    }));
  }
}

async function getLearner(request: NextRequest) {
  const user = await getSessionUser(request);
  if (!user) return apiError("请先登录。", 401, "UNAUTHORIZED");
  const parsed = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) return apiError("Invalid learner query", 400, "INVALID_REQUEST");
  const limited = await enforceRateLimit(
    request,
    "learner-summary",
    { identity: user.id, identityLimit: 120 },
  );
  if (limited) return limited;
  const learner = await findLearnerForUser(user);
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
  if (!hasRecentAuthentication(user.authenticatedAt)) {
    return apiError("删除学习数据前请重新登录，以确认这是你的账号。", 401, "UNAUTHORIZED");
  }
  const parsed = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) return apiError("Invalid learner query", 400, "INVALID_REQUEST");
  const limited = await enforceRateLimit(
    request,
    "delete-learner",
    { identity: user.id, identityLimit: 3 },
    60 * 60_000,
  );
  if (limited) return limited;
  // Delete directly by account ownership so an account with no learner data is
  // never given an empty profile merely for the purpose of deleting it again.
  const outcome = await deleteLearningData(user.id, user.sessionVersion);
  if (outcome === "CONFLICT") {
    return apiError("账号安全设置刚刚发生变化，请重新登录后再试。", 409, "CONFLICT");
  }
  if (outcome === "DELETED" && emailConfiguration()) {
    await runAfterResponse(() => notifyLearningDataDeletion(user.email));
  }
  return NextResponse.json({ deleted: outcome === "DELETED" });
}

export const GET = apiHandler("GET /api/learner", getLearner);
export const DELETE = apiHandler("DELETE /api/learner", deleteLearner);
