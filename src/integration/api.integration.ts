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
import { GET as getStudioReports, PATCH as updateStudioReport } from "@/app/api/studio/reports/route";
import { GET as getStudioMetrics } from "@/app/api/studio/metrics/route";
import { prisma } from "@/lib/prisma";
import { changeAccountPassword, deleteAccount } from "@/lib/account";
import { calendarDay, calendarDaysBefore } from "@/lib/dates";
import { createSessionRecord, getSessionUser, hashPassword, hashSessionToken, MAX_ACTIVE_SESSIONS, SESSION_COOKIE, verifyPassword } from "@/lib/auth";
import { linkLearnerToUser } from "@/lib/learner-identity";

const deviceKey = "guest_integration_device";
const shieldDeviceKey = "guest_integration_shield";
const concurrentDeviceKey = "guest_integration_concurrent";
const subjectId = "integration-subject";
const bandId = "integration-band";
const gradeId = "integration-grade";
const choiceId = "integration-choice-question";
const writtenId = "integration-written-question";
const scienceSubjectId = "integration-science-subject";
const scienceQuestionId = "integration-science-question";
const topicDimensionId = "integration-topic-dimension";
const skillDimensionId = "integration-skill-dimension";
const mathTopicId = "integration-math-topic";
const scienceTopicId = "integration-science-topic";
const mathSkillId = "integration-math-skill";
const headers = { "content-type": "application/json", "x-forwarded-for": "198.51.100.42" };
const authUserId = "integration-auth-user";
const authLearnerKey = "account_integration_device";
const authGuestKey = "guest_auth_integration_device";
const lifecycleUserId = "integration-lifecycle-user";
const lifecycleLearnerKey = "account_lifecycle_integration";
const studioOperatorId = "integration-studio-operator";
const studioLearnerId = "integration-studio-learner";
const studioReporterKey = "guest_studio_reporter";
const studioReportId = "integration-studio-report";

function request(url: string, method: string, body: unknown) {
  return new Request(url, { method, headers, body: JSON.stringify(body) });
}

