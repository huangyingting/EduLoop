import { invalidateCatalogCache } from "@/lib/catalog-cache";
import { REVISION_STATUS } from "@/lib/domain-constants";
import { prisma } from "@/lib/prisma";
import { claimAuthenticatedSecurityState } from "@/lib/security-state";
import { applyRevision } from "./apply-revision";
import { regradeQuestionAttempts, type RegradeSummary } from "./regrade";

export type RevisionInput = {
  questionId: string;
  stem: string;
  options: Array<{ label: string; content: string }>;
  answer: string;
  correctLabels: string[];
  explanation: string | null;
  topicTagIds: string[] | null;
  reason: string;
};

export type Operator = { id: string; sessionVersion: number; role: string };

export function requiresSecondApprover(
  environment: { CONTENT_REQUIRE_SECOND_APPROVER?: string } = { CONTENT_REQUIRE_SECOND_APPROVER: process.env.CONTENT_REQUIRE_SECOND_APPROVER },
) {
  return environment.CONTENT_REQUIRE_SECOND_APPROVER === "true";
}

function revisionChangesAnswerKey(
  revision: { correctAnswer: string | null; answer: string },
  question: { correctAnswer: string | null; answer: string },
) {
  return revision.correctAnswer !== question.correctAnswer || revision.answer !== question.answer;
}

export async function createRevision(input: RevisionInput, authorId: string) {
  const question = await prisma.question.findUnique({ where: { id: input.questionId }, select: { id: true } });
  if (!question) return { status: "NOT_FOUND" as const };
  const labels = new Set(input.options.map(({ label }) => label));
  if (input.correctLabels.some((label) => !labels.has(label))) return { status: "INVALID_ANSWER_KEY" as const };
  const revision = await prisma.questionRevision.create({ data: {
    questionId: input.questionId,
    stem: input.stem,
    optionsJson: JSON.stringify(input.options),
    answer: input.answer,
    correctAnswer: input.correctLabels.length ? JSON.stringify([...input.correctLabels].sort()) : null,
    explanation: input.explanation,
    topicTagIdsJson: input.topicTagIds ? JSON.stringify(input.topicTagIds) : null,
    reason: input.reason,
    authorId,
  } });
  return { status: "CREATED" as const, revision };
}

export type ReviewRevisionOutcome =
  | { status: "APPLIED"; regrade: RegradeSummary | null }
  | { status: "DECLINED" }
  | { status: "NOT_FOUND" | "STATE_CONFLICT" | "SECURITY_CONFLICT" | "SECOND_APPROVER_REQUIRED" };

export async function reviewRevision(
  revisionId: string,
  action: "APPROVE" | "REJECT",
  operator: Operator,
  note: string | null,
  now = new Date(),
): Promise<ReviewRevisionOutcome> {
  const outcome = await prisma.$transaction(async (transaction): Promise<ReviewRevisionOutcome> => {
    const secured = await claimAuthenticatedSecurityState(transaction, {
      userId: operator.id, sessionVersion: operator.sessionVersion, role: operator.role,
    });
    if (!secured) return { status: "SECURITY_CONFLICT" };
    const revision = await transaction.questionRevision.findUnique({
      where: { id: revisionId },
      include: { question: { select: { correctAnswer: true, answer: true, revisionId: true } } },
    });
    if (!revision) return { status: "NOT_FOUND" };
    const claimed = await transaction.questionRevision.updateMany({
      where: { id: revisionId, status: REVISION_STATUS.DRAFT },
      data: {
        status: action === "APPROVE" ? REVISION_STATUS.APPROVED : REVISION_STATUS.REJECTED,
        reviewerId: operator.id,
        reviewNote: note,
        reviewedAt: now,
      },
    });
    if (!claimed.count) return { status: "STATE_CONFLICT" };
    if (action === "REJECT") return { status: "DECLINED" };

    const changesKey = revisionChangesAnswerKey(revision, revision.question);
    if (changesKey && requiresSecondApprover() && revision.authorId === operator.id) {
      throw new SecondApproverRequired();
    }
    if (revision.question.revisionId) {
      await transaction.questionRevision.updateMany({
        where: { id: revision.question.revisionId, status: REVISION_STATUS.APPROVED },
        data: { status: REVISION_STATUS.SUPERSEDED },
      });
    }
    await applyRevision(transaction, revision);
    const regrade = changesKey
      ? await regradeQuestionAttempts(transaction, revision.questionId, revision.correctAnswer ? JSON.parse(revision.correctAnswer) as string[] : [], now)
      : null;
    return { status: "APPLIED", regrade };
  }, { timeout: 60_000 }).catch((error: unknown) => {
    if (error instanceof SecondApproverRequired) return { status: "SECOND_APPROVER_REQUIRED" as const };
    throw error;
  });
  if (outcome.status === "APPLIED") invalidateCatalogCache();
  return outcome;
}

class SecondApproverRequired extends Error {}
