import { PrismaClient } from "@prisma/client";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { CatalogImportRefused, RETIRED_STATUS, importCatalog } from "../src/lib/catalog-import";
import {
  GRADE_BANDS, GRADES, SUBJECTS, TAG_DIMENSIONS, normalizeSourceQuestion,
  type SourceQuestion,
} from "../src/lib/content";
import { CONTENT_MANIFEST, DEFAULT_CONTENT_LOCALE, contentFilesForLocale } from "../src/lib/content-manifest";
import {
  finishOperatorCommand,
  operatorCommandFailureEntry,
  startOperatorCommand,
} from "../src/lib/operator-command";

const prisma = new PrismaClient();
const dataDirectory = path.resolve(process.cwd(), "data", DEFAULT_CONTENT_LOCALE);
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
  const badges = [
    { slug: "first-spark", name: "第一束光", description: "完成第一道练习", icon: "✦", threshold: 1 },
    { slug: "ten-in-a-row", name: "连胜新星", description: "连续答对 10 题", icon: "⚡", threshold: 10 },
    { slug: "century-club", name: "百题探索家", description: "累计完成 100 题", icon: "◎", threshold: 100 },
  ];
  for (const badge of badges) await prisma.badge.upsert({ where: { slug: badge.slug }, update: badge, create: badge });
}

function parseArguments(argv: string[]) {
  const dryRun = argv.includes("--dry-run");
  const allowRetireArgument = argv.find((value) => value.startsWith("--allow-retire="))?.split("=")[1]
    ?? process.env.CATALOG_ALLOW_RETIRE;
  const allowRetire = allowRetireArgument === undefined || allowRetireArgument === ""
    ? undefined
    : Number(allowRetireArgument);
  if (allowRetire !== undefined && (!Number.isSafeInteger(allowRetire) || allowRetire < 0)) {
    throw new CatalogImportRefused("--allow-retire must be a non-negative integer.");
  }
  return { dryRun, allowRetire };
}

async function main() {
  const { dryRun, allowRetire } = parseArguments(process.argv.slice(2));
  if (!dryRun) await seedCatalog();
  const filenames = contentFilesForLocale(DEFAULT_CONTENT_LOCALE);
  const normalized = [];
  for (const filename of filenames) {
    const body = (await readFile(path.join(dataDirectory, filename), "utf8")).replace(/^\uFEFF/, "");
    const questions = JSON.parse(body) as SourceQuestion[];
    normalized.push(...questions.map((question) => normalizeSourceQuestion(question, filename)));
  }

  const summary = await importCatalog(prisma, normalized, {
    dryRun,
    allowRetire,
    supersededSourceIds: CONTENT_MANIFEST.supersededSourceIds,
    onProgress: (imported, total) => console.info(JSON.stringify({
      level: "info",
      event: "catalog_seed_progress",
      imported,
      total,
    })),
  });

  const [published, review, retired, autoGradable] = await Promise.all([
    prisma.question.count({ where: { status: "PUBLISHED" } }),
    prisma.question.count({ where: { status: "NEEDS_REVIEW" } }),
    prisma.question.count({ where: { status: RETIRED_STATUS } }),
    prisma.question.count({ where: { isAutoGradable: true, status: "PUBLISHED" } }),
  ]);
  return { ...summary, questions: normalized.length, published, needsReview: review, retiredTotal: retired, autoGradable };
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
