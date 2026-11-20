import { createHash } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import { CONTEST_RULES, type ContestSlot } from "@/lib/contest-papers";
import type { NormalizedTag, normalizeSourceQuestion } from "@/lib/content";
import { removeQuestionHistory } from "@/lib/practice/history-removal";
import { applyRevision } from "@/lib/studio/apply-revision";
import { HINT_SOURCE, HINT_STATUS, TAG_SOURCE } from "@/lib/domain-constants";

export type CatalogQuestion = ReturnType<typeof normalizeSourceQuestion>;

export const FULL_CATALOG_SCOPE = "catalog";

// A question removed from the source is deleted together with every attempt,
// review item, saved entry, report, and translation that refers to it, and its
// attempts are taken out of learner XP, activity, and statistics; learner
// history is not kept for removed content. A routine import may delete a
// handful of questions without operator input. Anything larger usually means a
// missing data file or a changed ID scheme, so it must be confirmed with an
// explicit allowance.
const AUTOMATIC_DELETE_MINIMUM = 5;
const AUTOMATIC_DELETE_RATIO = 0.01;
const DEFAULT_TRANSACTION_TIMEOUT_MS = 10 * 60_000;

export type CatalogImportOptions = {
  dryRun?: boolean;
  allowDelete?: number;
  // Limit deletion to questions imported from these files. The full catalog
  // import leaves this unset so a missing data file is detected.
  deleteScope?: { sourceFiles: string[] };
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
  deleted: number;
};

export class CatalogImportRefused extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CatalogImportRefused";
  }
}

type ExistingQuestion = { id: string; sourceId: string };

export function automaticDeleteAllowance(storedQuestionCount: number) {
  return Math.max(AUTOMATIC_DELETE_MINIMUM, Math.floor(storedQuestionCount * AUTOMATIC_DELETE_RATIO));
}

export function planCatalogDeletion<T extends ExistingQuestion>(existing: T[], activeSourceIds: ReadonlySet<string>) {
  return existing.filter((question) => !activeSourceIds.has(question.sourceId));
}

