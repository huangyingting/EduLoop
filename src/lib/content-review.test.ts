import type { Prisma } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { transitionContentReportInTransaction } from "./content-review";

function fakeTransaction(options: {
  importStatus?: string;
  remainingOpenReports?: number;
  questionTransitionCount?: number;
  reportTransitionCount?: number;
  report?: { id: string; questionId: string } | null;
  securityClaimCount?: number;
} = {}) {
  const userUpdate = vi.fn().mockResolvedValue({ count: options.securityClaimCount ?? 1 });
  const reportUpdate = vi.fn().mockResolvedValue({ count: options.reportTransitionCount ?? 1 });
  const reportFind = vi.fn().mockResolvedValue(options.report === undefined
    ? { id: "report-1", questionId: "question-1" }
    : options.report);
  const reportCount = vi.fn().mockResolvedValue(options.remainingOpenReports ?? 0);
  const questionUpdate = vi.fn().mockResolvedValue({ count: options.questionTransitionCount ?? 1 });
  const questionFind = vi.fn().mockResolvedValue({ importStatus: options.importStatus ?? "PUBLISHED" });
  const actionCreate = vi.fn().mockResolvedValue({ id: "action-1" });
  const transaction = {
    user: { updateMany: userUpdate },
    questionReport: { updateMany: reportUpdate, findUnique: reportFind, count: reportCount },
    question: { updateMany: questionUpdate, findUnique: questionFind },
    contentReviewAction: { create: actionCreate },
  } as unknown as Prisma.TransactionClient;
  return {
    transaction,
    userUpdate,
    reportUpdate,
    reportFind,
    reportCount,
    questionUpdate,
    questionFind,
    actionCreate,
  };
}

