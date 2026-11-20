import { invalidateCatalogCache } from "@/lib/catalog-cache";
import { HINT_SOURCE, HINT_STATUS } from "@/lib/domain-constants";
import { prisma } from "@/lib/prisma";

// Editors add hints that survive imports, or reject a derived hint. A rejected
// derived hint is kept so the next import does not recreate it.
export async function addCuratedHint(questionId: string, content: string, position?: number) {
  const question = await prisma.question.findUnique({ where: { id: questionId }, select: { id: true } });
  if (!question) return null;
  const last = await prisma.questionHint.findFirst({ where: { questionId }, orderBy: { position: "desc" }, select: { position: true } });
  const hint = await prisma.questionHint.create({
    data: { questionId, content, position: position ?? (last ? last.position + 1 : 0), source: HINT_SOURCE.CURATED, reviewStatus: HINT_STATUS.APPROVED },
    select: { id: true, content: true, position: true, source: true, reviewStatus: true },
  });
  invalidateCatalogCache();
  return hint;
}

export async function setHintStatus(hintId: string, reviewStatus: string) {
  const updated = await prisma.questionHint.updateMany({ where: { id: hintId }, data: { reviewStatus } });
  return updated.count > 0;
}
