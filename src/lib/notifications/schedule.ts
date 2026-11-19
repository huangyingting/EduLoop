import { calendarDay } from "@/lib/dates";

export const NOTIFICATION_TYPES = ["DUE_REVIEW_DIGEST", "WEEKLY_SUMMARY"] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

// Messages go out only inside waking hours in the learner's own zone, at or
// after the hour they chose, and at most once per local day (or week).
export const EARLIEST_SEND_HOUR = 7;
export const LATEST_SEND_HOUR = 21;

export function localHour(now: Date, timeZone: string) {
  const hour = new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", hourCycle: "h23" }).format(now);
  return Number(hour);
}

export function localWeekday(now: Date, timeZone: string) {
  return new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short" }).format(now);
}

export function notificationPeriodKey(type: NotificationType, now: Date, timeZone: string) {
  const day = calendarDay(now, timeZone);
  if (type === "DUE_REVIEW_DIGEST") return day;
  // Weekly summaries are keyed by the Monday that starts the local week.
  const date = new Date(`${day}T12:00:00.000Z`);
  const offset = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - offset);
  return `week-${date.toISOString().slice(0, 10)}`;
}

export function isSendWindow(type: NotificationType, now: Date, timeZone: string, preferredHour: number) {
  const hour = localHour(now, timeZone);
  const sendHour = Math.min(LATEST_SEND_HOUR, Math.max(EARLIEST_SEND_HOUR, preferredHour));
  if (hour < sendHour || hour > LATEST_SEND_HOUR) return false;
  return type === "DUE_REVIEW_DIGEST" || localWeekday(now, timeZone) === "Mon";
}
