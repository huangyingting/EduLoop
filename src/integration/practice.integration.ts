import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { POST as createAttempt } from "@/app/api/attempts/route";
import { GET as getLearner } from "@/app/api/learner/route";
import { GET as getProgress } from "@/app/api/learner/progress/route";
import { GET as nextQuestion } from "@/app/api/questions/next/route";
import { GET as getReview } from "@/app/api/review/route";
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

const prefix = "practice-flow";
const learnerUserId = `${prefix}-learner`;
const profilelessUserId = `${prefix}-profileless`;
const questionIds = Array.from({ length: 12 }, (_, index) => `${prefix}-question-${String(index + 1).padStart(2, "0")}`);
let catalog: CatalogFixture;
let createdBadgeIds: string[] = [];

function getRequest(url: string, cookie?: string) {
  return new NextRequest(url, { headers: { ...integrationHeaders, ...(cookie ? { cookie } : {}) } });
}

async function answer(cookie: string, questionId: string, response: string[]) {
  const result = await createAttempt(jsonRequest("http://localhost/api/attempts", "POST", {
    questionId,
    response,
    clientAttemptId: crypto.randomUUID(),
    timeZone: "Asia/Shanghai",
  }, cookie));
  expect(result.status).toBe(200);
  return result.json() as Promise<{ isCorrect: boolean; newBadges: Array<{ name: string }> }>;
}

beforeAll(async () => {
  catalog = await createCatalogFixture(prefix);
  for (const [index, id] of questionIds.entries()) {
    await createChoiceQuestion(catalog, id, { randomKey: index / questionIds.length });
  }
  await createConsentingUser(learnerUserId);
  await createConsentingUser(profilelessUserId, false);
  createdBadgeIds = [];
  for (const badge of [
    { slug: "first-spark", name: "第一束光", description: "完成第一题", icon: "✦", threshold: 1 },
    { slug: "ten-in-a-row", name: "连胜新星", description: "连续答对 10 题", icon: "⚡", threshold: 10 },
  ]) {
    if (!await prisma.badge.findUnique({ where: { slug: badge.slug } })) {
      createdBadgeIds.push((await prisma.badge.create({ data: badge })).id);
    }
  }
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { id: { in: [learnerUserId, profilelessUserId] } } });
  await catalog.cleanup();
  await prisma.badge.deleteMany({ where: { id: { in: createdBadgeIds } } });
  await prisma.rateLimitBucket.deleteMany();
  await prisma.$disconnect();
});

describe("practice hot paths", () => {
  it("maintains attempt counters and awards the correct-run badge without history scans", async () => {
    const cookie = await authCookie(learnerUserId);
    for (const questionId of questionIds.slice(0, 9)) {
      expect(await answer(cookie, questionId, ["B"])).toMatchObject({ isCorrect: true });
    }
    const tenth = await answer(cookie, questionIds[9], ["B"]);
    expect(tenth.newBadges.map(({ name }) => name)).toContain("连胜新星");
    expect(await prisma.learnerProfile.findUniqueOrThrow({ where: { userId: learnerUserId } }))
      .toMatchObject({ totalAttempts: 10, correctRun: 10 });

    expect(await answer(cookie, questionIds[10], ["A"])).toMatchObject({ isCorrect: false });
    expect(await prisma.learnerProfile.findUniqueOrThrow({ where: { userId: learnerUserId } }))
      .toMatchObject({ totalAttempts: 11, correctRun: 0 });
    const repeated = await answer(cookie, questionIds[11], ["B"]);
    expect(repeated.newBadges).toEqual([]);
  });

  it("serves a targeted question even when the session excludes recent questions", async () => {
    const targeted = questionIds[3];
    const params = new URLSearchParams({
      subject: `${prefix}-subject`,
      questionId: targeted,
      exclude: questionIds.slice(0, 8).join(","),
    });
    const response = await nextQuestion(getRequest(`http://localhost/api/questions/next?${params}`));
    expect(response.status).toBe(200);
    expect((await response.json()).id).toBe(targeted);
  });

  it("prefers questions outside the exclusion list and falls back when all are excluded", async () => {
    const params = new URLSearchParams({ subject: `${prefix}-subject`, exclude: questionIds.slice(0, 11).join(",") });
    const fresh = await nextQuestion(getRequest(`http://localhost/api/questions/next?${params}`));
    expect((await fresh.json()).id).toBe(questionIds[11]);

    const allExcluded = new URLSearchParams({ subject: `${prefix}-subject`, exclude: questionIds.join(",") });
    const fallback = await nextQuestion(getRequest(`http://localhost/api/questions/next?${allExcluded}`));
    expect(fallback.status).toBe(200);
    expect(questionIds).toContain((await fallback.json()).id);
  });

  it("does not create a learner profile when a signed-in account only reads", async () => {
    const cookie = await authCookie(profilelessUserId);
    const summary = await getLearner(getRequest("http://localhost/api/learner?timeZone=Asia%2FShanghai", cookie));
    expect(await summary.json()).toEqual({ xp: 0, level: 1, currentStreak: 0, bestStreak: 0, streakFreezes: 1, todayAttempts: 0 });
    const progress = await getProgress(getRequest("http://localhost/api/learner/progress", cookie));
    expect(await progress.json()).toMatchObject({ summary: { totalAttempts: 0 }, sessions: [], recentMistakes: [] });
    const review = await getReview(getRequest("http://localhost/api/review", cookie));
    expect(await review.json()).toEqual({ dueCount: 0, activeCount: 0, savedCount: 0, reviews: [], saved: [] });
    const question = await nextQuestion(getRequest(`http://localhost/api/questions/next?subject=${prefix}-subject`, cookie));
    expect(question.status).toBe(200);
    expect(await prisma.learnerProfile.count({ where: { userId: profilelessUserId } })).toBe(0);

    await answer(cookie, questionIds[0], ["B"]);
    expect(await prisma.learnerProfile.findUniqueOrThrow({ where: { userId: profilelessUserId } }))
      .toMatchObject({ totalAttempts: 1, correctRun: 1 });
  });
});
