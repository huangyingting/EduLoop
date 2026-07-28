import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GET as getCatalog } from "@/app/api/catalog/route";
import { DELETE as deleteLearner, GET as getLearner } from "@/app/api/learner/route";
import { GET as getHealth } from "@/app/api/health/route";
import { GET as getProgress } from "@/app/api/learner/progress/route";
import { GET as exportLearner } from "@/app/api/learner/export/route";
import { PATCH as assessAttempt, POST as createAttempt } from "@/app/api/attempts/route";
import { GET as getQuestionHint } from "@/app/api/questions/hint/route";
import { GET as nextQuestion } from "@/app/api/questions/next/route";
import { POST as createReport } from "@/app/api/reports/route";
import { GET as getReview, POST as saveQuestion } from "@/app/api/review/route";
import { POST as createSession } from "@/app/api/sessions/route";
import { prisma } from "@/lib/prisma";
import { calendarDay, calendarDaysBefore } from "@/lib/dates";
import { createSessionRecord, getSessionUser, hashSessionToken, MAX_ACTIVE_SESSIONS, SESSION_COOKIE } from "@/lib/auth";
import { linkLearnerToUser } from "@/lib/learner-identity";

const deviceKey = "guest_integration_device";
const shieldDeviceKey = "guest_integration_shield";
const subjectId = "integration-subject";
const bandId = "integration-band";
const gradeId = "integration-grade";
const choiceId = "integration-choice-question";
const writtenId = "integration-written-question";
const scienceSubjectId = "integration-science-subject";
const scienceQuestionId = "integration-science-question";
const topicDimensionId = "integration-topic-dimension";
const mathTopicId = "integration-math-topic";
const scienceTopicId = "integration-science-topic";
const headers = { "content-type": "application/json", "x-forwarded-for": "198.51.100.42" };
const authUserId = "integration-auth-user";
const authLearnerKey = "account_integration_device";
const authGuestKey = "guest_auth_integration_device";

function request(url: string, method: string, body: unknown) {
  return new Request(url, { method, headers, body: JSON.stringify(body) });
}

beforeAll(async () => {
  await prisma.subject.create({ data: { id: subjectId, slug: "integration-math", name: "测试数学", icon: "∑", color: "#6c5ce7" } });
  await prisma.subject.create({ data: { id: scienceSubjectId, slug: "integration-science", name: "测试科学", icon: "◇", color: "#2c9b73" } });
  await prisma.gradeBand.create({ data: { id: bandId, slug: "integration-middle", name: "测试初中" } });
  await prisma.grade.create({ data: { id: gradeId, slug: "integration-grade-7", name: "测试七年级", sortOrder: 7, gradeBandId: bandId } });
  await prisma.tagDimension.create({ data: { id: topicDimensionId, key: "TOPIC", label: "知识主题", sortOrder: 0 } });
  await prisma.tag.create({ data: { id: mathTopicId, dimensionId: topicDimensionId, slug: "integration-arithmetic", label: "测试运算" } });
  await prisma.tag.create({ data: { id: scienceTopicId, dimensionId: topicDimensionId, slug: "integration-laboratory", label: "测试实验" } });
  await prisma.badge.create({ data: { id: "integration-badge", slug: "first-spark", name: "第一束光", description: "完成第一题", icon: "✦", threshold: 1 } });
  await prisma.question.create({ data: {
    id: choiceId, sourceId: choiceId, sourceFile: "integration.json", sourceType: "单选题", type: "SINGLE_CHOICE",
    difficulty: "EASY", stem: "1 + 1 等于？", answer: "B", correctAnswer: JSON.stringify(["B"]), explanation: "1 + 1 = 2。",
    status: "PUBLISHED", isAutoGradable: true, optionSplit: true, subjectId, gradeBandId: bandId, gradeId,
    options: { create: [{ label: "A", content: "1", sortOrder: 0 }, { label: "B", content: "2", sortOrder: 1 }] },
    tags: { create: { tagId: mathTopicId } },
  } });
  await prisma.question.create({ data: {
    id: writtenId, sourceId: writtenId, sourceFile: "integration.json", sourceType: "解答题", type: "WRITTEN_RESPONSE",
    difficulty: "MEDIUM", stem: "写出你的解题思路。", answer: "合理即可", explanation: "检查步骤是否完整。",
    status: "PUBLISHED", isAutoGradable: false, subjectId, gradeBandId: bandId, gradeId,
  } });
  await prisma.question.create({ data: {
    id: scienceQuestionId, sourceId: scienceQuestionId, sourceFile: "integration.json", sourceType: "解答题", type: "WRITTEN_RESPONSE",
    difficulty: "MEDIUM", stem: "描述实验步骤。", answer: "合理即可", explanation: "先控制变量。",
    status: "PUBLISHED", isAutoGradable: false, subjectId: scienceSubjectId, gradeBandId: bandId, gradeId,
    tags: { create: { tagId: scienceTopicId } },
  } });
});

