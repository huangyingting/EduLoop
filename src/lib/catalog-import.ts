import type { Prisma, PrismaClient } from "@prisma/client";
import type { NormalizedTag, normalizeSourceQuestion } from "@/lib/content";

export type CatalogQuestion = ReturnType<typeof normalizeSourceQuestion>;

export const RETIRED_STATUS = "RETIRED";

// A routine import may retire a handful of questions without operator input.
// Anything larger usually means a missing data file or a changed ID scheme, so
// it must be confirmed with an explicit allowance.
const AUTOMATIC_RETIRE_MINIMUM = 5;
const AUTOMATIC_RETIRE_RATIO = 0.01;

export type CatalogImportOptions = {
  dryRun?: boolean;
  allowRetire?: number;
  supersededSourceIds?: Record<string, string>;
  // Limit retirement to questions imported from these files. The full catalog
  // import leaves this unset so a missing data file is detected.
  retireScope?: { sourceFiles: string[] };
  now?: Date;
  batchSize?: number;
  onProgress?: (imported: number, total: number) => void;
};

export type CatalogImportSummary = {
  dryRun: boolean;
  total: number;
  created: number;
  updated: number;
  retired: number;
  revived: number;
  superseded: number;
};

export class CatalogImportRefused extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CatalogImportRefused";
  }
}

type ExistingQuestion = { id: string; sourceId: string; retiredAt: Date | null; supersededById: string | null };

export function automaticRetireAllowance(activeQuestionCount: number) {
  return Math.max(AUTOMATIC_RETIRE_MINIMUM, Math.floor(activeQuestionCount * AUTOMATIC_RETIRE_RATIO));
}

export function planCatalogRetirement(existing: ExistingQuestion[], activeSourceIds: ReadonlySet<string>) {
  return {
    retire: existing.filter((question) => !activeSourceIds.has(question.sourceId) && !question.retiredAt),
    revive: existing.filter((question) => activeSourceIds.has(question.sourceId) && question.retiredAt),
  };
}

export function assertCatalogImportAllowed(input: {
  sourceCount: number;
  activeQuestionCount: number;
  retireCount: number;
  allowRetire?: number;
}) {
  if (input.sourceCount === 0) {
    throw new CatalogImportRefused("The source catalog is empty; refusing to retire every question.");
  }
  const allowance = Math.max(input.allowRetire ?? 0, automaticRetireAllowance(input.activeQuestionCount));
  if (input.retireCount > allowance) {
    throw new CatalogImportRefused(
      `Import would retire ${input.retireCount} questions (automatic allowance ${allowance}). `
      + `Confirm with --allow-retire=${input.retireCount} if this is intended.`,
    );
  }
}

export function validateSupersededSourceIds(
  mapping: Record<string, string>,
  activeSourceIds: ReadonlySet<string>,
) {
  for (const [retiredSourceId, replacementSourceId] of Object.entries(mapping)) {
    if (activeSourceIds.has(retiredSourceId)) {
      throw new CatalogImportRefused(`Superseded question ${retiredSourceId} is still present in the source catalog.`);
    }
    if (!activeSourceIds.has(replacementSourceId)) {
      throw new CatalogImportRefused(`Replacement question ${replacementSourceId} for ${retiredSourceId} is not in the source catalog.`);
    }
  }
}

async function ensureTags(client: PrismaClient, allTags: NormalizedTag[]) {
  const dimensions = new Map((await client.tagDimension.findMany()).map((item) => [item.key, item.id]));
  const unique = new Map<string, NormalizedTag>();
  for (const tag of allTags) unique.set(`${tag.dimension}:${tag.slug}`, tag);
  for (const tag of unique.values()) {
    const dimensionId = dimensions.get(tag.dimension);
    if (!dimensionId) throw new Error(`Unknown tag dimension ${tag.dimension}`);
    await client.tag.upsert({
      where: { dimensionId_slug: { dimensionId, slug: tag.slug } },
      update: { label: tag.label },
      create: { dimensionId, slug: tag.slug, label: tag.label },
    });
  }
  return new Map((await client.tag.findMany({ include: { dimension: true } }))
    .map((tag) => [`${tag.dimension.key}:${tag.slug}`, tag.id]));
}

