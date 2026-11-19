import { createHash } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import type { NormalizedTag, normalizeSourceQuestion } from "@/lib/content";
import { HINT_SOURCE, HINT_STATUS, QUESTION_STATUS, TAG_SOURCE } from "@/lib/domain-constants";

export type CatalogQuestion = ReturnType<typeof normalizeSourceQuestion>;

export const RETIRED_STATUS = QUESTION_STATUS.RETIRED;
export const FULL_CATALOG_SCOPE = "catalog";

// A routine import may retire a handful of questions without operator input.
// Anything larger usually means a missing data file or a changed ID scheme, so
// it must be confirmed with an explicit allowance.
const AUTOMATIC_RETIRE_MINIMUM = 5;
const AUTOMATIC_RETIRE_RATIO = 0.01;
const DEFAULT_TRANSACTION_TIMEOUT_MS = 10 * 60_000;

export type CatalogImportOptions = {
  dryRun?: boolean;
  allowRetire?: number;
  supersededSourceIds?: Record<string, string>;
  // Limit retirement to questions imported from these files. The full catalog
  // import leaves this unset so a missing data file is detected.
  retireScope?: { sourceFiles: string[] };
  now?: Date;
  batchSize?: number;
  transactionTimeoutMs?: number;
  onProgress?: (written: number, total: number) => void;
};