afterAll(async () => {
  await prisma.learnerProfile.deleteMany({ where: { deviceKey: { in: [authLearnerKey, authGuestKey] } } });
  await prisma.user.deleteMany({ where: { id: authUserId } });
  await prisma.learnerProfile.deleteMany({ where: { deviceKey: { in: [deviceKey, shieldDeviceKey] } } });
  await prisma.question.deleteMany({ where: { id: { in: [choiceId, writtenId, scienceQuestionId] } } });
  await prisma.badge.deleteMany({ where: { id: "integration-badge" } });
  await prisma.tag.deleteMany({ where: { id: { in: [mathTopicId, scienceTopicId] } } });
  await prisma.tagDimension.deleteMany({ where: { id: topicDimensionId } });
  await prisma.grade.deleteMany({ where: { id: gradeId } });
  await prisma.gradeBand.deleteMany({ where: { id: bandId } });
  await prisma.subject.deleteMany({ where: { id: { in: [subjectId, scienceSubjectId] } } });
  await prisma.$disconnect();
});

describe("learner API journey", () => {
  it("merges anonymous progress into an account and resolves it from the session", async () => {
    await prisma.user.create({ data: {
      id: authUserId,
      email: "integration@example.com",
      passwordHash: "not-used-by-this-test",
      displayName: "测试探索者",
      learner: { create: { deviceKey: authLearnerKey, xp: 20, level: 1 } },
    } });
    await prisma.learnerProfile.create({ data: {
      deviceKey: authGuestKey,
      xp: 13,
      level: 1,
      savedQuestions: { create: { questionId: choiceId } },
      badges: { create: { badgeId: "integration-badge" } },
      activities: { create: { activityDate: "2026-07-27", attempts: 1, correct: 1, earnedXp: 13 } },
    } });

    const merged = await linkLearnerToUser(authUserId, authGuestKey);
    expect(merged).toMatchObject({ userId: authUserId, deviceKey: authLearnerKey, xp: 33 });
    expect(await prisma.learnerProfile.findUnique({ where: { deviceKey: authGuestKey } })).toBeNull();
    expect(await prisma.savedQuestion.count({ where: { learnerId: merged.id, questionId: choiceId } })).toBe(1);
    expect(await prisma.learnerBadge.count({ where: { learnerId: merged.id, badgeId: "integration-badge" } })).toBe(1);

    const token = "integration-session-token";
    await prisma.authSession.create({ data: {
      tokenHash: hashSessionToken(token),
      userId: authUserId,
      expiresAt: new Date(Date.now() + 60_000),
    } });
    const authenticatedRequest = new NextRequest(`http://localhost/api/learner?deviceKey=${authGuestKey}`, {
      headers: { cookie: `${SESSION_COOKIE}=${token}` },
    });
    expect(await getSessionUser(authenticatedRequest)).toMatchObject({ id: authUserId, email: "integration@example.com" });
    const response = await getLearner(authenticatedRequest);
    expect(await response.json()).toMatchObject({ xp: 33, level: 1 });

    for (let index = 0; index < MAX_ACTIVE_SESSIONS + 2; index += 1) {
      await createSessionRecord(authUserId, new Date(Date.now() + index));
    }
    expect(await prisma.authSession.count({ where: { userId: authUserId } })).toBe(MAX_ACTIVE_SESSIONS);
    expect(await prisma.authSession.findUnique({ where: { tokenHash: hashSessionToken(token) } })).toBeNull();
  });

  it("uses a streak shield after exactly one missed calendar day", async () => {
    const today = calendarDay(new Date(), "Asia/Shanghai");
    await prisma.learnerProfile.create({ data: {
      deviceKey: shieldDeviceKey,
      currentStreak: 5,
      bestStreak: 5,
      streakFreezes: 1,
      lastActiveOn: calendarDaysBefore(today, 2),
    } });

    const response = await createAttempt(request("http://localhost/api/attempts", "POST", {
      deviceKey: shieldDeviceKey,
      questionId: choiceId,
      response: ["B"],
      timeZone: "Asia/Shanghai",
    }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      currentStreak: 6,
      streakFreezes: 0,
      streakFreezeUsed: true,
    });
    expect(await prisma.learnerProfile.findUniqueOrThrow({ where: { deviceKey: shieldDeviceKey } })).toMatchObject({
      currentStreak: 6,
      streakFreezes: 0,
      lastFreezeUsedOn: today,
      lastActiveOn: today,
    });
  });

  it("returns grades and subject-specific topics for cascading practice filters", async () => {
    const response = await getCatalog(new NextRequest("http://localhost/api/catalog?gradeBand=integration-middle&subject=integration-math"));
    expect(response.status).toBe(200);
    const catalog = await response.json() as {
      subjects: Array<{ slug: string; name: string }>;
      gradeBands: Array<{ slug: string; name: string }>;
      grades: Array<{ slug: string; name: string }>;
      topics: Array<{ slug: string; label: string }>;
    };
    expect(catalog.gradeBands).toContainEqual({ slug: "integration-middle", name: "测试初中" });
    expect(catalog.grades).toEqual([{ slug: "integration-grade-7", name: "测试七年级" }]);
    expect(catalog.subjects).toEqual(expect.arrayContaining([
      { slug: "integration-math", name: "测试数学" },
      { slug: "integration-science", name: "测试科学" },
    ]));
    expect(catalog.topics).toEqual([{ slug: "integration-arithmetic", label: "测试运算" }]);
  });

  it("rejects malformed and unbounded question filters", async () => {
    const unsafeSlug = await nextQuestion(new NextRequest("http://localhost/api/questions/next?subject=..%2Fmath"));
    expect(unsafeSlug.status).toBe(400);
    expect(await unsafeSlug.json()).toEqual({ error: "Invalid question filters", code: "INVALID_REQUEST" });

    const tooManyExcluded = Array.from({ length: 21 }, (_, index) => `question_${index}`).join(",");
    const oversized = await nextQuestion(new NextRequest(`http://localhost/api/questions/next?exclude=${tooManyExcluded}`));
    expect(oversized.status).toBe(400);
  });

  it("creates a session, grades a miss, schedules review, saves, reports, and exposes progress", async () => {
    const sessionResponse = await createSession(request("http://localhost/api/sessions", "POST", { deviceKey, questionGoal: 10, filters: { subject: "integration-math" } }));
    expect(sessionResponse.status).toBe(201);
    let session = await sessionResponse.json() as { id: string };
    const resumedResponse = await createSession(request("http://localhost/api/sessions", "POST", { deviceKey, questionGoal: 10, filters: { subject: "integration-math" } }));
    expect(resumedResponse.status).toBe(200);
    expect(await resumedResponse.json()).toMatchObject({ id: session.id, resumed: true, completedCount: 0 });

    const restartedResponse = await createSession(request("http://localhost/api/sessions", "POST", { deviceKey, questionGoal: 10, filters: { subject: "integration-math" }, restart: true }));
    expect(restartedResponse.status).toBe(201);
    const restarted = await restartedResponse.json() as { id: string; resumed: boolean };
    expect(restarted).toMatchObject({ resumed: false });
    expect(restarted.id).not.toBe(session.id);
    expect(await prisma.practiceSession.findUniqueOrThrow({ where: { id: session.id } })).toMatchObject({ status: "ABANDONED" });
    session = restarted;

    const questionResponse = await nextQuestion(new NextRequest(`http://localhost/api/questions/next?subject=integration-math&autoGradable=true&deviceKey=${deviceKey}`));
    expect(questionResponse.status).toBe(200);
    const question = await questionResponse.json() as { id: string; hasHint: boolean; correctAnswer?: unknown; explanation?: unknown };
    expect(question).toMatchObject({ id: choiceId, hasHint: true });
    expect(question).not.toHaveProperty("correctAnswer");
    expect(question).not.toHaveProperty("explanation");

    const hintResponse = await getQuestionHint(new NextRequest(`http://localhost/api/questions/hint?questionId=${choiceId}&deviceKey=${deviceKey}`, { headers }));
    expect(hintResponse.status).toBe(200);
    const hint = await hintResponse.json() as { hint: string };
    expect(hint.hint).toContain("逐项排除");
    expect(hint.hint).not.toContain("1 + 1 = 2");

    const attemptInput = { deviceKey, questionId: choiceId, response: ["A"], sessionId: session.id, timeZone: "Asia/Shanghai", clientAttemptId: "4dd94422-4c24-4f39-a5fc-35f494d31ea2" };
    const attemptResponse = await createAttempt(request("http://localhost/api/attempts", "POST", attemptInput));
    expect(attemptResponse.status).toBe(200);
    const attempt = await attemptResponse.json() as { isCorrect: boolean; session: { completedCount: number } };
    expect(attempt).toMatchObject({ isCorrect: false, session: { completedCount: 1 } });
    const replayResponse = await createAttempt(request("http://localhost/api/attempts", "POST", attemptInput));
    expect(await replayResponse.json()).toMatchObject({ replayed: true, totalXp: 2, session: { completedCount: 1 } });
    expect(await prisma.practiceAttempt.count({ where: { clientAttemptId: attemptInput.clientAttemptId } })).toBe(1);

    expect((await saveQuestion(request("http://localhost/api/review", "POST", { deviceKey, questionId: choiceId, saved: true }))).status).toBe(200);
    const review = await (await getReview(new NextRequest(`http://localhost/api/review?deviceKey=${deviceKey}`))).json() as { dueCount: number; savedCount: number };
    expect(review).toMatchObject({ dueCount: 1, savedCount: 1 });
    const adaptiveQuestion = await (await nextQuestion(new NextRequest(`http://localhost/api/questions/next?subject=integration-math&mode=review&deviceKey=${deviceKey}`))).json() as { id: string; recommendationReason: string };
    expect(adaptiveQuestion).toMatchObject({ id: choiceId, recommendationReason: "复习一题到期的薄弱知识" });

    expect((await createReport(request("http://localhost/api/reports", "POST", { deviceKey, questionId: choiceId, category: "UNCLEAR" }))).status).toBe(201);
    const progress = await (await getProgress(new NextRequest(`http://localhost/api/learner/progress?deviceKey=${deviceKey}&timeZone=Asia%2FShanghai`))).json() as { summary: { totalAttempts: number; xp: number }; recentMistakes: unknown[] };
    expect(progress.summary).toMatchObject({ totalAttempts: 1, xp: 2 });
    expect(progress.recentMistakes).toHaveLength(1);

    const learner = await prisma.learnerProfile.findUniqueOrThrow({ where: { deviceKey } });
    const futureDueAt = new Date(Date.now() + 86_400_000);
    await prisma.reviewItem.update({ where: { learnerId_questionId: { learnerId: learner.id, questionId: choiceId } }, data: { dueAt: futureDueAt } });
    await createAttempt(request("http://localhost/api/attempts", "POST", { deviceKey, questionId: choiceId, response: ["B"], timeZone: "Asia/Shanghai" }));
    expect(await prisma.reviewItem.findUniqueOrThrow({ where: { learnerId_questionId: { learnerId: learner.id, questionId: choiceId } } })).toMatchObject({ intervalDays: 0, consecutiveCorrect: 0, dueAt: futureDueAt });

    await prisma.reviewItem.update({ where: { learnerId_questionId: { learnerId: learner.id, questionId: choiceId } }, data: { dueAt: new Date(Date.now() - 1_000) } });
    await createAttempt(request("http://localhost/api/attempts", "POST", { deviceKey, questionId: choiceId, response: ["B"], timeZone: "Asia/Shanghai" }));
    expect(await prisma.reviewItem.findUniqueOrThrow({ where: { learnerId_questionId: { learnerId: learner.id, questionId: choiceId } } })).toMatchObject({ intervalDays: 1, consecutiveCorrect: 1 });

    const updatedProgress = await (await getProgress(new NextRequest(`http://localhost/api/learner/progress?deviceKey=${deviceKey}&timeZone=Asia%2FShanghai`))).json() as { weakTopics: Array<{ slug: string; subject: string }> };
    expect(updatedProgress.weakTopics).toContainEqual(expect.objectContaining({ slug: "integration-arithmetic", subject: "integration-math" }));
    const topicAdaptive = await (await nextQuestion(new NextRequest(`http://localhost/api/questions/next?subject=integration-math&mode=adaptive&deviceKey=${deviceKey}`))).json() as { id: string; recommendationReason: string };
    expect(topicAdaptive).toMatchObject({
      id: choiceId,
      recommendationReason: "结合最近正确率和答题用时，重点巩固测试运算",
    });

    const health = await getHealth(new Request("http://localhost/api/health", { headers }));
    expect(health.status).toBe(200);
    expect(health.headers.get("x-request-id")).toBeTruthy();
  });

  it("requires explicit self-assessment for written work and supports data deletion", async () => {
    const attemptResponse = await createAttempt(request("http://localhost/api/attempts", "POST", { deviceKey, questionId: writtenId, response: "测试思路", timeZone: "Asia/Shanghai" }));
    const attempt = await attemptResponse.json() as { attemptId: string; isCorrect: boolean | null };
    expect(attempt.isCorrect).toBeNull();

    const learner = await prisma.learnerProfile.findUniqueOrThrow({ where: { deviceKey } });
    const activityDate = calendarDay(new Date(), "Asia/Shanghai");
    const before = await prisma.dailyActivity.findUniqueOrThrow({
      where: { learnerId_activityDate: { learnerId: learner.id, activityDate } },
    });
    const assessmentInput = { deviceKey, attemptId: attempt.attemptId, isCorrect: true, timeZone: "Asia/Shanghai" };
    const assessmentResponses = await Promise.all([
      assessAttempt(request("http://localhost/api/attempts", "PATCH", assessmentInput)),
      assessAttempt(request("http://localhost/api/attempts", "PATCH", assessmentInput)),
    ]);
    expect(assessmentResponses.map(({ status }) => status).sort()).toEqual([200, 409]);
    expect(await assessmentResponses[0].json()).toMatchObject(
      assessmentResponses[0].status === 200 ? { isCorrect: true } : { error: "Attempt already assessed" },
    );
    const after = await prisma.dailyActivity.findUniqueOrThrow({
      where: { learnerId_activityDate: { learnerId: learner.id, activityDate } },
    });
    expect(after.correct).toBe(before.correct + 1);

    const exportResponse = await exportLearner(new NextRequest(`http://localhost/api/learner/export?deviceKey=${deviceKey}`, { headers }));
    expect(exportResponse.status).toBe(200);
    expect(exportResponse.headers.get("content-disposition")).toContain("eduloop-learning-data-");
    const exported = await exportResponse.json() as { learner: { attempts: unknown[]; deviceKey?: string; id?: string } };
    expect(exported.learner.attempts.length).toBeGreaterThanOrEqual(1);
    expect(exported.learner).not.toHaveProperty("deviceKey");
    expect(exported.learner).not.toHaveProperty("id");

    const deleteResponse = await deleteLearner(new NextRequest(`http://localhost/api/learner?deviceKey=${deviceKey}`, { method: "DELETE", headers }));
    expect(await deleteResponse.json()).toEqual({ deleted: true });
    expect(await prisma.learnerProfile.findUnique({ where: { deviceKey } })).toBeNull();
  });
});
