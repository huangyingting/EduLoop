import type { HintPayload } from "@/lib/contracts/practice";
import { HINT_STATUS, QUESTION_STATUS } from "@/lib/domain-constants";
import type { Locale } from "@/i18n/config";
import { buildSolvingStrategy } from "@/lib/hints";
import { prisma } from "@/lib/prisma";
import { questionTranslation } from "@/lib/question-translations";

export const approvedHintWhere = { reviewStatus: HINT_STATUS.APPROVED } as const;

// Returns the requested step of a question's approved hints, or the generic
// solving strategy when the question has none. Null means the question is not
// served or the step does not exist. When the question is shown in a
// translation, that translation's hints replace the default-language hints.
export async function questionHint(questionId: string, step: number, locale: Locale | null = null): Promise<HintPayload | null> {
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
  const translation = locale ? await questionTranslation(questionId, locale) : null;
  const hints = translation ? translation.hints : question.hints.map(({ content }) => content);
  if (!hints.length) {
    return step === 0 ? { kind: "STRATEGY", hint: buildSolvingStrategy(question, locale ?? undefined), step: 0, total: 0 } : null;
  }
  const hint = hints[step];
  return hint ? { kind: "HINT", hint, step, total: hints.length } : null;
}
