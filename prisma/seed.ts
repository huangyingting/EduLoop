import { PrismaClient, type Prisma } from "@prisma/client";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  GRADE_BANDS, GRADES, SUBJECTS, TAG_DIMENSIONS, normalizeSourceQuestion,
  type NormalizedTag, type SourceQuestion,
} from "../src/lib/content";
import { DEFAULT_CONTENT_LOCALE, contentFilesForLocale } from "../src/lib/content-manifest";

const prisma = new PrismaClient();
const dataDirectory = path.resolve(process.cwd(), "data", DEFAULT_CONTENT_LOCALE);

async function seedCatalog() {
  for (const subject of SUBJECTS) {
    await prisma.subject.upsert({ where: { slug: subject.slug }, update: subject, create: subject });
  }
  for (const band of GRADE_BANDS) {
    await prisma.gradeBand.upsert({ where: { slug: band.slug }, update: band, create: band });
  }
  const bands = new Map((await prisma.gradeBand.findMany()).map((item) => [item.slug, item.id]));
  for (const [slug, name, bandSlug, sortOrder] of GRADES) {
    await prisma.grade.upsert({
      where: { slug },
      update: { name, sortOrder, gradeBandId: bands.get(bandSlug)! },
      create: { slug, name, sortOrder, gradeBandId: bands.get(bandSlug)! },
    });
  }
  for (const dimension of TAG_DIMENSIONS) {
    await prisma.tagDimension.upsert({ where: { key: dimension.key }, update: dimension, create: dimension });
  }
  const badges = [
    { slug: "first-spark", name: "第一束光", description: "完成第一道练习", icon: "✦", threshold: 1 },
    { slug: "ten-in-a-row", name: "连胜新星", description: "连续答对 10 题", icon: "⚡", threshold: 10 },
    { slug: "century-club", name: "百题探索家", description: "累计完成 100 题", icon: "◎", threshold: 100 },
  ];
  for (const badge of badges) await prisma.badge.upsert({ where: { slug: badge.slug }, update: badge, create: badge });
}

async function ensureTags(allTags: NormalizedTag[]) {
  const dimensions = new Map((await prisma.tagDimension.findMany()).map((item) => [item.key, item.id]));
  const unique = new Map<string, NormalizedTag>();
  for (const tag of allTags) unique.set(`${tag.dimension}:${tag.slug}`, tag);
  for (const tag of unique.values()) {
    const dimensionId = dimensions.get(tag.dimension)!;
    await prisma.tag.upsert({
      where: { dimensionId_slug: { dimensionId, slug: tag.slug } },
      update: { label: tag.label }, create: { dimensionId, slug: tag.slug, label: tag.label },
    });
  }
  return new Map((await prisma.tag.findMany({ include: { dimension: true } })).map((tag) => [`${tag.dimension.key}:${tag.slug}`, tag.id]));
}

async function main() {
  await seedCatalog();
  const filenames = contentFilesForLocale(DEFAULT_CONTENT_LOCALE);
  const normalized = [];
  for (const filename of filenames) {
    const body = (await readFile(path.join(dataDirectory, filename), "utf8")).replace(/^\uFEFF/, "");
    const questions = JSON.parse(body) as SourceQuestion[];
    normalized.push(...questions.map((question) => normalizeSourceQuestion(question, filename)));
  }

  const subjectIds = new Map((await prisma.subject.findMany()).map((item) => [item.name, item.id]));
  const bandIds = new Map((await prisma.gradeBand.findMany()).map((item) => [item.name, item.id]));
  const gradeIds = new Map((await prisma.grade.findMany()).map((item) => [item.name, item.id]));
  const tagIds = await ensureTags(normalized.flatMap((question) => question.tags));
  const curatedLinks = new Set((await prisma.questionTag.findMany({
    where: { source: "CURATED" }, select: { questionId: true, tagId: true },
  })).map((link) => `${link.questionId}:${link.tagId}`));
  const curatedAssets = new Set((await prisma.questionAsset.findMany({
    where: { source: "CURATED" }, select: { questionId: true, role: true },
  })).map((asset) => `${asset.questionId}:${asset.role}`));

  const batchSize = 75;
  for (let offset = 0; offset < normalized.length; offset += batchSize) {
    const batchQuestions = normalized.slice(offset, offset + batchSize);
    const importedStatuses = new Map<string, string[]>();
    const batch: Prisma.PrismaPromise<unknown>[] = batchQuestions.map((question) => {
      const {
        subjectName,
        gradeBandName,
        gradeName,
        options,
        assets,
        tags,
        status: importStatus,
        ...data
      } = question;
      const sourceIds = importedStatuses.get(importStatus) ?? [];
      sourceIds.push(question.sourceId);
      importedStatuses.set(importStatus, sourceIds);
      const relational = {
        subjectId: subjectIds.get(subjectName)!, gradeBandId: bandIds.get(gradeBandName)!, gradeId: gradeIds.get(gradeName)!,
      };
      const optionCreates = options.map((option) => ({ label: option.label, content: option.content, sortOrder: option.sortOrder }));
      const tagCreates = tags.map((tag) => ({
        tagId: tagIds.get(`${tag.dimension}:${tag.slug}`)!, confidence: tag.confidence, source: tag.source,
      })).filter((tag) => !curatedLinks.has(`${question.id}:${tag.tagId}`));
      const assetCreates = assets.filter((asset) => !curatedAssets.has(`${question.id}:${asset.role}`));
      return prisma.question.upsert({
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
          options: { deleteMany: {}, create: optionCreates },
          assets: { deleteMany: { source: { not: "CURATED" } }, create: assetCreates },
          tags: { deleteMany: { source: { not: "CURATED" } }, create: tagCreates },
        },
      });
    });
    for (const [importStatus, sourceIds] of importedStatuses) {
      batch.push(prisma.question.updateMany({
        where: { sourceId: { in: sourceIds }, quarantinedAt: null },
        data: { status: importStatus },
      }));
    }
    await prisma.$transaction(batch);
    console.log(`Imported ${Math.min(offset + batchSize, normalized.length)} / ${normalized.length}`);
  }

  const [published, review, autoGradable] = await Promise.all([
    prisma.question.count({ where: { status: "PUBLISHED" } }),
    prisma.question.count({ where: { status: "NEEDS_REVIEW" } }),
    prisma.question.count({ where: { isAutoGradable: true } }),
  ]);
  console.log(`Seed complete: ${normalized.length} questions (${published} published, ${review} need review, ${autoGradable} auto-gradable).`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