// Move learner history from a retired duplicate onto its replacement. Composite
// learner/question rows keep the replacement's existing record when both exist.
async function supersedeQuestion(
  transaction: Prisma.TransactionClient,
  retiredId: string,
  replacementId: string,
) {
  await transaction.practiceAttempt.updateMany({
    where: { questionId: retiredId },
    data: { questionId: replacementId },
  });

  const reviewConflicts = await transaction.reviewItem.findMany({
    where: { questionId: replacementId, learner: { reviewItems: { some: { questionId: retiredId } } } },
    select: { learnerId: true },
  });
  if (reviewConflicts.length) {
    await transaction.reviewItem.deleteMany({
      where: { questionId: retiredId, learnerId: { in: reviewConflicts.map(({ learnerId }) => learnerId) } },
    });
  }
  await transaction.reviewItem.updateMany({
    where: { questionId: retiredId },
    data: { questionId: replacementId },
  });

  const savedConflicts = await transaction.savedQuestion.findMany({
    where: { questionId: replacementId, learner: { savedQuestions: { some: { questionId: retiredId } } } },
    select: { learnerId: true },
  });
  if (savedConflicts.length) {
    await transaction.savedQuestion.deleteMany({
      where: { questionId: retiredId, learnerId: { in: savedConflicts.map(({ learnerId }) => learnerId) } },
    });
  }
  await transaction.savedQuestion.updateMany({
    where: { questionId: retiredId },
    data: { questionId: replacementId },
  });

  // Reports describe the retired wording, so they stay attached to it.
  await transaction.question.update({
    where: { id: retiredId },
    data: { supersededById: replacementId },
  });
}

