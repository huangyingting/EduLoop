import type { HintPayload } from "@/lib/contracts/practice";
import { HINT_STATUS, QUESTION_STATUS } from "@/lib/domain-constants";
import { buildSolvingStrategy } from "@/lib/hints";
import { prisma } from "@/lib/prisma";

export const approvedHintWhere = { reviewStatus: HINT_STATUS.APPROVED } as const;

// Returns the requested step of a question's approved hints, or the generic
// solving strategy when the question has none. Null means the question is not
// served or the step does not exist.
export async function questionHint(questionId: string, step: number): Promise<HintPayload | null> {
  const question = await prisma.question.findFirst({
    where: { id: questionId, status: QUESTION_STATUS.PUBLISHED },
    select: {
      type: true,
      difficulty: true,
      tags: { include: { tag: { include: { dimension: true } } } },
      hints: { where: approvedHintWhere, orderBy: [{ position: "asc" }, { createdAt: "asc" }], select: { content: true } },
    },
  });
  if (!question) return null;
  if (!question.hints.length) {
    return step === 0 ? { kind: "STRATEGY", hint: buildSolvingStrategy(question), step: 0, total: 0 } : null;
  }
  const hint = question.hints[step];
  return hint ? { kind: "HINT", hint: hint.content, step, total: question.hints.length } : null;
}
