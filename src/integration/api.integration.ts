import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GET as getCatalog } from "@/app/api/catalog/route";
import { DELETE as deleteLearner } from "@/app/api/learner/route";
import { GET as getHealth } from "@/app/api/health/route";
import { GET as getProgress } from "@/app/api/learner/progress/route";
import { PATCH as assessAttempt, POST as createAttempt } from "@/app/api/attempts/route";
import { GET as getQuestionHint } from "@/app/api/questions/hint/route";
import { GET as nextQuestion } from "@/app/api/questions/next/route";
import { POST as createReport } from "@/app/api/reports/route";
import { GET as getReview, POST as saveQuestion } from "@/app/api/review/route";
import { POST as createSession } from "@/app/api/sessions/route";
import { prisma } from "@/lib/prisma";

const deviceKey = "guest_integration_device";
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
  await prisma.learnerProfile.deleteMany({ where: { deviceKey } });
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

  it("creates a session, grades a miss, schedules review, saves, reports, and exposes progress", async () => {
    const sessionResponse = await createSession(request("http://localhost/api/sessions", "POST", { deviceKey, questionGoal: 10, filters: { subject: "integration-math" } }));
    expect(sessionResponse.status).toBe(201);
    const session = await sessionResponse.json() as { id: string };

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

    const attemptResponse = await createAttempt(request("http://localhost/api/attempts", "POST", { deviceKey, questionId: choiceId, response: ["A"], sessionId: session.id, timeZone: "Asia/Shanghai" }));
    expect(attemptResponse.status).toBe(200);
    const attempt = await attemptResponse.json() as { isCorrect: boolean; session: { completedCount: number } };
    expect(attempt).toMatchObject({ isCorrect: false, session: { completedCount: 1 } });

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

    expect((await getHealth()).status).toBe(200);
  });

  it("requires explicit self-assessment for written work and supports data deletion", async () => {
    const attemptResponse = await createAttempt(request("http://localhost/api/attempts", "POST", { deviceKey, questionId: writtenId, response: "测试思路", timeZone: "Asia/Shanghai" }));
    const attempt = await attemptResponse.json() as { attemptId: string; isCorrect: boolean | null };
    expect(attempt.isCorrect).toBeNull();

    const assessmentResponse = await assessAttempt(request("http://localhost/api/attempts", "PATCH", { deviceKey, attemptId: attempt.attemptId, isCorrect: false, timeZone: "Asia/Shanghai" }));
    expect(await assessmentResponse.json()).toEqual({ isCorrect: false });

    const deleteResponse = await deleteLearner(new NextRequest(`http://localhost/api/learner?deviceKey=${deviceKey}`, { method: "DELETE", headers }));
    expect(await deleteResponse.json()).toEqual({ deleted: true });
    expect(await prisma.learnerProfile.findUnique({ where: { deviceKey } })).toBeNull();
  });
});
