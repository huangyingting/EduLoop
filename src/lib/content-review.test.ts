import type { Prisma } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { transitionContentReportInTransaction } from "./content-review";

function fakeTransaction(options: {
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
  const questionUpdate = vi.fn().mockResolvedValue({ count: options.questionTransitionCount ?? 1 });
  const actionCreate = vi.fn().mockResolvedValue({ id: "action-1" });
  const transaction = {
    user: { updateMany: userUpdate },
    questionReport: { updateMany: reportUpdate, findUnique: reportFind },
    question: { updateMany: questionUpdate },
    contentReviewAction: { create: actionCreate },
  } as unknown as Prisma.TransactionClient;
  return { transaction, userUpdate, reportUpdate, reportFind, questionUpdate, actionCreate };
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
      where: { id: "question-1", status: "PUBLISHED" },
      data: { status: "NEEDS_REVIEW" },
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