export type CatalogImportSummary = {
  dryRun: boolean;
  skipped: boolean;
  manifestHash: string;
  total: number;
  created: number;
  updated: number;
  unchanged: number;
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

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort()
      .filter((key) => (value as Record<string, unknown>)[key] !== undefined)
      .map((key) => `${JSON.stringify(key)}:${stableStringify((value as Record<string, unknown>)[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

// The hash covers the complete normalized record, so a change to the source
// data or to the normalization code both mark the question for rewriting.
export function catalogQuestionHash(question: CatalogQuestion) {
  return createHash("sha256").update(stableStringify(question)).digest("hex");
}

export function catalogManifestHash(
  questionHashes: Array<{ sourceId: string; hash: string }>,
  supersededSourceIds: Record<string, string> = {},
) {
  const digest = createHash("sha256");
  for (const { sourceId, hash } of [...questionHashes].sort((left, right) => left.sourceId.localeCompare(right.sourceId))) {
    digest.update(`${sourceId}:${hash}\n`);
  }
  digest.update(stableStringify(supersededSourceIds));
  return digest.digest("hex");
}

export function catalogImportScope(options: Pick<CatalogImportOptions, "retireScope">) {
  return options.retireScope
    ? `files:${[...options.retireScope.sourceFiles].sort().join(",")}`
    : FULL_CATALOG_SCOPE;
}

function chunks<T>(items: T[], size: number) {
  const result: T[][] = [];
  for (let offset = 0; offset < items.length; offset += size) result.push(items.slice(offset, offset + size));
  return result;
}

async function ensureTags(transaction: Prisma.TransactionClient, allTags: NormalizedTag[]) {
  const dimensions = new Map((await transaction.tagDimension.findMany()).map((item) => [item.key, item.id]));
  const existing = new Map((await transaction.tag.findMany({ include: { dimension: true } }))
    .map((tag) => [`${tag.dimension.key}:${tag.slug}`, tag]));
  const unique = new Map<string, NormalizedTag>();
  for (const tag of allTags) unique.set(`${tag.dimension}:${tag.slug}`, tag);
  const missing: Prisma.TagCreateManyInput[] = [];
  for (const [key, tag] of unique) {
    const dimensionId = dimensions.get(tag.dimension);
    if (!dimensionId) throw new Error(`Unknown tag dimension ${tag.dimension}`);
    const current = existing.get(key);
    if (!current) missing.push({ dimensionId, slug: tag.slug, label: tag.label });
    else if (current.label !== tag.label) {
      await transaction.tag.update({ where: { id: current.id }, data: { label: tag.label } });
    }
  }
  if (missing.length) await transaction.tag.createMany({ data: missing });
  return new Map((await transaction.tag.findMany({ include: { dimension: true } }))
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
  const startedAt = new Date();
  const now = options.now ?? startedAt;
  const batchSize = options.batchSize ?? 200;
  const supersededSourceIds = options.supersededSourceIds ?? {};
  const scope = catalogImportScope(options);
  const activeSourceIds = new Set(questions.map((question) => question.sourceId));
  if (activeSourceIds.size !== questions.length) {
    throw new CatalogImportRefused("The source catalog contains duplicate source IDs.");
  }
  validateSupersededSourceIds(supersededSourceIds, activeSourceIds);

  const hashed = questions.map((question) => ({ question, hash: catalogQuestionHash(question) }));
  const manifestHash = catalogManifestHash(
    hashed.map(({ question, hash }) => ({ sourceId: question.sourceId, hash })),
    supersededSourceIds,
  );

  const stored = await client.question.findMany({
    select: { id: true, sourceId: true, sourceFile: true, retiredAt: true, supersededById: true, contentHash: true },
  });
  const storedBySourceId = new Map(stored.map((question) => [question.sourceId, question]));
  const inScope = options.retireScope
    ? stored.filter((question) => options.retireScope!.sourceFiles.includes(question.sourceFile))
    : stored;
  const plan = planCatalogRetirement(inScope, activeSourceIds);
  assertCatalogImportAllowed({
    sourceCount: questions.length,
    activeQuestionCount: inScope.filter((question) => !question.retiredAt).length,
    retireCount: plan.retire.length,
    allowRetire: options.allowRetire,
  });

  const created = hashed.filter(({ question }) => !storedBySourceId.has(question.sourceId));
  const changed = hashed.filter(({ question, hash }) => {
    const current = storedBySourceId.get(question.sourceId);
    return current && (current.contentHash !== hash || current.retiredAt);
  });
  const pendingSupersessions = Object.entries(supersededSourceIds).flatMap(([retiredSourceId, replacementSourceId]) => {
    const retired = storedBySourceId.get(retiredSourceId);
    if (!retired) return [];
    const replacementId = storedBySourceId.get(replacementSourceId)?.id
      ?? questions.find((question) => question.sourceId === replacementSourceId)!.id;
    return retired.supersededById === replacementId ? [] : [{ retiredId: retired.id, replacementId }];
  });
  const summary: CatalogImportSummary = {
    dryRun: Boolean(options.dryRun),
    skipped: false,
    manifestHash,
    total: questions.length,
    created: created.length,
    updated: changed.length,
    unchanged: questions.length - created.length - changed.length,
    retired: plan.retire.length,
    revived: plan.revive.length,
    superseded: pendingSupersessions.length,
  };
  if (options.dryRun) return summary;

  const latestRelease = await client.catalogRelease.findFirst({
    where: { scope },
    orderBy: { completedAt: "desc" },
    select: { manifestHash: true },
  });
  const nothingToWrite = !created.length && !changed.length && !plan.retire.length && !pendingSupersessions.length;
  if (nothingToWrite && latestRelease?.manifestHash === manifestHash) return { ...summary, skipped: true };

  const subjectIds = new Map((await client.subject.findMany()).map((item) => [item.name, item.id]));
  const bandIds = new Map((await client.gradeBand.findMany()).map((item) => [item.name, item.id]));
  const gradeIds = new Map((await client.grade.findMany()).map((item) => [item.name, item.id]));
  const requireId = (ids: Map<string, string>, name: string, kind: string) => {
    const id = ids.get(name);
    if (!id) throw new Error(`Unknown ${kind} ${name}`);
    return id;
  };

  // Every write below happens in one transaction: learners see either the
  // previous catalog or the complete new one, never a partially applied import.
  await client.$transaction(async (transaction) => {
    const writes = [...created, ...changed];
    const tagIds = await ensureTags(transaction, writes.flatMap(({ question }) => question.tags));
    const curatedLinks = new Set((await transaction.questionTag.findMany({
      where: { source: TAG_SOURCE.CURATED }, select: { questionId: true, tagId: true },
    })).map((link) => `${link.questionId}:${link.tagId}`));
    const curatedAssets = new Set((await transaction.questionAsset.findMany({
      where: { source: TAG_SOURCE.CURATED }, select: { questionId: true, role: true },
    })).map((asset) => `${asset.questionId}:${asset.role}`));

    const rows = ({ question, hash }: (typeof hashed)[number]) => {
      const {
        subjectName,
        gradeBandName,
        gradeName,
        options: questionOptions,
        assets,
        tags,
        hints,
        status: importStatus,
        ...data
      } = question;
      return {
        question: {
          ...data,
          subjectId: requireId(subjectIds, subjectName, "subject"),
          gradeBandId: requireId(bandIds, gradeBandName, "grade band"),
          gradeId: requireId(gradeIds, gradeName, "grade"),
          importStatus,
          contentHash: hash,
        },
        options: questionOptions.map((option) => ({
          questionId: question.id, label: option.label, content: option.content, sortOrder: option.sortOrder,
        })),
        tags: tags.map((tag) => ({
          questionId: question.id,
          tagId: tagIds.get(`${tag.dimension}:${tag.slug}`)!,
          confidence: tag.confidence,
          source: tag.source,
        })).filter((tag) => !curatedLinks.has(`${question.id}:${tag.tagId}`)),
        assets: assets
          .filter((asset) => !curatedAssets.has(`${question.id}:${asset.role}`))
          .map((asset) => ({ ...asset, questionId: question.id })),
        hints: hints.map((hint) => ({
          questionId: question.id,
          position: hint.position,
          content: hint.content,
          source: HINT_SOURCE.DERIVED,
          reviewStatus: HINT_STATUS.APPROVED,
        })),
      };
    };

    let written = 0;
    for (const batch of chunks(created, batchSize)) {
      const prepared = batch.map(rows);
      await transaction.question.createMany({
        // randomKey drives indexed random selection; it is assigned once and is
        // not part of the content hash, so re-imports keep the existing key.
        data: prepared.map((row) => ({ ...row.question, status: row.question.importStatus, randomKey: Math.random() })),
      });
      await transaction.questionOption.createMany({ data: prepared.flatMap((row) => row.options) });
      await transaction.questionTag.createMany({ data: prepared.flatMap((row) => row.tags) });
      const assets = prepared.flatMap((row) => row.assets);
      if (assets.length) await transaction.questionAsset.createMany({ data: assets });
      const createdHints = prepared.flatMap((row) => row.hints);
      if (createdHints.length) await transaction.questionHint.createMany({ data: createdHints });
      written += batch.length;
      options.onProgress?.(written, writes.length);
    }

    for (const batch of chunks(changed, batchSize)) {
      const prepared = batch.map(rows);
      const ids = batch.map(({ question }) => question.id);
      for (const row of prepared) {
        // Runtime quarantine is deliberately absent from this update. Content
        // and audited eligibility change first; the effective serving status is
        // synchronized below only when no operator quarantine is active.
        await transaction.question.update({
          where: { sourceId: row.question.sourceId },
          data: { ...row.question, retiredAt: null, supersededById: null },
        });
      }
      await transaction.questionOption.deleteMany({ where: { questionId: { in: ids } } });
      await transaction.questionOption.createMany({ data: prepared.flatMap((row) => row.options) });
      await transaction.questionTag.deleteMany({ where: { questionId: { in: ids }, source: { not: TAG_SOURCE.CURATED } } });
      await transaction.questionTag.createMany({ data: prepared.flatMap((row) => row.tags) });
      await transaction.questionAsset.deleteMany({ where: { questionId: { in: ids }, source: { not: TAG_SOURCE.CURATED } } });
      const assets = prepared.flatMap((row) => row.assets);
      if (assets.length) await transaction.questionAsset.createMany({ data: assets });
      // Derived hints follow the source; editor-curated hints are preserved.
      await transaction.questionHint.deleteMany({ where: { questionId: { in: ids }, source: HINT_SOURCE.DERIVED } });
      const changedHints = prepared.flatMap((row) => row.hints);
      if (changedHints.length) await transaction.questionHint.createMany({ data: changedHints });

      const idsByStatus = new Map<string, string[]>();
      for (const { question } of batch) {
        idsByStatus.set(question.status, [...(idsByStatus.get(question.status) ?? []), question.id]);
      }
      for (const [status, statusIds] of idsByStatus) {
        await transaction.question.updateMany({
          where: { id: { in: statusIds }, quarantinedAt: null },
          data: { status },
        });
      }
      written += batch.length;
      options.onProgress?.(written, writes.length);
    }

    // Retirement hides a question from every serving path while keeping all
    // learner and moderation history attached to it. An active quarantine stays
    // hidden; resolving its final report restores importStatus, which is RETIRED.
    const retireIds = plan.retire.map(({ id }) => id);
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

    await transaction.catalogRelease.create({ data: {
      scope,
      manifestHash,
      questionCount: questions.length,
      created: summary.created,
      updated: summary.updated,
      unchanged: summary.unchanged,
      retired: summary.retired,
      revived: summary.revived,
      superseded: summary.superseded,
      startedAt,
    } });
  }, { timeout: options.transactionTimeoutMs ?? DEFAULT_TRANSACTION_TIMEOUT_MS, maxWait: 30_000 });

  return summary;
}
