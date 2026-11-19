import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { GET as exportLearner } from "@/app/api/learner/export/route";
import { PATCH as assessAttempt, POST as createAttempt } from "@/app/api/attempts/route";
import { GET as nextQuestion } from "@/app/api/questions/next/route";
import { GET as getStudioReports, PATCH as updateStudioReport } from "@/app/api/studio/reports/route";
import { GET as getStudioMetrics } from "@/app/api/studio/metrics/route";
import { prisma } from "@/lib/prisma";
import { SENSITIVE_ACTION_MAX_AGE_SECONDS } from "@/lib/auth-validation";
import { subjectId, bandId, gradeId, studioQuestionId, scienceQuestionId, mathTopicId, mathSkillId, headers, studioOperatorId, studioLearnerId, studioReporterId, studioReportId, studioRaceOperatorId, studioRaceReporterId, studioRaceReportIds, consentData, request, authCookie, registerApiFixtures } from "./api-shared";

registerApiFixtures();

describe("content review studio", () => {
  it("protects the content report queue and records operator review actions", async () => {
    await prisma.question.create({ data: {
      id: studioQuestionId,
      sourceId: studioQuestionId,
      sourceFile: "integration.json",
      sourceType: "单选题",
      type: "SINGLE_CHOICE",
      difficulty: "EASY",
      stem: "内容审核测试：1 + 1 等于？",
      answer: "B",
      correctAnswer: JSON.stringify(["B"]),
      explanation: "1 + 1 = 2。",
      status: "PUBLISHED",
      isAutoGradable: true,
      optionSplit: true,
      subjectId,
      gradeBandId: bandId,
      gradeId,
      options: { create: [
        { label: "A", content: "1", sortOrder: 0 },
        { label: "B", content: "2", sortOrder: 1 },
      ] },
      tags: { create: [{ tagId: mathTopicId }, { tagId: mathSkillId }] },
    } });
    const reporterUser = await prisma.user.create({ data: {
      id: studioReporterId,
      ...consentData,
      email: "studio-reporter@example.com",
      learner: { create: {} },
    } });
    const reporter = await prisma.learnerProfile.findUniqueOrThrow({ where: { userId: reporterUser.id } });
    const reporterCookie = await authCookie(studioReporterId);
    await prisma.questionReport.create({ data: {
      id: studioReportId,
      learnerId: reporter.id,
      questionId: studioQuestionId,
      category: "WRONG_ANSWER",
      detail: "测试报告详情",
    } });
    const missedAttemptResponse = await createAttempt(request("http://localhost/api/attempts", "POST", {
      questionId: studioQuestionId,
      response: ["A"],
      timeZone: "Asia/Shanghai",
    }, reporterCookie));
    const missedAttempt = await missedAttemptResponse.json() as { attemptId: string; isCorrect: boolean };
    expect(missedAttempt.isCorrect).toBe(false);
    expect((await assessAttempt(request("http://localhost/api/attempts", "PATCH", {
      event: "EXPLANATION_VIEWED", attemptId: missedAttempt.attemptId,
    }))).status).toBe(401);
    const explanationView = await assessAttempt(request("http://localhost/api/attempts", "PATCH", {
      event: "EXPLANATION_VIEWED", attemptId: missedAttempt.attemptId,
    }, reporterCookie));
    expect(await explanationView.json()).toMatchObject({ recorded: true });
    const replayedView = await assessAttempt(request("http://localhost/api/attempts", "PATCH", {
      event: "EXPLANATION_VIEWED", attemptId: missedAttempt.attemptId,
    }, reporterCookie));
    expect(await replayedView.json()).toMatchObject({ recorded: false });
    await createAttempt(request("http://localhost/api/attempts", "POST", {
      questionId: studioQuestionId,
      response: ["B"],
      timeZone: "Asia/Shanghai",
    }, reporterCookie));
    await prisma.user.createMany({ data: [
      { ...consentData, id: studioOperatorId, email: "studio-operator@example.com", passwordHash: "unused", role: "CONTENT_EDITOR" },
      { ...consentData, id: studioLearnerId, email: "studio-learner@example.com", passwordHash: "unused", role: "LEARNER" },
    ] });
    const operatorCookie = await authCookie(studioOperatorId);
    const staleOperatorCookie = await authCookie(
      studioOperatorId,
      0,
      Math.floor(Date.now() / 1000) - SENSITIVE_ACTION_MAX_AGE_SECONDS - 1,
    );
    const learnerCookie = await authCookie(studioLearnerId);

    expect((await getStudioReports(new NextRequest("http://localhost/api/studio/reports"))).status).toBe(401);
    expect((await getStudioReports(new NextRequest("http://localhost/api/studio/reports", {
      headers: { cookie: learnerCookie },
    }))).status).toBe(403);

    const staleOperatorHeaders = { ...headers, cookie: staleOperatorCookie };
    const staleQueue = await getStudioReports(new NextRequest(
      "http://localhost/api/studio/reports?status=OPEN",
      { headers: staleOperatorHeaders },
    ));
    expect(staleQueue.status).toBe(401);
    expect(await staleQueue.json()).toEqual({
      error: "Sign in again to verify your content-review account before viewing answers, learning metrics, or review actions.",
      code: "UNAUTHORIZED",
      messageKey: "reauthOperator",
    });
    expect((await getStudioMetrics(new Request("http://localhost/api/studio/metrics", {
      headers: staleOperatorHeaders,
    }))).status).toBe(401);
    expect((await updateStudioReport(new NextRequest("http://localhost/api/studio/reports", {
      method: "PATCH",
      headers: staleOperatorHeaders,
      body: JSON.stringify({
        reportId: studioReportId,
        action: "QUARANTINE",
        note: "过期会话不得改变题目状态",
      }),
    }))).status).toBe(401);
    expect(await prisma.question.findUniqueOrThrow({ where: { id: studioQuestionId } })).toMatchObject({
      status: "PUBLISHED",
    });
    expect(await prisma.contentReviewAction.count({ where: { reportId: studioReportId } })).toBe(0);

    const operatorHeaders = { ...headers, cookie: operatorCookie };
    const queueResponse = await getStudioReports(new NextRequest("http://localhost/api/studio/reports?status=OPEN", { headers: operatorHeaders }));
    expect(queueResponse.status).toBe(200);
    const queue = await queueResponse.json() as { reports: Array<Record<string, unknown>>; counts: { open: number } };
    expect(queue.reports).toContainEqual(expect.objectContaining({ id: studioReportId, detail: "测试报告详情" }));
    expect(JSON.stringify(queue)).not.toContain(studioReporterId);
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
      const reportBeforeUnavailableQuestion = await prisma.questionReport.findUniqueOrThrow({
        where: { id: studioReportId },
        select: { updatedAt: true },
      });
      await prisma.question.update({ where: { id: studioQuestionId }, data: { status: "NEEDS_REVIEW" } });
      const unavailableQuestion = await updateStudioReport(new NextRequest("http://localhost/api/studio/reports", {
        method: "PATCH", headers: operatorHeaders, body: JSON.stringify({
          reportId: studioReportId,
          action: "QUARANTINE",
          note: "题目状态冲突不得留下部分审核写入",
        }),
      }));
      expect(unavailableQuestion.status).toBe(409);
      expect(await prisma.questionReport.findUniqueOrThrow({
        where: { id: studioReportId },
        select: { updatedAt: true },
      })).toEqual(reportBeforeUnavailableQuestion);
      expect(await prisma.contentReviewAction.count({ where: { reportId: studioReportId } })).toBe(0);
      await prisma.question.update({ where: { id: studioQuestionId }, data: { status: "PUBLISHED" } });

      const quarantine = await updateStudioReport(new NextRequest("http://localhost/api/studio/reports", {
        method: "PATCH", headers: operatorHeaders, body: JSON.stringify({ reportId: studioReportId, action: "QUARANTINE", note: "等待核对原始答案" }),
      }));
      expect(quarantine.status).toBe(200);
      expect(await prisma.question.findUniqueOrThrow({ where: { id: studioQuestionId } })).toMatchObject({
        importStatus: "PUBLISHED",
        status: "NEEDS_REVIEW",
        quarantinedAt: expect.any(Date),
      });
      expect((await nextQuestion(new NextRequest(`http://localhost/api/questions/next?questionId=${studioQuestionId}`))).status).toBe(404);

      // Reproduce the status portion of a normal source import. Audited source
      // eligibility may advance, but an active operator quarantine remains the
      // effective serving boundary across routine seed/deploy runs.
      await prisma.$transaction([
        prisma.question.update({
          where: { sourceId: studioQuestionId },
          data: { importStatus: "PUBLISHED" },
        }),
        prisma.question.updateMany({
          where: { sourceId: studioQuestionId, quarantinedAt: null },
          data: { status: "PUBLISHED" },
        }),
      ]);
      expect(await prisma.question.findUniqueOrThrow({ where: { id: studioQuestionId } })).toMatchObject({
        importStatus: "PUBLISHED",
        status: "NEEDS_REVIEW",
        quarantinedAt: expect.any(Date),
      });
      expect((await nextQuestion(new NextRequest(`http://localhost/api/questions/next?questionId=${studioQuestionId}`))).status).toBe(404);

      const resolved = await updateStudioReport(new NextRequest("http://localhost/api/studio/reports", {
        method: "PATCH", headers: operatorHeaders, body: JSON.stringify({ reportId: studioReportId, action: "RESOLVE", note: "已依据源文件核对并登记修复" }),
      }));
      expect(resolved.status).toBe(200);
      expect(await resolved.json()).toMatchObject({
        report: {
          id: studioReportId,
          status: "RESOLVED",
          question: { status: "PUBLISHED" },
        },
      });
      expect(await prisma.question.findUniqueOrThrow({ where: { id: studioQuestionId } })).toMatchObject({
        importStatus: "PUBLISHED",
        status: "PUBLISHED",
        quarantinedAt: null,
      });

      const staleQuarantine = await updateStudioReport(new NextRequest("http://localhost/api/studio/reports", {
        method: "PATCH", headers: operatorHeaders, body: JSON.stringify({
          reportId: studioReportId,
          action: "QUARANTINE",
          note: "已解决报告不得被旧操作再次隔离",
        }),
      }));
      expect(staleQuarantine.status).toBe(409);
      expect(await prisma.question.findUniqueOrThrow({ where: { id: studioQuestionId } })).toMatchObject({
        status: "PUBLISHED",
      });
      expect(await prisma.contentReviewAction.count({ where: { reportId: studioReportId } })).toBe(2);

      const resolvedQueue = await getStudioReports(new NextRequest("http://localhost/api/studio/reports?status=RESOLVED", { headers: operatorHeaders }));
      const resolvedBody = await resolvedQueue.json() as { reports: Array<{ id: string; reviewActions: Array<{ action: string; actor: { email: string } | null }> }> };
      const reviewed = resolvedBody.reports.find(({ id }) => id === studioReportId);
      expect(reviewed?.reviewActions.map(({ action }) => action)).toEqual(["RESOLVE", "QUARANTINE"]);
      expect(reviewed?.reviewActions[0].actor?.email).toBe("studio-operator@example.com");

      expect((await updateStudioReport(new NextRequest("http://localhost/api/studio/reports", {
        method: "PATCH", headers: operatorHeaders, body: JSON.stringify({ reportId: studioReportId, action: "REOPEN", note: "需要补充复核" }),
      }))).status).toBe(200);
      expect(await prisma.questionReport.findUniqueOrThrow({ where: { id: studioReportId } })).toMatchObject({ status: "OPEN", resolvedAt: null });

      const operatorExportResponse = await exportLearner(new NextRequest("http://localhost/api/learner/export", {
        headers: operatorHeaders,
      }));
      expect(operatorExportResponse.status).toBe(200);
      const operatorExport = await operatorExportResponse.json() as {
        account: {
          email: string;
          contentReviewActions: Array<{ action: string; note: string; report: { question: { sourceId: string } } }>;
        };
        learner: null;
      };
      expect(operatorExport.account.email).toBe("studio-operator@example.com");
      expect(operatorExport.account.contentReviewActions).toHaveLength(3);
      expect(operatorExport.account.contentReviewActions).toEqual(expect.arrayContaining([
        expect.objectContaining({ action: "QUARANTINE", note: "等待核对原始答案" }),
        expect.objectContaining({ action: "RESOLVE", note: "已依据源文件核对并登记修复" }),
        expect.objectContaining({ action: "REOPEN", note: "需要补充复核" }),
      ]));
      expect(operatorExport.account.contentReviewActions[0]?.report.question.sourceId).toBe(studioQuestionId);
      expect(operatorExport.learner).toBeNull();
      expect(JSON.stringify(operatorExport)).not.toContain(studioReporterId);
    } finally {
      await prisma.question.update({
        where: { id: studioQuestionId },
        data: { importStatus: "PUBLISHED", status: "PUBLISHED", quarantinedAt: null },
      });
    }
  });

  it("restores a quarantined question after concurrent final report resolutions", async () => {
    await prisma.user.createMany({ data: [
      {
        ...consentData,
        id: studioRaceOperatorId,
        email: "studio-race-operator@example.com",
        passwordHash: "unused",
        role: "CONTENT_EDITOR",
      },
      {
        ...consentData,
        id: studioRaceReporterId,
        email: "studio-race-reporter@example.com",
      },
    ] });
    const reporter = await prisma.learnerProfile.create({ data: { userId: studioRaceReporterId } });
    await prisma.questionReport.createMany({
      data: studioRaceReportIds.map((id) => ({
        id,
        learnerId: reporter.id,
        questionId: scienceQuestionId,
        category: "UNCLEAR",
      })),
    });
    const operatorHeaders = { ...headers, cookie: await authCookie(studioRaceOperatorId) };

    try {
      const quarantine = await updateStudioReport(new NextRequest("http://localhost/api/studio/reports", {
        method: "PATCH",
        headers: operatorHeaders,
        body: JSON.stringify({
          reportId: studioRaceReportIds[0],
          action: "QUARANTINE",
          note: "并发复核前隔离",
        }),
      }));
      expect(quarantine.status).toBe(200);

      await prisma.$transaction([
        prisma.question.update({
          where: { sourceId: scienceQuestionId },
          data: { importStatus: "PUBLISHED" },
        }),
        prisma.question.updateMany({
          where: { sourceId: scienceQuestionId, quarantinedAt: null },
          data: { status: "PUBLISHED" },
        }),
      ]);
      expect(await prisma.question.findUniqueOrThrow({ where: { id: scienceQuestionId } })).toMatchObject({
        status: "NEEDS_REVIEW",
        quarantinedAt: expect.any(Date),
      });

      const resolutions = await Promise.all(studioRaceReportIds.map((reportId) => (
        updateStudioReport(new NextRequest("http://localhost/api/studio/reports", {
          method: "PATCH",
          headers: operatorHeaders,
          body: JSON.stringify({
            reportId,
            action: "RESOLVE",
            note: "源数据复核完成",
          }),
        }))
      )));
      expect(resolutions.map(({ status }) => status)).toEqual([200, 200]);
      expect(await prisma.questionReport.count({
        where: { id: { in: [...studioRaceReportIds] }, status: "OPEN" },
      })).toBe(0);
      expect(await prisma.question.findUniqueOrThrow({ where: { id: scienceQuestionId } })).toMatchObject({
        importStatus: "PUBLISHED",
        status: "PUBLISHED",
        quarantinedAt: null,
      });
    } finally {
      await prisma.question.update({
        where: { id: scienceQuestionId },
        data: { importStatus: "PUBLISHED", status: "PUBLISHED", quarantinedAt: null },
      });
    }
  });
});
