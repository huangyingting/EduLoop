import { PrismaClient } from "@prisma/client";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { CatalogImportRefused, importCatalog } from "../src/lib/catalog-import";
import { importTranslations, normalizeTranslatedQuestion } from "../src/lib/catalog-translations";
import {
  GRADE_BANDS, GRADES, SUBJECTS, TAG_DIMENSIONS, normalizeSourceQuestion,
  type SourceQuestion,
} from "../src/lib/content";
import { BADGE_CATALOG } from "../src/lib/practice/badge-catalog";
import { CONTENT_MANIFEST, DEFAULT_CONTENT_LOCALE, contentFilesForLocale } from "../src/lib/content-manifest";
import {
  finishOperatorCommand,
  operatorCommandFailureEntry,
  startOperatorCommand,
} from "../src/lib/operator-command";

const prisma = new PrismaClient();
const dataRoot = path.resolve(process.cwd(), "data");
const commandTiming = startOperatorCommand();

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
  for (const { rule, ...badge } of BADGE_CATALOG) {
    const data = { ...badge, rule: JSON.stringify(rule) };
    await prisma.badge.upsert({ where: { slug: badge.slug }, update: data, create: data });
  }
}

function parseArguments(argv: string[]) {
  const dryRun = argv.includes("--dry-run");
  const allowDeleteArgument = argv.find((value) => value.startsWith("--allow-delete="))?.split("=")[1]
    ?? process.env.CATALOG_ALLOW_DELETE;
  const allowDelete = allowDeleteArgument === undefined || allowDeleteArgument === ""
    ? undefined
    : Number(allowDeleteArgument);
  if (allowDelete !== undefined && (!Number.isSafeInteger(allowDelete) || allowDelete < 0)) {
    throw new CatalogImportRefused("--allow-delete must be a non-negative integer.");
  }
  return { dryRun, allowDelete };
}

async function readArchive(locale: string, filename: string) {
  const body = (await readFile(path.join(dataRoot, locale, filename), "utf8")).replace(/^\uFEFF/, "");
  return JSON.parse(body) as SourceQuestion[];
}

// Collections that also exist in another language are imported as
// translations of the default-locale questions with the same IDs.
async function seedTranslations(dryRun: boolean) {
  const filesByLocale = new Map<string, Set<string>>();
  for (const collection of Object.values(CONTENT_MANIFEST.collections)) {
    const locales = [collection.sourceLocale, ...collection.translatedLocales];
    if (!locales.includes(DEFAULT_CONTENT_LOCALE)) continue;
    for (const locale of locales.filter((value) => value !== DEFAULT_CONTENT_LOCALE)) {
      const files = filesByLocale.get(locale) ?? new Set<string>();
      for (const file of collection.files) files.add(file);
      filesByLocale.set(locale, files);
    }
  }
  const summaries = [];
  for (const [locale, files] of filesByLocale) {
    const translations = [];
    for (const filename of files) {
      for (const question of await readArchive(locale, filename)) {
        const translation = normalizeTranslatedQuestion(question, locale, filename);
        if (translation) translations.push(translation);
      }
    }
    summaries.push(await importTranslations(prisma, locale, translations, { dryRun }));
  }
  return summaries;
}

async function main() {
  const { dryRun, allowDelete } = parseArguments(process.argv.slice(2));
  if (!dryRun) await seedCatalog();
  const filenames = contentFilesForLocale(DEFAULT_CONTENT_LOCALE);
  const normalized = [];
  for (const filename of filenames) {
    const questions = await readArchive(DEFAULT_CONTENT_LOCALE, filename);
    normalized.push(...questions.map((question) => normalizeSourceQuestion(question, filename)));
  }

  const summary = await importCatalog(prisma, normalized, {
    dryRun,
    allowDelete,
    onProgress: (imported, total) => console.info(JSON.stringify({
      level: "info",
      event: "catalog_seed_progress",
      imported,
      total,
    })),
  });

  const translations = await seedTranslations(dryRun);

  const [published, review, autoGradable] = await Promise.all([
    prisma.question.count({ where: { status: "PUBLISHED" } }),
    prisma.question.count({ where: { status: "NEEDS_REVIEW" } }),
    prisma.question.count({ where: { isAutoGradable: true, status: "PUBLISHED" } }),
  ]);
  return { ...summary, questions: normalized.length, published, needsReview: review, autoGradable, translations };
}

async function execute() {
  try {
    return await main();
  } finally {
    await prisma.$disconnect();
  }
}

void execute()
  .then((result) => {
    const completed = finishOperatorCommand(commandTiming);
    console.info(JSON.stringify({
      level: "info",
      event: "catalog_seed_completed",
      startedAt: completed.startedAt,
      completedAt: completed.finishedAt,
      durationMs: completed.durationMs,
      ...result,
    }));
  })
  .catch((error) => {
    console.error(JSON.stringify(operatorCommandFailureEntry(
      "catalog_seed",
      error,
      commandTiming,
    )));
    process.exitCode = 1;
  });