export async function importCatalog(
  client: PrismaClient,
  questions: CatalogQuestion[],
  options: CatalogImportOptions = {},
): Promise<CatalogImportSummary> {
  const now = options.now ?? new Date();
  const batchSize = options.batchSize ?? 75;
  const supersededSourceIds = options.supersededSourceIds ?? {};
  const activeSourceIds = new Set(questions.map((question) => question.sourceId));
  if (activeSourceIds.size !== questions.length) {
    throw new CatalogImportRefused("The source catalog contains duplicate source IDs.");
  }
  validateSupersededSourceIds(supersededSourceIds, activeSourceIds);

  const existing = await client.question.findMany({
    where: options.retireScope ? { sourceFile: { in: options.retireScope.sourceFiles } } : undefined,
    select: { id: true, sourceId: true, retiredAt: true, supersededById: true },
  });
  const existingBySourceId = new Map(existing.map((question) => [question.sourceId, question]));
  const plan = planCatalogRetirement(existing, activeSourceIds);
  assertCatalogImportAllowed({
    sourceCount: questions.length,
    activeQuestionCount: existing.filter((question) => !question.retiredAt).length,
    retireCount: plan.retire.length,
    allowRetire: options.allowRetire,
  });

  const created = questions.filter((question) => !existingBySourceId.has(question.sourceId)).length;
  const pendingSupersessions = Object.entries(supersededSourceIds).flatMap(([retiredSourceId, replacementSourceId]) => {
    const retired = existingBySourceId.get(retiredSourceId);
    if (!retired) return [];
    const replacementId = existingBySourceId.get(replacementSourceId)?.id
      ?? questions.find((question) => question.sourceId === replacementSourceId)!.id;
    return retired.supersededById === replacementId ? [] : [{ retiredId: retired.id, replacementId }];
  });
  const summary: CatalogImportSummary = {
    dryRun: Boolean(options.dryRun),
    total: questions.length,
    created,
    updated: questions.length - created,
    retired: plan.retire.length,
    revived: plan.revive.length,
    superseded: pendingSupersessions.length,
  };
  if (options.dryRun) return summary;

  const tagIds = await ensureTags(client, questions.flatMap((question) => question.tags));
  const curatedLinks = new Set((await client.questionTag.findMany({
    where: { source: "CURATED" }, select: { questionId: true, tagId: true },
  })).map((link) => `${link.questionId}:${link.tagId}`));
  const curatedAssets = new Set((await client.questionAsset.findMany({
    where: { source: "CURATED" }, select: { questionId: true, role: true },
  })).map((asset) => `${asset.questionId}:${asset.role}`));
  const subjectIds = new Map((await client.subject.findMany()).map((item) => [item.name, item.id]));
  const bandIds = new Map((await client.gradeBand.findMany()).map((item) => [item.name, item.id]));
  const gradeIds = new Map((await client.grade.findMany()).map((item) => [item.name, item.id]));
  const requireId = (ids: Map<string, string>, name: string, kind: string) => {
    const id = ids.get(name);
    if (!id) throw new Error(`Unknown ${kind} ${name}`);
    return id;
  };

  for (let offset = 0; offset < questions.length; offset += batchSize) {
    const batchQuestions = questions.slice(offset, offset + batchSize);
    const importedStatuses = new Map<string, string[]>();
    const batch: Prisma.PrismaPromise<unknown>[] = batchQuestions.map((question) => {
      const {
        subjectName,
        gradeBandName,
        gradeName,
        options: questionOptions,
        assets,
        tags,
        status: importStatus,
        ...data
      } = question;
      const sourceIds = importedStatuses.get(importStatus) ?? [];
      sourceIds.push(question.sourceId);
      importedStatuses.set(importStatus, sourceIds);
      const relational = {
        subjectId: requireId(subjectIds, subjectName, "subject"),
        gradeBandId: requireId(bandIds, gradeBandName, "grade band"),
        gradeId: requireId(gradeIds, gradeName, "grade"),
      };
      const optionCreates = questionOptions.map((option) => ({ label: option.label, content: option.content, sortOrder: option.sortOrder }));
      const tagCreates = tags.map((tag) => ({
        tagId: tagIds.get(`${tag.dimension}:${tag.slug}`)!, confidence: tag.confidence, source: tag.source,
      })).filter((tag) => !curatedLinks.has(`${question.id}:${tag.tagId}`));
      const assetCreates = assets.filter((asset) => !curatedAssets.has(`${question.id}:${asset.role}`));
      return client.question.upsert({
        where: { sourceId: question.sourceId },
        create: {
          ...data,
          ...relational,
          importStatus,
          status: importStatus,
          options: { create: optionCreates },
          assets: { create: assetCreates },
          tags: { create: tagCreates },
        },
        // Runtime quarantine is deliberately absent from this update. Import
        // content and its audited eligibility first, then synchronize the
        // effective serving status only when no operator quarantine is active.
        update: {
          ...data,
          ...relational,
          importStatus,
          retiredAt: null,
          supersededById: null,
          options: { deleteMany: {}, create: optionCreates },
          assets: { deleteMany: { source: { not: "CURATED" } }, create: assetCreates },
          tags: { deleteMany: { source: { not: "CURATED" } }, create: tagCreates },
        },
      });
    });
    for (const [importStatus, sourceIds] of importedStatuses) {
      batch.push(client.question.updateMany({
        where: { sourceId: { in: sourceIds }, quarantinedAt: null },
        data: { status: importStatus },
      }));
    }
    await client.$transaction(batch);
    options.onProgress?.(Math.min(offset + batchSize, questions.length), questions.length);
  }

  // Retirement hides a question from every serving path while keeping all
  // learner and moderation history attached to it. An active quarantine stays
  // hidden; resolving its final report restores importStatus, which is RETIRED.
  const retireIds = plan.retire.map(({ id }) => id);
  if (retireIds.length || pendingSupersessions.length) {
    await client.$transaction(async (transaction) => {
      if (retireIds.length) {
        await transaction.question.updateMany({
          where: { id: { in: retireIds } },
          data: { importStatus: RETIRED_STATUS, retiredAt: now },
        });
        await transaction.question.updateMany({
          where: { id: { in: retireIds }, quarantinedAt: null },
          data: { status: RETIRED_STATUS },
        });
      }
      for (const { retiredId, replacementId } of pendingSupersessions) {
        await supersedeQuestion(transaction, retiredId, replacementId);
      }
    }, { timeout: 60_000 });
  }

  return summary;
}
