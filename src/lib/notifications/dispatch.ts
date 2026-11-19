import { Prisma } from "@prisma/client";
import { calendarDay, calendarDaysBefore, effectiveTimeZone, visibleStreak } from "@/lib/dates";
import { QUESTION_STATUS, REVIEW_ITEM_STATUS } from "@/lib/domain-constants";
import { hasCurrentLegalConsent } from "@/lib/legal";
import { prisma } from "@/lib/prisma";
import { publicOrigin } from "@/lib/site";
import { dueReviewDigestEmail, sendReminderEmail, weeklySummaryEmail, type ReminderEmail } from "./messages";
import { isSendWindow, notificationPeriodKey, type NotificationType } from "./schedule";
import { issueUnsubscribeToken } from "./unsubscribe";

const BATCH_SIZE = 200;

export type ReminderDispatchSummary = {
  considered: number;
  sent: Record<NotificationType, number>;
  failed: number;
};

type Sender = (to: string, email: ReminderEmail, unsubscribeUrl: string) => Promise<void>;

function unsubscribeLinks(origin: string, userId: string, type: NotificationType, now: Date) {
  const token = issueUnsubscribeToken(userId, type, now.getTime());
  return {
    // Mail clients POST to this URL for one-click unsubscribe (RFC 8058).
    oneClick: `${origin}/api/notifications/unsubscribe?token=${encodeURIComponent(token)}`,
    // The link in the message body opens a confirmation page instead, so link
    // scanners that prefetch URLs cannot unsubscribe anyone.
    page: `${origin}/unsubscribe?token=${encodeURIComponent(token)}`,
  };
}

async function dueReviewCount(learnerIds: string[], now: Date) {
  return prisma.reviewItem.count({
    where: { learnerId: { in: learnerIds }, status: REVIEW_ITEM_STATUS.ACTIVE, dueAt: { lte: now }, question: { status: QUESTION_STATUS.PUBLISHED } },
  });
}

async function weeklyActivity(learnerId: string, today: string) {
  const days = await prisma.dailyActivity.findMany({
    where: { learnerId, activityDate: { gte: calendarDaysBefore(today, 6), lte: today } },
    select: { attempts: true, correct: true },
  });
  return {
    attempts: days.reduce((total, day) => total + day.attempts, 0),
    correct: days.reduce((total, day) => total + day.correct, 0),
    activeDays: days.filter((day) => day.attempts > 0).length,
  };
}

// Sends due-review digests and weekly summaries to verified, consenting
// accounts that opted in, inside their chosen local hour, at most once per
// period. Safe to run as often as hourly.
export async function dispatchReminders(options: { now?: Date; send?: Sender; origin?: string } = {}): Promise<ReminderDispatchSummary> {
  const now = options.now ?? new Date();
  const origin = options.origin ?? publicOrigin();
  const send = options.send ?? ((to, email, unsubscribeUrl) => sendReminderEmail(to, email, unsubscribeUrl));
  const summary: ReminderDispatchSummary = { considered: 0, sent: { DUE_REVIEW_DIGEST: 0, WEEKLY_SUMMARY: 0 }, failed: 0 };
  let cursor: string | undefined;

  while (true) {
    const preferences = await prisma.notificationPreference.findMany({
      where: { OR: [{ dueReviewDigest: true }, { weeklySummary: true }], user: { emailVerified: { not: null } } },
      orderBy: { userId: "asc" },
      take: BATCH_SIZE,
      ...(cursor ? { cursor: { userId: cursor }, skip: 1 } : {}),
      include: {
        user: {
          select: {
            id: true, email: true, termsAcceptedAt: true, termsVersion: true, privacyAcceptedAt: true, privacyVersion: true, consentBasis: true,
            learner: { select: { id: true, timeZone: true, currentStreak: true, lastActiveOn: true, streakFreezes: true } },
          },
        },
      },
    });
    if (!preferences.length) break;
    cursor = preferences.at(-1)!.userId;

    for (const preference of preferences) {
      const { user } = preference;
      const learner = user.learner;
      if (!learner || !hasCurrentLegalConsent(user)) continue;
      summary.considered += 1;
      const timeZone = effectiveTimeZone(learner.timeZone);
      const today = calendarDay(now, timeZone);
      const enabled: NotificationType[] = [
        ...(preference.dueReviewDigest ? ["DUE_REVIEW_DIGEST" as const] : []),
        ...(preference.weeklySummary ? ["WEEKLY_SUMMARY" as const] : []),
      ];
      for (const type of enabled) {
        if (!isSendWindow(type, now, timeZone, preference.sendHour)) continue;
        const links = unsubscribeLinks(origin, user.id, type, now);
        let email: ReminderEmail;
        if (type === "DUE_REVIEW_DIGEST") {
          const dueCount = await dueReviewCount([learner.id], now);
          if (!dueCount) continue;
          email = dueReviewDigestEmail({ dueCount, reviewUrl: `${origin}/review`, unsubscribeUrl: links.page });
        } else {
          const activity = await weeklyActivity(learner.id, today);
          email = weeklySummaryEmail({
            ...activity,
            currentStreak: visibleStreak(learner, today),
            progressUrl: `${origin}/progress`,
            unsubscribeUrl: links.page,
          });
        }

        // Claim the period first so concurrent or repeated runs cannot send
        // twice; release the claim if delivery fails so the next run retries.
        const periodKey = notificationPeriodKey(type, now, timeZone);
        let logId: string;
        try {
          logId = (await prisma.notificationLog.create({ data: { userId: user.id, type, periodKey }, select: { id: true } })).id;
        } catch (error) {
          if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") continue;
          throw error;
        }
        try {
          await send(user.email, email, links.oneClick);
          summary.sent[type] += 1;
        } catch {
          summary.failed += 1;
          await prisma.notificationLog.delete({ where: { id: logId } }).catch(() => undefined);
        }
      }
    }
  }
  return summary;
}

export async function unsubscribe(userId: string, type: NotificationType) {
  const updated = await prisma.notificationPreference.updateMany({
    where: { userId },
    data: type === "DUE_REVIEW_DIGEST" ? { dueReviewDigest: false } : { weeklySummary: false },
  });
  return updated.count > 0;
}