export function assertCatalogImportAllowed(input: {
  sourceCount: number;
  storedQuestionCount: number;
  deleteCount: number;
  allowDelete?: number;
}) {
  if (input.sourceCount === 0) {
    throw new CatalogImportRefused("The source catalog is empty; refusing to delete every question.");
  }
  const allowance = Math.max(input.allowDelete ?? 0, automaticDeleteAllowance(input.storedQuestionCount));
  if (input.deleteCount > allowance) {
    throw new CatalogImportRefused(
      `Import would delete ${input.deleteCount} questions and their learner history (automatic allowance ${allowance}). `
      + `Confirm with --allow-delete=${input.deleteCount} if this is intended.`,
    );
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

export function catalogManifestHash(questionHashes: Array<{ sourceId: string; hash: string }>) {
  const digest = createHash("sha256");
  for (const { sourceId, hash } of [...questionHashes].sort((left, right) => left.sourceId.localeCompare(right.sourceId))) {
    digest.update(`${sourceId}:${hash}\n`);
  }
  return digest.digest("hex");
}

export function catalogImportScope(options: Pick<CatalogImportOptions, "deleteScope">) {
  return options.deleteScope
    ? `files:${[...options.deleteScope.sourceFiles].sort().join(",")}`
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

export async function importCatalog(
  client: PrismaClient,
  questions: CatalogQuestion[],
  options: CatalogImportOptions = {},
): Promise<CatalogImportSummary> {
  const startedAt = new Date();
  const batchSize = options.batchSize ?? 200;
  const scope = catalogImportScope(options);
  const activeSourceIds = new Set(questions.map((question) => question.sourceId));
  if (activeSourceIds.size !== questions.length) {
    throw new CatalogImportRefused("The source catalog contains duplicate source IDs.");
  }

  const hashed = questions.map((question) => ({ question, hash: catalogQuestionHash(question) }));
  const manifestHash = catalogManifestHash(hashed.map(({ question, hash }) => ({ sourceId: question.sourceId, hash })));

  const stored = await client.question.findMany({
    select: { id: true, sourceId: true, sourceFile: true, contentHash: true },
  });
  const storedBySourceId = new Map(stored.map((question) => [question.sourceId, question]));
  const inScope = options.deleteScope
    ? stored.filter((question) => options.deleteScope!.sourceFiles.includes(question.sourceFile))
    : stored;
  const removed = planCatalogDeletion(inScope, activeSourceIds);
  assertCatalogImportAllowed({
    sourceCount: questions.length,
    storedQuestionCount: inScope.length,
    deleteCount: removed.length,
    allowDelete: options.allowDelete,
  });

  const created = hashed.filter(({ question }) => !storedBySourceId.has(question.sourceId));
  const changed = hashed.filter(({ question, hash }) => {
    const current = storedBySourceId.get(question.sourceId);
    return current && current.contentHash !== hash;
  });
  const summary: CatalogImportSummary = {
    dryRun: Boolean(options.dryRun),
    skipped: false,
    manifestHash,
    total: questions.length,
    created: created.length,
    updated: changed.length,
    unchanged: questions.length - created.length - changed.length,
    deleted: removed.length,
  };
  if (options.dryRun) return summary;

  const latestRelease = await client.catalogRelease.findFirst({
    where: { scope },
    orderBy: { completedAt: "desc" },
    select: { manifestHash: true },
  });
  const nothingToWrite = !created.length && !changed.length && !removed.length;
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
        paperSlots,
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
        slots: paperSlots.map((slot) => ({ paperKey: slot.paperKey, problemNumber: slot.problemNumber, questionId: question.id })),
        hints: hints.map((hint) => ({
          questionId: question.id,
          position: hint.position,
          content: hint.content,
          source: HINT_SOURCE.DERIVED,
          reviewStatus: HINT_STATUS.APPROVED,
        })),
      };
    };

    // Papers come from every question's provenance; slots below reference them.
    const papers = new Map<string, ContestSlot>();
    for (const { question } of writes) for (const slot of question.paperSlots) papers.set(slot.paperKey, slot);
    for (const paper of papers.values()) {
      const rules = CONTEST_RULES[paper.level];
      const data = { year: paper.year, contest: paper.contest, level: paper.level, questionCount: rules.questionCount, durationMinutes: rules.durationMinutes };
      await transaction.contestPaper.upsert({ where: { key: paper.paperKey }, create: { key: paper.paperKey, ...data }, update: data });
    }

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
      const createdSlots = prepared.flatMap((row) => row.slots);
      if (createdSlots.length) await transaction.contestPaperSlot.createMany({ data: createdSlots });
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
          data: row.question,
        });
      }
      await transaction.questionOption.deleteMany({ where: { questionId: { in: ids } } });
      await transaction.questionOption.createMany({ data: prepared.flatMap((row) => row.options) });
      await transaction.questionTag.deleteMany({ where: { questionId: { in: ids }, source: { not: TAG_SOURCE.CURATED } } });
      await transaction.questionTag.createMany({ data: prepared.flatMap((row) => row.tags) });
      await transaction.questionAsset.deleteMany({ where: { questionId: { in: ids }, source: { not: TAG_SOURCE.CURATED } } });
      const assets = prepared.flatMap((row) => row.assets);
      if (assets.length) await transaction.questionAsset.createMany({ data: assets });
      // Derived hints follow the source; editor-curated hints are preserved, and
      // a derived hint an editor rejected stays rejected instead of returning.
      const rejected = new Set((await transaction.questionHint.findMany({
        where: { questionId: { in: ids }, source: HINT_SOURCE.DERIVED, reviewStatus: HINT_STATUS.REJECTED },
        select: { questionId: true, content: true },
      })).map((hint) => `${hint.questionId}\u0000${hint.content}`));
      await transaction.questionHint.deleteMany({
        where: { questionId: { in: ids }, source: HINT_SOURCE.DERIVED, reviewStatus: { not: HINT_STATUS.REJECTED } },
      });
      const changedHints = prepared.flatMap((row) => row.hints)
        .filter((hint) => !rejected.has(`${hint.questionId}\u0000${hint.content}`));
      if (changedHints.length) await transaction.questionHint.createMany({ data: changedHints });
      await transaction.contestPaperSlot.deleteMany({ where: { questionId: { in: ids } } });
      const changedSlots = prepared.flatMap((row) => row.slots);
      if (changedSlots.length) await transaction.contestPaperSlot.createMany({ data: changedSlots });

      // An approved editorial revision overrides the import; re-apply it so the
      // learner-facing content stays as the editor left it.
      const revised = await transaction.question.findMany({
        where: { id: { in: ids }, revisionId: { not: null } },
        select: { revisionId: true },
      });
      if (revised.length) {
        const revisions = await transaction.questionRevision.findMany({
          where: { id: { in: revised.map(({ revisionId }) => revisionId!) } },
        });
        for (const revision of revisions) await applyRevision(transaction, revision);
      }

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

    // Attempts do not cascade with their question, so they go first and are
    // also taken out of the learner counters they fed; options, tags, assets,
    // hints, slots, revisions, review items, saved entries, reports (with their
    // moderation actions), and translations cascade.
    for (const batch of chunks(removed.map(({ id }) => id), batchSize)) {
      await removeQuestionHistory(transaction, batch);
      await transaction.question.deleteMany({ where: { id: { in: batch } } });
    }

    await transaction.catalogRelease.create({ data: {
      scope,
      manifestHash,
      questionCount: questions.length,
      created: summary.created,
      updated: summary.updated,
      unchanged: summary.unchanged,
      deleted: summary.deleted,
      startedAt,
    } });
  }, { timeout: options.transactionTimeoutMs ?? DEFAULT_TRANSACTION_TIMEOUT_MS, maxWait: 30_000 });

  return summary;
}
