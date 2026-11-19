import type { Prisma } from "@prisma/client";
import { TAG_DIMENSION, TAG_SOURCE } from "@/lib/domain-constants";

export type RevisionRow = {
  id: string; questionId: string; stem: string; optionsJson: string; answer: string;
  correctAnswer: string | null; explanation: string | null; topicTagIdsJson: string | null;
};

// Writes a revision onto the served question. Used at approval and again after
// every catalog import that rewrites the question, so edits survive re-seeding.
export async function applyRevision(transaction: Prisma.TransactionClient, revision: RevisionRow) {
  const options = JSON.parse(revision.optionsJson) as Array<{ label: string; content: string }>;
  const correctLabels = revision.correctAnswer ? JSON.parse(revision.correctAnswer) as string[] : [];
  await transaction.question.update({
    where: { id: revision.questionId },
    data: {
      stem: revision.stem,
      answer: revision.answer,
      correctAnswer: revision.correctAnswer,
      explanation: revision.explanation,
      isAutoGradable: correctLabels.length > 0 && options.length >= 2,
      revisionId: revision.id,
    },
  });
  await transaction.questionOption.deleteMany({ where: { questionId: revision.questionId } });
  if (options.length) {
    await transaction.questionOption.createMany({
      data: options.map((option, sortOrder) => ({ questionId: revision.questionId, label: option.label, content: option.content, sortOrder })),
    });
  }
  if (revision.topicTagIdsJson) {
    const topicTagIds = JSON.parse(revision.topicTagIdsJson) as string[];
    await transaction.questionTag.deleteMany({
      where: { questionId: revision.questionId, tag: { dimension: { key: TAG_DIMENSION.TOPIC } } },
    });
    if (topicTagIds.length) {
      await transaction.questionTag.createMany({
        data: topicTagIds.map((tagId) => ({ questionId: revision.questionId, tagId, confidence: 1, source: TAG_SOURCE.CURATED })),
      });
    }
  }
}

