import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { GET as getCatalog } from "@/app/api/catalog/route";
import { DELETE as deleteLearner } from "@/app/api/learner/route";
import { GET as getHealth } from "@/app/api/health/route";
import { GET as getProgress } from "@/app/api/learner/progress/route";
import { GET as exportLearner } from "@/app/api/learner/export/route";
import { PATCH as assessAttempt, POST as createAttempt } from "@/app/api/attempts/route";
import { GET as getQuestionHint } from "@/app/api/questions/hint/route";
import { GET as nextQuestion } from "@/app/api/questions/next/route";
import { POST as createReport } from "@/app/api/reports/route";
import { GET as getReview, PATCH as dismissReview, POST as saveQuestion } from "@/app/api/review/route";
import { POST as createSession } from "@/app/api/sessions/route";
import { prisma } from "@/lib/prisma";
import { issueQuestionTicket } from "@/lib/question-ticket";
import { SENSITIVE_ACTION_MAX_AGE_SECONDS } from "@/lib/auth-validation";
import { calendarDay } from "@/lib/dates";
import { REQUIRED_DATABASE_MIGRATION } from "@/lib/database-readiness";
import { PRIVACY_VERSION, TERMS_VERSION } from "@/lib/legal";
import { choiceId, writtenId, headers, concurrentUserId, journeyUserId, journeyAccountActionDeliveredAt, consentData, request, authCookie, registerApiFixtures } from "./api-shared";

registerApiFixtures();

