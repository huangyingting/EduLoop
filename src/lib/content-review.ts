import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { claimAuthenticatedSecurityState } from "@/lib/security-state";

const MAX_TRANSITION_ATTEMPTS = 3;

class ContentReviewStateConflict extends Error {}

export type ContentReviewTransitionAction = "QUARANTINE" | "RESOLVE" | "REOPEN";

export type ContentReviewTransitionInput = {
  reportId: string;
  action: ContentReviewTransitionAction;
  note?: string;
  actor?: {
    id: string;
    role: string;
    sessionVersion: number;
  };
  transitionedAt?: Date;
};

export type ContentReviewTransitionResult =
  | { status: "NOT_FOUND" | "SECURITY_CONFLICT" | "STATE_CONFLICT" }
  | { status: "UPDATED"; questionId: string };

async function missingOrChangedReport(
  transaction: Prisma.TransactionClient,
  reportId: string,
): Promise<ContentReviewTransitionResult> {
  const report = await transaction.questionReport.findUnique({
    where: { id: reportId },
    select: { id: true },
  });
  return { status: report ? "STATE_CONFLICT" : "NOT_FOUND" };
}

export async function transitionContentReportInTransaction(
  transaction: Prisma.TransactionClient,
  input: ContentReviewTransitionInput,
): Promise<ContentReviewTransitionResult> {
  if (input.actor) {
    const secured = await claimAuthenticatedSecurityState(transaction, {
      userId: input.actor.id,
      sessionVersion: input.actor.sessionVersion,
      role: input.actor.role,
    });
    if (!secured) return { status: "SECURITY_CONFLICT" };
  }

  const transitionedAt = input.transitionedAt ?? new Date();
  const transitioned = input.action === "QUARANTINE"
    ? await transaction.questionReport.updateMany({
      where: { id: input.reportId, status: "OPEN" },
      // Claim and lock the report row before changing its question. Touching
      // updatedAt also makes quarantine visible as report activity while the
      // immutable action below remains the authoritative audit record.
      data: { updatedAt: transitionedAt },
    })
    : input.action === "RESOLVE"
      ? await transaction.questionReport.updateMany({
        where: { id: input.reportId, status: "OPEN" },
        data: { status: "RESOLVED", resolvedAt: transitionedAt },
      })
      : await transaction.questionReport.updateMany({
        where: { id: input.reportId, status: "RESOLVED" },
        data: { status: "OPEN", resolvedAt: null },
      });
  if (!transitioned.count) return missingOrChangedReport(transaction, input.reportId);

  const report = await transaction.questionReport.findUnique({
    where: { id: input.reportId },
    select: { questionId: true },
  });
  if (!report) throw new ContentReviewStateConflict();

  if (input.action === "QUARANTINE") {
    const quarantined = await transaction.question.updateMany({
      where: {
        id: report.questionId,
        status: "PUBLISHED",
        quarantinedAt: null,
      },
      data: { status: "NEEDS_REVIEW", quarantinedAt: transitionedAt },
    });
    // The report row has already been touched to claim its OPEN state. Throw
    // instead of returning so Prisma rolls that write back when the question
    // changed concurrently and no audit action can be recorded.
    if (!quarantined.count) throw new ContentReviewStateConflict();
  } else if (input.action === "RESOLVE") {
    // A catalog import updates importStatus but must leave the effective
    // status hidden while quarantined. Lock the question before counting the
    // remaining reports so simultaneous resolutions serialize per question;
    // the final resolver alone restores the latest audited import state.
    const lockedQuestion = await transaction.question.updateMany({
      where: { id: report.questionId, quarantinedAt: { not: null } },
      data: { status: "NEEDS_REVIEW" },
    });
    if (lockedQuestion.count) {
      const remainingOpenReports = await transaction.questionReport.count({
        where: { questionId: report.questionId, status: "OPEN" },
      });
      if (!remainingOpenReports) {
        const question = await transaction.question.findUnique({
          where: { id: report.questionId },
          select: { importStatus: true },
        });
        if (!question) throw new ContentReviewStateConflict();
        const restored = await transaction.question.updateMany({
          where: {
            id: report.questionId,
            status: "NEEDS_REVIEW",
            quarantinedAt: { not: null },
          },
          data: { status: question.importStatus, quarantinedAt: null },
        });
        if (!restored.count) throw new ContentReviewStateConflict();
      }
    }
  }

  await transaction.contentReviewAction.create({
    data: {
      reportId: input.reportId,
      actorId: input.actor?.id ?? null,
      action: input.action,
      note: input.note || null,
      createdAt: transitionedAt,
    },
  });
  return { status: "UPDATED", questionId: report.questionId };
}

function retryableTransitionConflict(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034";
}

export async function transitionContentReport(
  input: ContentReviewTransitionInput,
): Promise<ContentReviewTransitionResult> {
  for (let attempt = 0; attempt < MAX_TRANSITION_ATTEMPTS; attempt += 1) {
    try {
      return await prisma.$transaction((transaction) => (
        transitionContentReportInTransaction(transaction, input)
      ));
    } catch (error) {
      if (error instanceof ContentReviewStateConflict) return { status: "STATE_CONFLICT" };
      if (!retryableTransitionConflict(error)) throw error;
      if (attempt === MAX_TRANSITION_ATTEMPTS - 1) return { status: "STATE_CONFLICT" };
    }
  }
  return { status: "STATE_CONFLICT" };
}