describe("content review transitions", () => {
  it("claims the open report before quarantining its question", async () => {
    const now = new Date("2026-08-01T01:00:00.000Z");
    const fake = fakeTransaction();

    const result = await transitionContentReportInTransaction(fake.transaction, {
      reportId: "report-1",
      action: "QUARANTINE",
      note: "Verify source answer",
      actor: { id: "operator-1", role: "CONTENT_EDITOR", sessionVersion: 4 },
      transitionedAt: now,
    });

    expect(result).toEqual({ status: "UPDATED", questionId: "question-1" });
    expect(fake.userUpdate).toHaveBeenCalledWith({
      where: { id: "operator-1", sessionVersion: 4, role: "CONTENT_EDITOR" },
      data: { sessionVersion: { increment: 0 } },
    });
    expect(fake.reportUpdate).toHaveBeenCalledWith({
      where: { id: "report-1", status: "OPEN" },
      data: { updatedAt: now },
    });
    expect(fake.questionUpdate).toHaveBeenCalledWith({
      where: { id: "question-1", status: "PUBLISHED", quarantinedAt: null },
      data: { status: "NEEDS_REVIEW", quarantinedAt: now },
    });
    expect(fake.reportUpdate.mock.invocationCallOrder[0])
      .toBeLessThan(fake.questionUpdate.mock.invocationCallOrder[0]);
    expect(fake.actionCreate).toHaveBeenCalledWith({
      data: {
        reportId: "report-1",
        actorId: "operator-1",
        action: "QUARANTINE",
        note: "Verify source answer",
        createdAt: now,
      },
    });
  });

  it("restores the latest import status only after the last open report resolves", async () => {
    const now = new Date("2026-08-01T01:10:00.000Z");
    const fake = fakeTransaction({ importStatus: "PUBLISHED" });

    const result = await transitionContentReportInTransaction(fake.transaction, {
      reportId: "report-1",
      action: "RESOLVE",
      note: "Source correction verified",
      transitionedAt: now,
    });

    expect(result).toEqual({ status: "UPDATED", questionId: "question-1" });
    expect(fake.questionUpdate).toHaveBeenNthCalledWith(1, {
      where: { id: "question-1", quarantinedAt: { not: null } },
      data: { status: "NEEDS_REVIEW" },
    });
    expect(fake.reportCount).toHaveBeenCalledWith({
      where: { questionId: "question-1", status: "OPEN" },
    });
    expect(fake.questionFind).toHaveBeenCalledWith({
      where: { id: "question-1" },
      select: { importStatus: true },
    });
    expect(fake.questionUpdate).toHaveBeenNthCalledWith(2, {
      where: {
        id: "question-1",
        status: "NEEDS_REVIEW",
        quarantinedAt: { not: null },
      },
      data: { status: "PUBLISHED", quarantinedAt: null },
    });
  });

  it("keeps a question quarantined while another report remains open", async () => {
    const fake = fakeTransaction({ remainingOpenReports: 1 });

    const result = await transitionContentReportInTransaction(fake.transaction, {
      reportId: "report-1",
      action: "RESOLVE",
      note: "This report is complete",
    });

    expect(result).toEqual({ status: "UPDATED", questionId: "question-1" });
    expect(fake.questionUpdate).toHaveBeenCalledOnce();
    expect(fake.questionFind).not.toHaveBeenCalled();
    expect(fake.actionCreate).toHaveBeenCalledOnce();
  });

  it("keeps the question hidden when the latest import still needs review", async () => {
    const fake = fakeTransaction({ importStatus: "NEEDS_REVIEW" });

    const result = await transitionContentReportInTransaction(fake.transaction, {
      reportId: "report-1",
      action: "RESOLVE",
      note: "Report triaged before the source is publishable",
    });

    expect(result).toEqual({ status: "UPDATED", questionId: "question-1" });
    expect(fake.questionUpdate).toHaveBeenNthCalledWith(2, {
      where: {
        id: "question-1",
        status: "NEEDS_REVIEW",
        quarantinedAt: { not: null },
      },
      data: { status: "NEEDS_REVIEW", quarantinedAt: null },
    });
  });

  it("does not change a question after the report leaves the required state", async () => {
    const fake = fakeTransaction({ reportTransitionCount: 0 });

    const result = await transitionContentReportInTransaction(fake.transaction, {
      reportId: "report-1",
      action: "QUARANTINE",
    });

    expect(result).toEqual({ status: "STATE_CONFLICT" });
    expect(fake.questionUpdate).not.toHaveBeenCalled();
    expect(fake.actionCreate).not.toHaveBeenCalled();
  });

  it("aborts the transaction when the question changes after the report claim", async () => {
    const fake = fakeTransaction({ questionTransitionCount: 0 });

    await expect(transitionContentReportInTransaction(fake.transaction, {
      reportId: "report-1",
      action: "QUARANTINE",
    })).rejects.toThrow();

    expect(fake.reportUpdate).toHaveBeenCalledOnce();
    expect(fake.questionUpdate).toHaveBeenCalledOnce();
    expect(fake.actionCreate).not.toHaveBeenCalled();
  });

  it("distinguishes a missing report without attempting a catalog mutation", async () => {
    const fake = fakeTransaction({ reportTransitionCount: 0, report: null });

    const result = await transitionContentReportInTransaction(fake.transaction, {
      reportId: "missing-report",
      action: "RESOLVE",
    });

    expect(result).toEqual({ status: "NOT_FOUND" });
    expect(fake.questionUpdate).not.toHaveBeenCalled();
    expect(fake.actionCreate).not.toHaveBeenCalled();
  });

  it("stops before the report claim when the operator security state changed", async () => {
    const fake = fakeTransaction({ securityClaimCount: 0 });

    const result = await transitionContentReportInTransaction(fake.transaction, {
      reportId: "report-1",
      action: "REOPEN",
      actor: { id: "operator-1", role: "CONTENT_EDITOR", sessionVersion: 4 },
    });

    expect(result).toEqual({ status: "SECURITY_CONFLICT" });
    expect(fake.reportUpdate).not.toHaveBeenCalled();
    expect(fake.actionCreate).not.toHaveBeenCalled();
  });
});