beforeAll(async () => {
  await prisma.subject.create({ data: { id: subjectId, slug: "integration-math", name: "测试数学", icon: "∑", color: "#6c5ce7" } });
  await prisma.subject.create({ data: { id: scienceSubjectId, slug: "integration-science", name: "测试科学", icon: "◇", color: "#2c9b73" } });
  await prisma.gradeBand.create({ data: { id: bandId, slug: "integration-middle", name: "测试初中" } });
  await prisma.grade.create({ data: { id: gradeId, slug: "integration-grade-7", name: "测试七年级", sortOrder: 7, gradeBandId: bandId } });
  await prisma.tagDimension.create({ data: { id: topicDimensionId, key: "TOPIC", label: "知识主题", sortOrder: 0 } });
  await prisma.tagDimension.create({ data: { id: skillDimensionId, key: "SKILL", label: "能力维度", sortOrder: 1 } });
  await prisma.tag.create({ data: { id: mathTopicId, dimensionId: topicDimensionId, slug: "integration-arithmetic", label: "测试运算" } });
  await prisma.tag.create({ data: { id: scienceTopicId, dimensionId: topicDimensionId, slug: "integration-laboratory", label: "测试实验" } });
  await prisma.tag.create({ data: { id: mathSkillId, dimensionId: skillDimensionId, slug: "integration-quantitative", label: "测试计算推理" } });
  await prisma.badge.create({ data: { id: "integration-badge", slug: "first-spark", name: "第一束光", description: "完成第一题", icon: "✦", threshold: 1 } });
  await prisma.question.create({ data: {
    id: choiceId, sourceId: choiceId, sourceFile: "integration.json", sourceType: "单选题", type: "SINGLE_CHOICE",
    difficulty: "EASY", stem: "1 + 1 等于？", answer: "B", correctAnswer: JSON.stringify(["B"]), explanation: "1 + 1 = 2。",
    status: "PUBLISHED", isAutoGradable: true, optionSplit: true, subjectId, gradeBandId: bandId, gradeId,
    options: { create: [{ label: "A", content: "1", sortOrder: 0 }, { label: "B", content: "2", sortOrder: 1 }] },
    tags: { create: [{ tagId: mathTopicId }, { tagId: mathSkillId }] },
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
  await prisma.learnerProfile.deleteMany({ where: { deviceKey: lifecycleLearnerKey } });
  await prisma.user.deleteMany({ where: { id: { in: [authUserId, lifecycleUserId, studioOperatorId, studioLearnerId] } } });
  await prisma.learnerProfile.deleteMany({ where: { deviceKey: { in: [deviceKey, shieldDeviceKey, concurrentDeviceKey, studioReporterKey] } } });
  await prisma.question.deleteMany({ where: { id: { in: [choiceId, writtenId, scienceQuestionId] } } });
  await prisma.badge.deleteMany({ where: { id: "integration-badge" } });
  await prisma.tag.deleteMany({ where: { id: { in: [mathTopicId, scienceTopicId, mathSkillId] } } });
  await prisma.tagDimension.deleteMany({ where: { id: { in: [topicDimensionId, skillDimensionId] } } });
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

    const authenticatedAttempt = await createAttempt(new NextRequest("http://localhost/api/attempts", {
      method: "POST",
      headers: { ...headers, cookie: `${SESSION_COOKIE}=${token}` },
      body: JSON.stringify({
        deviceKey: "spoofed_guest_device",
        questionId: choiceId,
        response: ["B"],
        timeZone: "Asia/Shanghai",
        clientAttemptId: "927160d2-bd5b-4348-9504-f0466beb3a80",
      }),
    }));
    expect(authenticatedAttempt.status).toBe(200);
    expect(await authenticatedAttempt.json()).toMatchObject({ totalXp: 43, isCorrect: true });
    expect(await prisma.learnerProfile.findUnique({ where: { deviceKey: "spoofed_guest_device" } })).toBeNull();
    expect(await prisma.learnerProfile.findUniqueOrThrow({ where: { userId: authUserId } })).toMatchObject({ xp: 43 });

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

    const projectedHeader = await getLearner(new NextRequest(
      `http://localhost/api/learner?deviceKey=${shieldDeviceKey}&timeZone=Asia%2FShanghai`,
    ));
    expect(await projectedHeader.json()).toMatchObject({ currentStreak: 5, streakFreezes: 1 });
    const projectedProgress = await getProgress(new NextRequest(
      `http://localhost/api/learner/progress?deviceKey=${shieldDeviceKey}&timeZone=Asia%2FShanghai`,
    ));
    expect(await projectedProgress.json()).toMatchObject({ summary: { currentStreak: 5 } });

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

  it("rotates account passwords, revokes sessions, and erases the full account", async () => {
    const oldPassword = "old-password-123";
    const newPassword = "new-password-456";
    await prisma.user.create({ data: {
      id: lifecycleUserId,
      email: "lifecycle@example.com",
      passwordHash: await hashPassword(oldPassword),
      learner: { create: { deviceKey: lifecycleLearnerKey, xp: 17 } },
      sessions: { create: { tokenHash: hashSessionToken("lifecycle-old-session"), expiresAt: new Date(Date.now() + 60_000) } },
    } });

    expect(await changeAccountPassword(lifecycleUserId, "wrong-password", newPassword)).toBe("INVALID_PASSWORD");
    expect(await changeAccountPassword(lifecycleUserId, oldPassword, oldPassword)).toBe("UNCHANGED");
    expect(await changeAccountPassword(lifecycleUserId, oldPassword, newPassword)).toBe("UPDATED");
    const updated = await prisma.user.findUniqueOrThrow({ where: { id: lifecycleUserId } });
    expect(await verifyPassword(newPassword, updated.passwordHash)).toBe(true);
    expect(await prisma.authSession.count({ where: { userId: lifecycleUserId } })).toBe(0);

    await prisma.authSession.create({ data: {
      userId: lifecycleUserId,
      tokenHash: hashSessionToken("lifecycle-new-session"),
      expiresAt: new Date(Date.now() + 60_000),
    } });
    expect(await deleteAccount(lifecycleUserId, "wrong-password")).toBe(false);
    expect(await deleteAccount(lifecycleUserId, newPassword)).toBe(true);
    expect(await prisma.user.findUnique({ where: { id: lifecycleUserId } })).toBeNull();
    expect(await prisma.learnerProfile.findUnique({ where: { deviceKey: lifecycleLearnerKey } })).toBeNull();
    expect(await prisma.authSession.count({ where: { userId: lifecycleUserId } })).toBe(0);
  });

  it("returns grades and dimension-aware tags for cascading practice filters", async () => {
    const response = await getCatalog(new NextRequest("http://localhost/api/catalog?gradeBand=integration-middle&subject=integration-math"));
    expect(response.status).toBe(200);
    const catalog = await response.json() as {
      subjects: Array<{ slug: string; name: string }>;
      gradeBands: Array<{ slug: string; name: string }>;
      grades: Array<{ slug: string; name: string }>;
      topics: Array<{ slug: string; label: string }>;
      tagDimensions: Array<{ key: string; label: string; tags: Array<{ slug: string; label: string }> }>;
    };
    expect(catalog.gradeBands).toContainEqual({ slug: "integration-middle", name: "测试初中" });
    expect(catalog.grades).toEqual([{ slug: "integration-grade-7", name: "测试七年级" }]);
    expect(catalog.subjects).toEqual(expect.arrayContaining([
      { slug: "integration-math", name: "测试数学" },
      { slug: "integration-science", name: "测试科学" },
    ]));
    expect(catalog.topics).toEqual([{ slug: "integration-arithmetic", label: "测试运算" }]);
    expect(catalog.tagDimensions).toContainEqual({
      key: "TOPIC",
      label: "知识主题",
      tags: [{ slug: "integration-arithmetic", label: "测试运算" }],
    });
    expect(catalog.tagDimensions).toContainEqual({
      key: "SKILL",
      label: "能力维度",
      tags: [{ slug: "integration-quantitative", label: "测试计算推理" }],
    });

    const filtered = await nextQuestion(new NextRequest(
      "http://localhost/api/questions/next?subject=integration-math&tags=SKILL%3Aintegration-quantitative",
    ));
    expect(filtered.status).toBe(200);
    expect(await filtered.json()).toMatchObject({ id: choiceId });
  });

  it("rejects malformed and unbounded question filters", async () => {
    const unsafeSlug = await nextQuestion(new NextRequest("http://localhost/api/questions/next?subject=..%2Fmath", {
      headers: { "x-request-id": "integration-invalid-filters" },
    }));
    expect(unsafeSlug.status).toBe(400);
    expect(await unsafeSlug.json()).toEqual({ error: "Invalid question filters", code: "INVALID_REQUEST" });
    expect(unsafeSlug.headers.get("x-request-id")).toBe("integration-invalid-filters");

    const tooManyExcluded = Array.from({ length: 21 }, (_, index) => `question_${index}`).join(",");
    const oversized = await nextQuestion(new NextRequest(`http://localhost/api/questions/next?exclude=${tooManyExcluded}`));
    expect(oversized.status).toBe(400);
  });

  it("reuses a small filtered pool after recent exclusions exhaust it", async () => {
    const response = await nextQuestion(new NextRequest(
      `http://localhost/api/questions/next?subject=integration-math&autoGradable=true&exclude=${choiceId}`,
    ));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ id: choiceId });
  });

  it("loads a targeted published question without exposing its answer", async () => {
    const response = await nextQuestion(new NextRequest(
      `http://localhost/api/questions/next?questionId=${writtenId}&subject=integration-math`,
    ));

    expect(response.status).toBe(200);
    const question = await response.json() as { id: string; answer?: unknown; explanation?: unknown };
    expect(question).toMatchObject({ id: writtenId });
    expect(question).not.toHaveProperty("answer");
    expect(question).not.toHaveProperty("explanation");
  });

  it("records concurrent first attempts without losing progress or duplicating badges", async () => {
    const attempts = [
      "b3496bea-4c66-4e2d-a4e5-6496e6126966",
      "ba6839b3-b85a-43f8-95d8-7020a0defaba",
    ].map((clientAttemptId) => createAttempt(request("http://localhost/api/attempts", "POST", {
      deviceKey: concurrentDeviceKey,
      questionId: choiceId,
      response: ["B"],
      timeZone: "Asia/Shanghai",
      clientAttemptId,
    })));

    const responses = await Promise.all(attempts);
    expect(responses.map(({ status }) => status)).toEqual([200, 200]);

    const learner = await prisma.learnerProfile.findUniqueOrThrow({ where: { deviceKey: concurrentDeviceKey } });
    const activity = await prisma.dailyActivity.findUniqueOrThrow({
      where: { learnerId_activityDate: { learnerId: learner.id, activityDate: calendarDay(new Date(), "Asia/Shanghai") } },
    });
    expect(learner).toMatchObject({ xp: 20, currentStreak: 1, bestStreak: 1 });
    expect(await prisma.practiceAttempt.count({ where: { learnerId: learner.id } })).toBe(2);
    expect(activity).toMatchObject({ attempts: 2, correct: 2, earnedXp: 20 });
    expect(await prisma.learnerBadge.count({
      where: { learnerId: learner.id, badge: { slug: "first-spark" } },
    })).toBe(1);
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
    await prisma.question.update({ where: { id: choiceId }, data: { status: "NEEDS_REVIEW" } });
    try {
      const hidden = await (await getReview(new NextRequest(`http://localhost/api/review?deviceKey=${deviceKey}`))).json() as {
        dueCount: number; activeCount: number; savedCount: number; reviews: unknown[]; saved: unknown[];
      };
      expect(hidden).toMatchObject({ dueCount: 0, activeCount: 0, savedCount: 0, reviews: [], saved: [] });
    } finally {
      await prisma.question.update({ where: { id: choiceId }, data: { status: "PUBLISHED" } });
    }
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

  it("protects the content report queue and records operator review actions", async () => {
    const reporter = await prisma.learnerProfile.create({ data: { deviceKey: studioReporterKey } });
    await prisma.questionReport.create({ data: {
      id: studioReportId,
      learnerId: reporter.id,
      questionId: choiceId,
      category: "WRONG_ANSWER",
      detail: "测试报告详情",
    } });
    const missedAttemptResponse = await createAttempt(request("http://localhost/api/attempts", "POST", {
      deviceKey: studioReporterKey,
      questionId: choiceId,
      response: ["A"],
      timeZone: "Asia/Shanghai",
    }));
    const missedAttempt = await missedAttemptResponse.json() as { attemptId: string; isCorrect: boolean };
    expect(missedAttempt.isCorrect).toBe(false);
    expect((await assessAttempt(request("http://localhost/api/attempts", "PATCH", {
      event: "EXPLANATION_VIEWED", attemptId: missedAttempt.attemptId, deviceKey: "studio_spoof_device",
    }))).status).toBe(404);
    const explanationView = await assessAttempt(request("http://localhost/api/attempts", "PATCH", {
      event: "EXPLANATION_VIEWED", attemptId: missedAttempt.attemptId, deviceKey: studioReporterKey,
    }));
    expect(await explanationView.json()).toMatchObject({ recorded: true });
    const replayedView = await assessAttempt(request("http://localhost/api/attempts", "PATCH", {
      event: "EXPLANATION_VIEWED", attemptId: missedAttempt.attemptId, deviceKey: studioReporterKey,
    }));
    expect(await replayedView.json()).toMatchObject({ recorded: false });
    await createAttempt(request("http://localhost/api/attempts", "POST", {
      deviceKey: studioReporterKey,
      questionId: choiceId,
      response: ["B"],
      timeZone: "Asia/Shanghai",
    }));
    await prisma.user.createMany({ data: [
      { id: studioOperatorId, email: "studio-operator@example.com", passwordHash: "unused", role: "CONTENT_EDITOR" },
      { id: studioLearnerId, email: "studio-learner@example.com", passwordHash: "unused", role: "LEARNER" },
    ] });
    const operatorToken = "integration-studio-operator-token";
    const learnerToken = "integration-studio-learner-token";
    await prisma.authSession.createMany({ data: [
      { userId: studioOperatorId, tokenHash: hashSessionToken(operatorToken), expiresAt: new Date(Date.now() + 60_000) },
      { userId: studioLearnerId, tokenHash: hashSessionToken(learnerToken), expiresAt: new Date(Date.now() + 60_000) },
    ] });

    expect((await getStudioReports(new NextRequest("http://localhost/api/studio/reports"))).status).toBe(401);
    expect((await getStudioReports(new NextRequest("http://localhost/api/studio/reports", {
      headers: { cookie: `${SESSION_COOKIE}=${learnerToken}` },
    }))).status).toBe(403);

    const operatorHeaders = { ...headers, cookie: `${SESSION_COOKIE}=${operatorToken}` };
    const queueResponse = await getStudioReports(new NextRequest("http://localhost/api/studio/reports?status=OPEN", { headers: operatorHeaders }));
    expect(queueResponse.status).toBe(200);
    const queue = await queueResponse.json() as { reports: Array<Record<string, unknown>>; counts: { open: number } };
    expect(queue.reports).toContainEqual(expect.objectContaining({ id: studioReportId, detail: "测试报告详情" }));
    expect(JSON.stringify(queue)).not.toContain(studioReporterKey);
    expect(JSON.stringify(queue.reports.find(({ id }) => id === studioReportId))).not.toContain("learnerId");

    const metricsResponse = await getStudioMetrics(new Request("http://localhost/api/studio/metrics", { headers: operatorHeaders }));
    expect(metricsResponse.status).toBe(200);
    const metrics = await metricsResponse.json() as {
      explanations: { eligibleMisses: number; viewed: number; viewRate: number };
      repeatPractice: { learnerTopicPairs: number };
    };
    expect(metrics.explanations).toMatchObject({ eligibleMisses: expect.any(Number), viewed: expect.any(Number), viewRate: expect.any(Number) });
    expect(metrics.explanations.eligibleMisses).toBeGreaterThanOrEqual(1);
    expect(metrics.explanations.viewed).toBeGreaterThanOrEqual(1);
    expect(metrics.repeatPractice.learnerTopicPairs).toBeGreaterThanOrEqual(1);
    expect(JSON.stringify(metrics)).not.toContain("learnerId");

    const invalidResolution = await updateStudioReport(new NextRequest("http://localhost/api/studio/reports", {
      method: "PATCH", headers: operatorHeaders, body: JSON.stringify({ reportId: studioReportId, action: "RESOLVE" }),
    }));
    expect(invalidResolution.status).toBe(400);

    try {
      const quarantine = await updateStudioReport(new NextRequest("http://localhost/api/studio/reports", {
        method: "PATCH", headers: operatorHeaders, body: JSON.stringify({ reportId: studioReportId, action: "QUARANTINE", note: "等待核对原始答案" }),
      }));
      expect(quarantine.status).toBe(200);
      expect(await prisma.question.findUniqueOrThrow({ where: { id: choiceId } })).toMatchObject({ status: "NEEDS_REVIEW" });
      expect((await nextQuestion(new NextRequest(`http://localhost/api/questions/next?questionId=${choiceId}`))).status).toBe(404);

      const resolved = await updateStudioReport(new NextRequest("http://localhost/api/studio/reports", {
        method: "PATCH", headers: operatorHeaders, body: JSON.stringify({ reportId: studioReportId, action: "RESOLVE", note: "已依据源文件核对并登记修复" }),
      }));
      expect(resolved.status).toBe(200);
      expect(await resolved.json()).toMatchObject({ report: { id: studioReportId, status: "RESOLVED" } });

      const resolvedQueue = await getStudioReports(new NextRequest("http://localhost/api/studio/reports?status=RESOLVED", { headers: operatorHeaders }));
      const resolvedBody = await resolvedQueue.json() as { reports: Array<{ id: string; reviewActions: Array<{ action: string; actor: { email: string } | null }> }> };
      const reviewed = resolvedBody.reports.find(({ id }) => id === studioReportId);
      expect(reviewed?.reviewActions.map(({ action }) => action)).toEqual(["RESOLVE", "QUARANTINE"]);
      expect(reviewed?.reviewActions[0].actor?.email).toBe("studio-operator@example.com");

      expect((await updateStudioReport(new NextRequest("http://localhost/api/studio/reports", {
        method: "PATCH", headers: operatorHeaders, body: JSON.stringify({ reportId: studioReportId, action: "REOPEN", note: "需要补充复核" }),
      }))).status).toBe(200);
      expect(await prisma.questionReport.findUniqueOrThrow({ where: { id: studioReportId } })).toMatchObject({ status: "OPEN", resolvedAt: null });
    } finally {
      await prisma.question.update({ where: { id: choiceId }, data: { status: "PUBLISHED" } });
    }
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
