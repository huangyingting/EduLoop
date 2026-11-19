import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { POST as createAttempt } from "@/app/api/attempts/route";
import { PATCH as updateLearnerProfile } from "@/app/api/learner/profile/route";
import { GET as nextQuestion } from "@/app/api/questions/next/route";
import { calendarDay, previousCalendarDay } from "@/lib/dates";
import { BADGE_CATALOG } from "@/lib/practice/badge-catalog";
import { prisma } from "@/lib/prisma";
import {
  authCookie,
  createCatalogFixture,
  createChoiceQuestion,
  createConsentingUser,
  integrationHeaders,
  jsonRequest,
  type CatalogFixture,
} from "./fixtures";

const prefix = "rewards-flow";
const streakUserId = `${prefix}-streak`;
const zoneUserId = `${prefix}-zone`;
const masteryUserId = `${prefix}-mastery`;
const questionIds = Array.from({ length: 6 }, (_, index) => `${prefix}-question-${index + 1}`);
let catalog: CatalogFixture;
let createdBadgeIds: string[] = [];

async function answer(cookie: string, questionId: string, response: string[], timeZone = "Asia/Shanghai") {
  const result = await createAttempt(jsonRequest("http://localhost/api/attempts", "POST", {
    questionId, response, clientAttemptId: crypto.randomUUID(), timeZone,
  }, cookie));
  expect(result.status).toBe(200);
  return result.json() as Promise<{ currentStreak: number; newBadges: Array<{ name: string }> }>;
}

beforeAll(async () => {
  catalog = await createCatalogFixture(prefix);
  const topic = await prisma.tag.create({ data: { slug: `${prefix}-topic`, label: "奖励主题", dimensionId: catalog.topicDimensionId } });
  for (const id of questionIds) await createChoiceQuestion(catalog, id, { tagIds: [topic.id] });
  for (const id of [streakUserId, zoneUserId, masteryUserId]) await createConsentingUser(id);
  createdBadgeIds = [];
  for (const { rule, ...badge } of BADGE_CATALOG) {
    if (!await prisma.badge.findUnique({ where: { slug: badge.slug } })) {
      createdBadgeIds.push((await prisma.badge.create({ data: { ...badge, rule: JSON.stringify(rule) } })).id);
    }
  }
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { id: { in: [streakUserId, zoneUserId, masteryUserId] } } });
  await catalog.cleanup();
  await prisma.badge.deleteMany({ where: { id: { in: createdBadgeIds } } });
  await prisma.rateLimitBucket.deleteMany();
  await prisma.$disconnect();
});

describe("data-driven rewards and streak integrity", () => {
  it("stores the first attempt's zone and ignores later request zones for the streak day", async () => {
    const cookie = await authCookie(zoneUserId);
    await answer(cookie, questionIds[0], ["B"], "Asia/Shanghai");
    const stored = await prisma.learnerProfile.findUniqueOrThrow({ where: { userId: zoneUserId } });
    expect(stored).toMatchObject({ timeZone: "Asia/Shanghai", currentStreak: 1, timeZoneUpdatedAt: null });

    // A far-ahead zone may already be "tomorrow"; it must not extend the streak.
    await answer(cookie, questionIds[1], ["B"], "Pacific/Kiritimati");
    const after = await prisma.learnerProfile.findUniqueOrThrow({ where: { userId: zoneUserId } });
    expect(after).toMatchObject({ currentStreak: 1, lastActiveOn: calendarDay(new Date(), "Asia/Shanghai") });
  });

  it("allows a deliberate zone change at most once per 24 hours", async () => {
    const cookie = await authCookie(zoneUserId);
    const profile = { displayName: "", knowledgeBand: null, knowledgeGrade: null };
    const invalid = await updateLearnerProfile(jsonRequest("http://localhost/api/learner/profile", "PATCH", { ...profile, timeZone: "Mars/Olympus" }, cookie));
    expect(invalid.status).toBe(400);

    const first = await updateLearnerProfile(jsonRequest("http://localhost/api/learner/profile", "PATCH", { ...profile, timeZone: "Europe/London" }, cookie));
    expect(first.status).toBe(200);
    expect(await first.json()).toMatchObject({ timeZone: "Europe/London" });

    const second = await updateLearnerProfile(jsonRequest("http://localhost/api/learner/profile", "PATCH", { ...profile, timeZone: "America/New_York" }, cookie));
    expect(second.status).toBe(409);
    const unchanged = await updateLearnerProfile(jsonRequest("http://localhost/api/learner/profile", "PATCH", { ...profile, timeZone: "Europe/London" }, cookie));
    expect(unchanged.status).toBe(200);
  });

  it("awards streak and topic-mastery badges from stored rules", async () => {
    const today = calendarDay(new Date(), "Asia/Shanghai");
    await prisma.learnerProfile.update({
      where: { userId: streakUserId },
      data: { timeZone: "Asia/Shanghai", currentStreak: 2, bestStreak: 2, lastActiveOn: previousCalendarDay(today) },
    });
    const cookie = await authCookie(streakUserId);
    const first = await answer(cookie, questionIds[0], ["B"]);
    expect(first.currentStreak).toBe(3);
    expect(first.newBadges.map(({ name }) => name)).toEqual(expect.arrayContaining(["第一束光", "三日火花"]));

    let awarded: string[] = [];
    for (const questionId of questionIds.slice(1, 5)) {
      awarded = [...awarded, ...(await answer(cookie, questionId, ["B"])).newBadges.map(({ name }) => name)];
    }
    expect(awarded).toContain("主题破冰者");
    const owned = await prisma.learnerBadge.findMany({
      where: { learner: { userId: streakUserId } },
      select: { badge: { select: { slug: true } } },
    });
    expect(owned.map(({ badge }) => badge.slug).sort()).toEqual(["first-spark", "three-day-streak", "topic-explorer"]);
  });

  it("brings a due mastered item back as a long-term check and keeps it mastered after a success", async () => {
    const learner = await prisma.learnerProfile.findUniqueOrThrow({ where: { userId: masteryUserId } });
    const questionId = questionIds[5];
    await prisma.reviewItem.create({ data: {
      learnerId: learner.id, questionId, status: "MASTERED", intervalDays: 30, repetitions: 3, consecutiveCorrect: 3,
      dueAt: new Date(Date.now() - 60_000), lastAttemptAt: new Date(Date.now() - 31 * 86_400_000),
    } });
    const cookie = await authCookie(masteryUserId);
    const response = await nextQuestion(new NextRequest(
      `http://localhost/api/questions/next?mode=adaptive&subject=${prefix}-subject`,
      { headers: { ...integrationHeaders, cookie } },
    ));
    expect(await response.json()).toMatchObject({ id: questionId, recommendation: expect.objectContaining({ kind: "LONG_TERM_REVIEW" }) });

    await answer(cookie, questionId, ["B"]);
    const review = await prisma.reviewItem.findUniqueOrThrow({ where: { learnerId_questionId: { learnerId: learner.id, questionId } } });
    expect(review).toMatchObject({ status: "MASTERED", intervalDays: 60 });

    await prisma.reviewItem.update({ where: { learnerId_questionId: { learnerId: learner.id, questionId } }, data: { dueAt: new Date(Date.now() - 1_000) } });
    await answer(cookie, questionId, ["A"]);
    expect(await prisma.reviewItem.findUniqueOrThrow({ where: { learnerId_questionId: { learnerId: learner.id, questionId } } }))
      .toMatchObject({ status: "ACTIVE", intervalDays: 0 });
  });
});
