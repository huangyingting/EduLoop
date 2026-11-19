import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GET as getPreferences, PATCH as updatePreferences } from "@/app/api/notifications/preferences/route";
import { PUT as putLocale } from "@/app/api/auth/locale/route";
import { POST as unsubscribeRoute } from "@/app/api/notifications/unsubscribe/route";
import { dispatchReminders } from "@/lib/notifications/dispatch";
import { issueUnsubscribeToken } from "@/lib/notifications/unsubscribe";
import { prisma } from "@/lib/prisma";
import {
  authCookie,
  createCatalogFixture,
  createChoiceQuestion,
  currentConsent,
  integrationHeaders,
  jsonRequest,
  type CatalogFixture,
} from "./fixtures";

const prefix = "reminder-flow";
const optedInId = `${prefix}-opted-in`;
const unverifiedId = `${prefix}-unverified`;
const silentId = `${prefix}-silent`;
// 2026-11-23 is a Monday; 10:30 UTC is 18:30 in Shanghai.
const mondayEvening = new Date("2026-11-23T10:30:00.000Z");
let catalog: CatalogFixture;

async function learnerWithDueReview(id: string, verified: boolean, questionId: string) {
  await prisma.user.create({ data: {
    id, email: `${id}@example.com`, emailVerified: verified ? new Date() : null, ...currentConsent,
    learner: { create: { timeZone: "Asia/Shanghai" } },
  } });
  const learner = await prisma.learnerProfile.findUniqueOrThrow({ where: { userId: id } });
  await prisma.reviewItem.create({ data: { learnerId: learner.id, questionId, dueAt: new Date("2026-11-22T00:00:00.000Z"), lastAttemptAt: new Date("2026-11-21T00:00:00.000Z") } });
}

beforeAll(async () => {
  catalog = await createCatalogFixture(prefix);
  const question = await createChoiceQuestion(catalog, `${prefix}-question`);
  await learnerWithDueReview(optedInId, true, question.id);
  await learnerWithDueReview(unverifiedId, false, question.id);
  await learnerWithDueReview(silentId, true, question.id);
  for (const userId of [optedInId, unverifiedId]) {
    await prisma.notificationPreference.create({ data: { userId, dueReviewDigest: true, weeklySummary: true, sendHour: 18 } });
  }
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { id: { in: [optedInId, unverifiedId, silentId] } } });
  await catalog.cleanup();
  await prisma.rateLimitBucket.deleteMany();
  await prisma.$disconnect();
});

describe("learning reminders", () => {
  it("sends only to verified, opted-in accounts in their local hour, once per period", async () => {
    const sent: Array<{ to: string; subject: string; unsubscribeUrl: string }> = [];
    const send = async (to: string, email: { subject: string }, unsubscribeUrl: string) => {
      sent.push({ to, subject: email.subject, unsubscribeUrl });
    };
    const early = await dispatchReminders({ now: new Date("2026-11-23T08:00:00.000Z"), send, origin: "https://learn.example" });
    expect(early.sent).toEqual({ DUE_REVIEW_DIGEST: 0, WEEKLY_SUMMARY: 0 });

    const first = await dispatchReminders({ now: mondayEvening, send, origin: "https://learn.example" });
    expect(first.sent).toEqual({ DUE_REVIEW_DIGEST: 1, WEEKLY_SUMMARY: 1 });
    expect(sent.map(({ to }) => to)).toEqual([`${optedInId}@example.com`, `${optedInId}@example.com`]);
    expect(sent[0].subject).toContain("1 道错题");
    expect(sent[0].unsubscribeUrl).toMatch(/^https:\/\/learn\.example\/api\/notifications\/unsubscribe\?token=/);

    const again = await dispatchReminders({ now: new Date(mondayEvening.getTime() + 60 * 60_000), send, origin: "https://learn.example" });
    expect(again.sent).toEqual({ DUE_REVIEW_DIGEST: 0, WEEKLY_SUMMARY: 0 });
  });

  it("sends reminders in the language the account chose", async () => {
    const cookie = await authCookie(optedInId);
    expect((await putLocale(jsonRequest("http://localhost/api/auth/locale", "PUT", { locale: "fr" }, cookie))).status).toBe(400);
    expect(await (await putLocale(jsonRequest("http://localhost/api/auth/locale", "PUT", { locale: "en" }, cookie))).json()).toEqual({ locale: "en" });
    await prisma.notificationLog.deleteMany({ where: { userId: optedInId } });
    const subjects: string[] = [];
    await dispatchReminders({ now: mondayEvening, send: async (_to, email) => { subjects.push(email.subject); }, origin: "https://learn.example" });
    expect(subjects).toEqual(["1 mistake is ready for review today", "Your EduLoop week in review"]);
    await prisma.user.update({ where: { id: optedInId }, data: { locale: null } });
  });

  it("releases the period when delivery fails so the next run retries", async () => {
    await prisma.notificationLog.deleteMany({ where: { userId: optedInId } });
    const failing = await dispatchReminders({ now: mondayEvening, send: async () => { throw new Error("provider down"); }, origin: "https://learn.example" });
    expect(failing.failed).toBe(2);
    expect(await prisma.notificationLog.count({ where: { userId: optedInId } })).toBe(0);
  });

  it("lets the account holder change preferences and unsubscribe with one click", async () => {
    const cookie = await authCookie(silentId);
    const initial = await getPreferences(new NextRequest("http://localhost/api/notifications/preferences", { headers: { ...integrationHeaders, cookie } }));
    expect(await initial.json()).toMatchObject({ dueReviewDigest: false, weeklySummary: false, emailVerified: true });
    const updated = await updatePreferences(jsonRequest("http://localhost/api/notifications/preferences", "PATCH", { dueReviewDigest: true, weeklySummary: false, sendHour: 20 }, cookie));
    expect(await updated.json()).toMatchObject({ dueReviewDigest: true, sendHour: 20 });

    const token = issueUnsubscribeToken(silentId, "DUE_REVIEW_DIGEST");
    const unsubscribed = await unsubscribeRoute(new NextRequest(`http://localhost/api/notifications/unsubscribe?token=${encodeURIComponent(token)}`, {
      method: "POST", headers: { ...integrationHeaders, origin: "https://mail.example" },
    }));
    expect(await unsubscribed.json()).toEqual({ unsubscribed: true, type: "DUE_REVIEW_DIGEST" });
    expect(await prisma.notificationPreference.findUniqueOrThrow({ where: { userId: silentId } })).toMatchObject({ dueReviewDigest: false });

    const forged = await unsubscribeRoute(new NextRequest("http://localhost/api/notifications/unsubscribe?token=forged", { method: "POST", headers: integrationHeaders }));
    expect(forged.status).toBe(400);
  });
});