describe("practice journey and learner data", () => {
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

  it("refuses guest grading without a ticket for a served question", async () => {
    for (const ticket of [undefined, "forged-ticket-value", issueQuestionTicket(writtenId)]) {
      const response = await createAttempt(request("http://localhost/api/attempts", "POST", {
        questionId: choiceId,
        response: ["B"],
        ...(ticket ? { ticket } : {}),
      }));
      expect(response.status).toBe(403);
      const body = await response.json();
      expect(body).toMatchObject({ code: "FORBIDDEN", details: { reason: "TICKET_REQUIRED" } });
      expect(body).not.toHaveProperty("answer");
    }
  });

  it("grades a guest attempt without creating any learning record", async () => {
    const learnersBefore = await prisma.learnerProfile.count();
    const attemptsBefore = await prisma.practiceAttempt.count();
    const response = await createAttempt(request("http://localhost/api/attempts", "POST", {
      questionId: choiceId,
      response: ["B"],
      ticket: issueQuestionTicket(choiceId),
    }));

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      attemptId: null,
      isCorrect: true,
      answer: "B",
      earnedXp: 0,
      persisted: false,
    });
    expect(await prisma.learnerProfile.count()).toBe(learnersBefore);
    expect(await prisma.practiceAttempt.count()).toBe(attemptsBefore);
  });

  it("rejects empty guest answers without disclosing solutions or writing data", async () => {
    const attemptsBefore = await prisma.practiceAttempt.count();
    for (const responseValue of ["   ", [], [""]]) {
      const response = await createAttempt(request("http://localhost/api/attempts", "POST", {
        questionId: choiceId,
        response: responseValue,
      }));
      expect(response.status).toBe(400);
      expect(await response.json()).not.toHaveProperty("answer");
    }
    expect(await prisma.practiceAttempt.count()).toBe(attemptsBefore);
  });

  it("requires the response shape and labels shown by the question", async () => {
    const attemptsBefore = await prisma.practiceAttempt.count();
    const invalidInputs = [
      { questionId: choiceId, response: "B" },
      { questionId: choiceId, response: ["Z"] },
      { questionId: writtenId, response: ["A"] },
    ];
    for (const input of invalidInputs) {
      const response = await createAttempt(request("http://localhost/api/attempts", "POST", input));
      expect(response.status).toBe(400);
      expect(await response.json()).not.toHaveProperty("answer");
    }
    expect(await prisma.practiceAttempt.count()).toBe(attemptsBefore);
  });

  it("rejects cross-origin mutations before parsing or writing data", async () => {
    const attemptsBefore = await prisma.practiceAttempt.count();
    const response = await createAttempt(new Request("http://localhost/api/attempts", {
      method: "POST",
      headers: { ...headers, origin: "https://evil.example" },
      body: "not-json",
    }));
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: "FORBIDDEN" });
    expect(await prisma.practiceAttempt.count()).toBe(attemptsBefore);
  });

  it("records concurrent authenticated attempts without losing progress or duplicating badges", async () => {
    await prisma.user.create({ data: {
      id: concurrentUserId,
      ...consentData,
      email: "concurrent@example.com",
      learner: { create: { xp: 100, level: 1 } },
    } });
    const cookie = await authCookie(concurrentUserId);
    const attempts = [
      "b3496bea-4c66-4e2d-a4e5-6496e6126966",
      "ba6839b3-b85a-43f8-95d8-7020a0defaba",
    ].map((clientAttemptId) => createAttempt(request("http://localhost/api/attempts", "POST", {
      questionId: choiceId,
      response: ["B"],
      timeZone: "Asia/Shanghai",
      clientAttemptId,
    }, cookie)));

    const responses = await Promise.all(attempts);
    expect(responses.map(({ status }) => status)).toEqual([200, 200]);

    const learner = await prisma.learnerProfile.findUniqueOrThrow({ where: { userId: concurrentUserId } });
    const activity = await prisma.dailyActivity.findUniqueOrThrow({
      where: { learnerId_activityDate: { learnerId: learner.id, activityDate: calendarDay(new Date(), "Asia/Shanghai") } },
    });
    expect(learner).toMatchObject({ xp: 120, level: 2, currentStreak: 1, bestStreak: 1 });
    expect(await prisma.practiceAttempt.count({ where: { learnerId: learner.id } })).toBe(2);
    expect(activity).toMatchObject({ attempts: 2, correct: 2, earnedXp: 20 });
    expect(await prisma.learnerBadge.count({
      where: { learnerId: learner.id, badge: { slug: "first-spark" } },
    })).toBe(1);
  });

  it("creates a session, grades a miss, schedules review, saves, reports, and exposes progress", async () => {
    const accountActionExpiry = new Date(Date.now() + 60 * 60_000);
    await prisma.user.create({ data: {
      id: journeyUserId,
      ...consentData,
      email: "journey@example.com",
      emailVerified: new Date(),
      passwordHash: "export-secret-password-hash",
      learner: { create: {} },
      accounts: { create: {
        type: "oauth",
        provider: "google",
        providerAccountId: "journey-google-account",
        access_token: "export-secret-access-token",
        refresh_token: "export-secret-refresh-token",
        id_token: "export-secret-id-token",
      } },
      consentRecords: { create: {
        termsVersion: TERMS_VERSION,
        privacyVersion: PRIVACY_VERSION,
        basis: "ADULT",
        method: "PASSWORD_REGISTRATION",
        acceptedAt: consentData.termsAcceptedAt,
      } },
      emailVerificationTokens: { create: {
        tokenHash: "1a".repeat(32),
        expiresAt: accountActionExpiry,
        deliveredAt: journeyAccountActionDeliveredAt,
      } },
      emailChangeTokens: { create: {
        newEmail: "journey-pending@example.com",
        tokenHash: "2b".repeat(32),
        expiresAt: accountActionExpiry,
        deliveredAt: journeyAccountActionDeliveredAt,
      } },
      passwordResetTokens: { create: {
        tokenHash: "3c".repeat(32),
        expiresAt: accountActionExpiry,
        deliveredAt: journeyAccountActionDeliveredAt,
      } },
      sessions: { create: {
        sessionToken: "export-secret-session-token",
        expires: accountActionExpiry,
      } },
    } });
    const cookie = await authCookie(journeyUserId);
    expect((await createSession(request("http://localhost/api/sessions", "POST", { questionGoal: 10, filters: {} }))).status).toBe(401);
    const sessionResponse = await createSession(request("http://localhost/api/sessions", "POST", { questionGoal: 10, filters: { subject: "integration-math" } }, cookie));
    expect(sessionResponse.status).toBe(201);
    let session = await sessionResponse.json() as { id: string };
    const resumedResponse = await createSession(request("http://localhost/api/sessions", "POST", { questionGoal: 10, filters: { subject: "integration-math" } }, cookie));
    expect(resumedResponse.status).toBe(200);
    expect(await resumedResponse.json()).toMatchObject({ id: session.id, resumed: true, completedCount: 0 });

    const restartedResponse = await createSession(request("http://localhost/api/sessions", "POST", { questionGoal: 10, filters: { subject: "integration-math" }, restart: true }, cookie));
    expect(restartedResponse.status).toBe(201);
    const restarted = await restartedResponse.json() as { id: string; resumed: boolean };
    expect(restarted).toMatchObject({ resumed: false });
    expect(restarted.id).not.toBe(session.id);
    expect(await prisma.practiceSession.findUniqueOrThrow({ where: { id: session.id } })).toMatchObject({ status: "ABANDONED" });
    session = restarted;

    const concurrentRestarts = await Promise.all(Array.from({ length: 3 }, (_, index) => createSession(request(
      "http://localhost/api/sessions",
      "POST",
      { questionGoal: 10, filters: { subject: `integration-math-${index}` }, restart: true },
      cookie,
    ))));
    expect(concurrentRestarts.every((response) => response.ok || response.status === 409)).toBe(true);
    const sessionLearner = await prisma.learnerProfile.findUniqueOrThrow({ where: { userId: journeyUserId } });
    expect(await prisma.practiceSession.count({ where: { learnerId: sessionLearner.id, status: "ACTIVE" } })).toBe(1);
    session = await prisma.practiceSession.findFirstOrThrow({
      where: { learnerId: sessionLearner.id, status: "ACTIVE" },
      select: { id: true },
    });

    const questionResponse = await nextQuestion(new NextRequest("http://localhost/api/questions/next?subject=integration-math&autoGradable=true", { headers: { cookie } }));
    expect(questionResponse.status).toBe(200);
    const question = await questionResponse.json() as { id: string; hasHint: boolean; correctAnswer?: unknown; explanation?: unknown };
    expect(question).toMatchObject({ id: choiceId, hasHint: false });
    expect(question).not.toHaveProperty("correctAnswer");
    expect(question).not.toHaveProperty("explanation");

    const hintResponse = await getQuestionHint(new NextRequest(`http://localhost/api/questions/hint?questionId=${choiceId}`, { headers }));
    expect(hintResponse.status).toBe(200);
    const hint = await hintResponse.json() as { hint: string; kind: string };
    expect(hint.kind).toBe("STRATEGY");
    expect(hint.hint).toContain("逐项排除");
    expect(hint.hint).not.toContain("1 + 1 = 2");

    const attemptInput = { questionId: choiceId, response: ["A"], sessionId: session.id, timeZone: "Asia/Shanghai", clientAttemptId: "4dd94422-4c24-4f39-a5fc-35f494d31ea2" };
    const attemptResponse = await createAttempt(request("http://localhost/api/attempts", "POST", attemptInput, cookie));
    expect(attemptResponse.status).toBe(200);
    const attempt = await attemptResponse.json() as { isCorrect: boolean; session: { completedCount: number } };
    expect(attempt).toMatchObject({ isCorrect: false, session: { completedCount: 1 } });
    const replayResponse = await createAttempt(request("http://localhost/api/attempts", "POST", attemptInput, cookie));
    expect(await replayResponse.json()).toMatchObject({ replayed: true, totalXp: 2, session: { completedCount: 1 } });
    expect(await prisma.practiceAttempt.count({ where: { clientAttemptId: attemptInput.clientAttemptId } })).toBe(1);

    expect((await saveQuestion(request("http://localhost/api/review", "POST", { questionId: choiceId, saved: true }, cookie))).status).toBe(200);
    const review = await (await getReview(new NextRequest("http://localhost/api/review", { headers: { cookie } }))).json() as {
      dueCount: number;
      savedCount: number;
      reviews: Array<{ id: string; isSaved: boolean }>;
      saved: Array<{ id: string; isInReview: boolean; reviewIsDue: boolean }>;
    };
    expect(review).toMatchObject({
      dueCount: 1,
      savedCount: 1,
      reviews: [expect.objectContaining({ id: choiceId, isSaved: true })],
      saved: [expect.objectContaining({ id: choiceId, isInReview: true, reviewIsDue: true })],
    });
    await prisma.question.update({ where: { id: choiceId }, data: { status: "NEEDS_REVIEW" } });
    try {
      const hidden = await (await getReview(new NextRequest("http://localhost/api/review", { headers: { cookie } }))).json() as {
        dueCount: number; activeCount: number; savedCount: number; reviews: unknown[]; saved: unknown[];
      };
      expect(hidden).toMatchObject({ dueCount: 0, activeCount: 0, savedCount: 0, reviews: [], saved: [] });
    } finally {
      await prisma.question.update({ where: { id: choiceId }, data: { status: "PUBLISHED" } });
    }
    const adaptiveQuestion = await (await nextQuestion(new NextRequest("http://localhost/api/questions/next?subject=integration-math&mode=review", { headers: { cookie } }))).json() as { id: string; recommendation: unknown };
    expect(adaptiveQuestion).toMatchObject({ id: choiceId, recommendation: { kind: "DUE_REVIEW", focus: null } });

    expect((await createReport(request("http://localhost/api/reports", "POST", { questionId: choiceId, category: "UNCLEAR" }, cookie))).status).toBe(201);
    const progress = await (await getProgress(new NextRequest("http://localhost/api/learner/progress?timeZone=Asia%2FShanghai", { headers: { cookie } }))).json() as { summary: { totalAttempts: number; xp: number }; recentMistakes: unknown[] };
    expect(progress.summary).toMatchObject({ totalAttempts: 1, xp: 2 });
    expect(progress.recentMistakes).toHaveLength(1);

    const learner = await prisma.learnerProfile.findUniqueOrThrow({ where: { userId: journeyUserId } });
    const futureDueAt = new Date(Date.now() + 86_400_000);
    await prisma.reviewItem.update({ where: { learnerId_questionId: { learnerId: learner.id, questionId: choiceId } }, data: { dueAt: futureDueAt } });
    await createAttempt(request("http://localhost/api/attempts", "POST", { questionId: choiceId, response: ["B"], timeZone: "Asia/Shanghai" }, cookie));
    expect(await prisma.reviewItem.findUniqueOrThrow({ where: { learnerId_questionId: { learnerId: learner.id, questionId: choiceId } } })).toMatchObject({ intervalDays: 0, consecutiveCorrect: 0, dueAt: futureDueAt });

    await prisma.reviewItem.update({ where: { learnerId_questionId: { learnerId: learner.id, questionId: choiceId } }, data: { dueAt: new Date(Date.now() - 1_000) } });
    await createAttempt(request("http://localhost/api/attempts", "POST", { questionId: choiceId, response: ["B"], timeZone: "Asia/Shanghai" }, cookie));
    expect(await prisma.reviewItem.findUniqueOrThrow({ where: { learnerId_questionId: { learnerId: learner.id, questionId: choiceId } } })).toMatchObject({ intervalDays: 1, consecutiveCorrect: 1 });

    const updatedProgress = await (await getProgress(new NextRequest("http://localhost/api/learner/progress?timeZone=Asia%2FShanghai", { headers: { cookie } }))).json() as { weakTopics: Array<{ slug: string; subject: string }> };
    expect(updatedProgress.weakTopics).toContainEqual(expect.objectContaining({ slug: "integration-arithmetic", subject: "integration-math" }));
    const topicAdaptive = await (await nextQuestion(new NextRequest("http://localhost/api/questions/next?subject=integration-math&mode=adaptive", { headers: { cookie } }))).json() as { id: string; recommendation: unknown };
    expect(topicAdaptive).toMatchObject({
      id: choiceId,
      recommendation: { kind: "WEAK_TOPIC", focus: "测试运算" },
    });

    const dismissed = await dismissReview(request("http://localhost/api/review", "PATCH", {
      questionId: choiceId,
      action: "DISMISS",
    }, cookie));
    expect(dismissed.status).toBe(200);
    expect(await prisma.reviewItem.findUniqueOrThrow({
      where: { learnerId_questionId: { learnerId: learner.id, questionId: choiceId } },
    })).toMatchObject({ status: "DISMISSED" });

    await createAttempt(request("http://localhost/api/attempts", "POST", {
      questionId: choiceId,
      response: ["A"],
      timeZone: "Asia/Shanghai",
    }, cookie));
    expect(await prisma.reviewItem.findUniqueOrThrow({
      where: { learnerId_questionId: { learnerId: learner.id, questionId: choiceId } },
    })).toMatchObject({ status: "ACTIVE", lastResult: false });

    const health = await getHealth(new Request("http://localhost/api/health", { headers }));
    expect(health.status).toBe(200);
    expect(health.headers.get("x-request-id")).toBeTruthy();
    expect(await health.json()).toMatchObject({
      status: "ok",
      database: "ready",
      schema: { status: "ready", requiredMigration: REQUIRED_DATABASE_MIGRATION },
      catalog: { subjects: expect.any(Number), questions: expect.any(Number) },
    });
  });

  it("requires explicit self-assessment, protects account export, and supports data deletion", async () => {
    const cookie = await authCookie(journeyUserId);
    const attemptResponse = await createAttempt(request("http://localhost/api/attempts", "POST", { questionId: writtenId, response: "测试思路", timeZone: "Asia/Shanghai" }, cookie));
    const attempt = await attemptResponse.json() as { attemptId: string; isCorrect: boolean | null };
    expect(attempt.isCorrect).toBeNull();

    const learner = await prisma.learnerProfile.findUniqueOrThrow({ where: { userId: journeyUserId } });
    const staleCookie = await authCookie(
      journeyUserId,
      0,
      Math.floor(Date.now() / 1000) - SENSITIVE_ACTION_MAX_AGE_SECONDS - 1,
    );
    const storedBeforeStaleExport = await prisma.user.findUniqueOrThrow({
      where: { id: journeyUserId },
      select: {
        updatedAt: true,
        learner: { select: { id: true, updatedAt: true } },
      },
    });
    const rateLimitBucketsBeforeStaleExport = await prisma.rateLimitBucket.count();
    const staleExportResponse = await exportLearner(new NextRequest(
      "http://localhost/api/learner/export",
      { headers: { ...headers, cookie: staleCookie } },
    ));
    expect(staleExportResponse.status).toBe(401);
    expect(await staleExportResponse.json()).toEqual({
      error: "Sign in again to confirm this is your account before exporting account data.",
      code: "UNAUTHORIZED",
      messageKey: "reauthExport",
    });
    const staleDeleteResponse = await deleteLearner(new NextRequest(
      "http://localhost/api/learner",
      { method: "DELETE", headers: { ...headers, cookie: staleCookie } },
    ));
    expect(staleDeleteResponse.status).toBe(401);
    expect(await staleDeleteResponse.json()).toEqual({
      error: "Sign in again to confirm this is your account before deleting learning data.",
      code: "UNAUTHORIZED",
      messageKey: "reauthDeleteLearning",
    });
    expect(await prisma.user.findUniqueOrThrow({
      where: { id: journeyUserId },
      select: {
        updatedAt: true,
        learner: { select: { id: true, updatedAt: true } },
      },
    })).toEqual(storedBeforeStaleExport);
    expect(await prisma.rateLimitBucket.count()).toBe(rateLimitBucketsBeforeStaleExport);

    const activityDate = calendarDay(new Date(), "Asia/Shanghai");
    const before = await prisma.dailyActivity.findUniqueOrThrow({
      where: { learnerId_activityDate: { learnerId: learner.id, activityDate } },
    });
    const assessmentInput = { attemptId: attempt.attemptId, isCorrect: true, timeZone: "Asia/Shanghai" };
    const assessmentResponses = await Promise.all([
      assessAttempt(request("http://localhost/api/attempts", "PATCH", assessmentInput, cookie)),
      assessAttempt(request("http://localhost/api/attempts", "PATCH", assessmentInput, cookie)),
    ]);
    expect(assessmentResponses.map(({ status }) => status).sort()).toEqual([200, 409]);
    expect(await assessmentResponses[0].json()).toMatchObject(
      assessmentResponses[0].status === 200 ? { isCorrect: true } : { error: "Attempt already assessed" },
    );
    const after = await prisma.dailyActivity.findUniqueOrThrow({
      where: { learnerId_activityDate: { learnerId: learner.id, activityDate } },
    });
    expect(after.correct).toBe(before.correct + 1);

    await prisma.practiceAttempt.createMany({
      data: Array.from({ length: 251 }, (_, index) => ({
        id: `integration-export-attempt-${String(index).padStart(3, "0")}`,
        learnerId: learner.id,
        questionId: choiceId,
        response: "[\"B\"]",
        isCorrect: true,
        earnedXp: 10,
      })),
    });

    const lastFreezeUsedOn = "2026-07-30";
    await prisma.learnerProfile.update({
      where: { id: learner.id },
      data: { streakFreezes: 2, lastFreezeUsedOn },
    });

    const exportResponse = await exportLearner(new NextRequest("http://localhost/api/learner/export", { headers: { ...headers, cookie } }));
    expect(exportResponse.status).toBe(200);
    expect(exportResponse.headers.get("content-disposition")).toContain("eduloop-account-data-");
    const exported = await exportResponse.json() as {
      format: string;
      version: number;
      account: {
        email: string;
        hasPassword: boolean;
        registrationExpiresAt: string | null;
        linkedProviders: Array<{ provider: string; providerAccountId: string }>;
        consentHistory: Array<{ basis: string; method: string }>;
        pendingAccountActions: {
          emailVerifications: Array<{ deliveredAt: string | null }>;
          emailChanges: Array<{ newEmail: string; deliveredAt: string | null }>;
          passwordResets: Array<{ deliveredAt: string | null }>;
        };
        sessionRecords: Array<{ expires: string }>;
        contentReviewActions: unknown[];
      };
      learner: {
        streakFreezes: number;
        lastFreezeUsedOn: string | null;
        attempts: unknown[];
        reviewItems: Array<{ createdAt: string; updatedAt: string }>;
        reports: Array<{ updatedAt: string; reporterErasedAt: string | null }>;
        id?: string;
      };
    };
    expect(exported).toMatchObject({
      format: "EduLoop account export",
      version: 3,
      account: {
        email: "journey@example.com",
        hasPassword: true,
        registrationExpiresAt: null,
        linkedProviders: [{ provider: "google", providerAccountId: "journey-google-account" }],
        consentHistory: [{ basis: "ADULT", method: "PASSWORD_REGISTRATION" }],
        pendingAccountActions: {
          emailVerifications: [expect.any(Object)],
          emailChanges: [{ newEmail: "journey-pending@example.com" }],
          passwordResets: [expect.any(Object)],
        },
        sessionRecords: [{ expires: expect.any(String) }],
        contentReviewActions: [],
      },
    });
    expect(exported.account.pendingAccountActions.emailVerifications[0]?.deliveredAt).toBe(
      journeyAccountActionDeliveredAt.toISOString(),
    );
    expect(exported.account.pendingAccountActions.emailChanges[0]?.deliveredAt).toBe(
      journeyAccountActionDeliveredAt.toISOString(),
    );
    expect(exported.account.pendingAccountActions.passwordResets[0]?.deliveredAt).toBe(
      journeyAccountActionDeliveredAt.toISOString(),
    );
    expect(exported.learner).toMatchObject({
      streakFreezes: 2,
      lastFreezeUsedOn,
      reviewItems: [expect.objectContaining({
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      })],
      reports: [expect.objectContaining({
        updatedAt: expect.any(String),
        reporterErasedAt: null,
      })],
    });
    expect(exported.learner.attempts.length).toBeGreaterThanOrEqual(252);
    expect(exported.learner).not.toHaveProperty("id");
    const serializedExport = JSON.stringify(exported);
    expect(serializedExport).not.toContain("export-secret-password-hash");
    expect(serializedExport).not.toContain("export-secret-access-token");
    expect(serializedExport).not.toContain("export-secret-refresh-token");
    expect(serializedExport).not.toContain("export-secret-id-token");
    expect(serializedExport).not.toContain("export-secret-session-token");
    expect(serializedExport).not.toContain("tokenHash");
    expect(serializedExport).not.toContain("sessionVersion");

    const deleteResponse = await deleteLearner(new NextRequest("http://localhost/api/learner", { method: "DELETE", headers: { ...headers, cookie } }));
    expect(await deleteResponse.json()).toEqual({ deleted: true });
    expect(await prisma.learnerProfile.findUnique({ where: { userId: journeyUserId } })).toBeNull();
  });
});
