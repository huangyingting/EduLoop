import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PATCH as assessAttempt, POST as createAttempt } from "@/app/api/attempts/route";
import { GET as getLearner } from "@/app/api/learner/route";
import { GET as getProgress } from "@/app/api/learner/progress/route";
import { GET as getSummary } from "@/app/api/learner/summary/route";
import { GET as browseQuestions } from "@/app/api/questions/browse/route";
import { GET as getHint } from "@/app/api/questions/hint/route";
import { GET as getHistory } from "@/app/api/questions/history/route";
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
const unseenUserId = `${prefix}-unseen`;
const profilelessUserId = `${prefix}-profileless`;
const questionIds = Array.from({ length: 12 }, (_, index) => `${prefix}-question-${String(index + 1).padStart(2, "0")}`);
const writtenQuestionId = `${prefix}-written`;
const topicTagSlug = `${prefix}-topic`;
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
  const topic = await prisma.tag.create({ data: { slug: topicTagSlug, label: "练习主题", dimensionId: catalog.topicDimensionId } });
  for (const [index, id] of questionIds.entries()) {
    await createChoiceQuestion(catalog, id, { randomKey: index / questionIds.length, tagIds: index < 6 ? [topic.id] : [] });
  }
  await prisma.question.create({ data: {
    id: writtenQuestionId, sourceId: writtenQuestionId, sourceFile: "integration.json", sourceType: "解答题",
    type: "WRITTEN_RESPONSE", difficulty: "MEDIUM", stem: "写出思路。", answer: "合理即可", status: "PUBLISHED",
    isAutoGradable: false, randomKey: 0.99, subjectId: catalog.subjectId, gradeBandId: catalog.gradeBandId, gradeId: catalog.gradeId,
    tags: { create: { tagId: topic.id } },
  } });
  await createConsentingUser(learnerUserId);
  await createConsentingUser(unseenUserId);
  await createConsentingUser(profilelessUserId, false);
  createdBadgeIds = [];
  for (const badge of [
    { slug: "first-spark", name: "第一束光", description: "完成第一题", icon: "✦", threshold: 1, rule: JSON.stringify({ type: "TOTAL_ATTEMPTS", threshold: 1 }) },
    { slug: "ten-in-a-row", name: "连胜新星", description: "连续答对 10 题", icon: "⚡", threshold: 10, rule: JSON.stringify({ type: "CORRECT_RUN", threshold: 10 }) },
  ]) {
    if (!await prisma.badge.findUnique({ where: { slug: badge.slug } })) {
      createdBadgeIds.push((await prisma.badge.create({ data: badge })).id);
    }
  }
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { id: { in: [learnerUserId, profilelessUserId, unseenUserId] } } });
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

  it("reads progress from subject and topic aggregates, including completed self-assessments", async () => {
    const cookie = await authCookie(learnerUserId);
    const written = await createAttempt(jsonRequest("http://localhost/api/attempts", "POST", {
      questionId: writtenQuestionId, response: "我的思路", clientAttemptId: crypto.randomUUID(),
    }, cookie));
    const { attemptId } = await written.json() as { attemptId: string };
    const learner = await prisma.learnerProfile.findUniqueOrThrow({ where: { userId: learnerUserId } });
    const subjectStat = () => prisma.learnerSubjectStat.findUniqueOrThrow({
      where: { learnerId_subjectId: { learnerId: learner.id, subjectId: catalog.subjectId } },
    });
    expect(await subjectStat()).toMatchObject({ attempts: 12, correct: 11 });

    const assessed = await assessAttempt(jsonRequest("http://localhost/api/attempts", "PATCH", { attemptId, isCorrect: false }, cookie));
    expect(assessed.status).toBe(200);
    expect(await subjectStat()).toMatchObject({ attempts: 13, correct: 11 });

    const progress = await getProgress(getRequest("http://localhost/api/learner/progress", cookie));
    const payload = await progress.json();
    expect(payload.summary).toMatchObject({ totalAttempts: 13, correctRate: 85 });
    expect(payload.subjects).toEqual([expect.objectContaining({ slug: `${prefix}-subject`, attempts: 13, correct: 11, accuracy: 85 })]);
    expect(payload.weakTopics).toEqual([expect.objectContaining({ slug: topicTagSlug, attempts: 7, correct: 6, accuracy: 86 })]);

    const summary = await getSummary(getRequest("http://localhost/api/learner/summary?days=7&timeZone=Asia%2FShanghai", cookie));
    const activity = (await summary.json()).activity as Array<{ attempts: number }>;
    expect(activity).toHaveLength(7);
    expect(activity.at(-1)?.attempts).toBe(13);
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
    const params = new URLSearchParams({ subject: `${prefix}-subject`, exclude: [...questionIds.slice(0, 11), writtenQuestionId].join(",") });
    const fresh = await nextQuestion(getRequest(`http://localhost/api/questions/next?${params}`));
    expect((await fresh.json()).id).toBe(questionIds[11]);

    const allExcluded = new URLSearchParams({ subject: `${prefix}-subject`, exclude: [...questionIds, writtenQuestionId].join(",") });
    const fallback = await nextQuestion(getRequest(`http://localhost/api/questions/next?${allExcluded}`));
    expect(fallback.status).toBe(200);
    expect([...questionIds, writtenQuestionId]).toContain((await fallback.json()).id);
  });

  it("serves approved question-specific hints step by step and halves the bonus after hints", async () => {
    const hinted = `${prefix}-hinted`;
    await createChoiceQuestion(catalog, hinted, { difficulty: "HARD", randomKey: 0.995 });
    await prisma.questionHint.createMany({ data: [
      { questionId: hinted, position: 0, content: "这道题考查：加法。", source: "DERIVED" },
      { questionId: hinted, position: 1, content: "可以先从这里入手：把两个数合起来……", source: "CURATED" },
      { questionId: hinted, position: 2, content: "草稿提示", source: "CURATED", reviewStatus: "DRAFT" },
    ] });

    const payload = await (await nextQuestion(getRequest(`http://localhost/api/questions/next?questionId=${hinted}`))).json();
    expect(payload).toMatchObject({ hasHint: true, hintCount: 2 });
    const first = await getHint(getRequest(`http://localhost/api/questions/hint?questionId=${hinted}&step=0`));
    expect(await first.json()).toEqual({ kind: "HINT", hint: "这道题考查：加法。", step: 0, total: 2 });
    const second = await getHint(getRequest(`http://localhost/api/questions/hint?questionId=${hinted}&step=1`));
    expect((await second.json()).hint).toContain("合起来");
    expect((await getHint(getRequest(`http://localhost/api/questions/hint?questionId=${hinted}&step=2`))).status).toBe(404);

    const cookie = await authCookie(learnerUserId);
    const result = await createAttempt(jsonRequest("http://localhost/api/attempts", "POST", {
      questionId: hinted, response: ["B"], clientAttemptId: crypto.randomUUID(), hintsUsed: 2,
    }, cookie));
    expect(await result.json()).toMatchObject({ isCorrect: true, earnedXp: 11 });
    expect(await prisma.practiceAttempt.findFirstOrThrow({ where: { questionId: hinted } })).toMatchObject({ hintsUsed: 2 });
  });

  it("serves every unseen question before repeating one", async () => {
    const cookie = await authCookie(unseenUserId);
    const pool = await prisma.question.findMany({ where: { subjectId: catalog.subjectId, status: "PUBLISHED" }, select: { id: true } });
    const served = new Set<string>();
    for (let index = 0; index < pool.length; index += 1) {
      const response = await nextQuestion(getRequest(`http://localhost/api/questions/next?subject=${prefix}-subject`, cookie));
      const question = await response.json() as { id: string; options: unknown[] };
      expect(served.has(question.id)).toBe(false);
      served.add(question.id);
      await createAttempt(jsonRequest("http://localhost/api/attempts", "POST", {
        questionId: question.id,
        response: question.options.length ? ["B"] : "思路",
        clientAttemptId: crypto.randomUUID(),
      }, cookie));
    }
    expect(served.size).toBe(pool.length);
  });

  it("targets adaptive questions near the learner's rated ability", async () => {
    const learner = await prisma.learnerProfile.findUniqueOrThrow({ where: { userId: learnerUserId } });
    const easyId = `${prefix}-rated-easy`;
    const hardId = `${prefix}-rated-hard`;
    // Adaptive mode first narrows to the learner's weakest topic, so the rated
    // candidates share that topic.
    const topic = await prisma.tag.findFirstOrThrow({ where: { slug: topicTagSlug } });
    await createChoiceQuestion(catalog, easyId, { randomKey: 0.001, tagIds: [topic.id] });
    await createChoiceQuestion(catalog, hardId, { randomKey: 0.002, tagIds: [topic.id] });
    await prisma.question.update({ where: { id: easyId }, data: { difficultyScore: 0.1 } });
    await prisma.question.update({ where: { id: hardId }, data: { difficultyScore: 4 } });
    await prisma.learnerSubjectStat.update({
      where: { learnerId_subjectId: { learnerId: learner.id, subjectId: catalog.subjectId } },
      data: { rating: 3.6 },
    });
    await prisma.reviewItem.deleteMany({ where: { learnerId: learner.id } });
    const cookie = await authCookie(learnerUserId);
    const response = await nextQuestion(getRequest(`http://localhost/api/questions/next?mode=adaptive&subject=${prefix}-subject`, cookie));
    const question = await response.json() as { id: string; recommendationReason: string };
    expect(question.id).toBe(hardId);
    expect(question.recommendationReason).toContain("难度贴近你目前的水平");
  });

  it("shows a learner their own history for a question and an answer-free browse list", async () => {
    const cookie = await authCookie(learnerUserId);
    const payload = await (await nextQuestion(getRequest(`http://localhost/api/questions/next?questionId=${questionIds[0]}`, cookie))).json();
    expect(payload.history).toMatchObject({ attempts: 1, correct: 1, lastResult: true });
    const history = await (await getHistory(getRequest(`http://localhost/api/questions/history?questionId=${questionIds[0]}`, cookie))).json();
    expect(history.attempts).toEqual([expect.objectContaining({ isCorrect: true, response: ["B"], hintsUsed: 0 })]);

    const browse = await (await browseQuestions(getRequest(`http://localhost/api/questions/browse?subject=${prefix}-subject&page=1`, cookie))).json();
    expect(browse.total).toBeGreaterThanOrEqual(13);
    expect(browse.items.find((item: { id: string }) => item.id === questionIds[0])).toMatchObject({ attempts: 1, lastResult: true });
    expect(JSON.stringify(browse)).not.toMatch(/correctAnswer|explanation/);
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
