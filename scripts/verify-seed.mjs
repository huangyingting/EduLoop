import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const directory = await mkdtemp(path.join(tmpdir(), "eduloop-seed-"));
const databaseUrl = `file:${path.join(directory, "seed.db")}`;
const environment = { ...process.env, DATABASE_URL: databaseUrl };

function run(command, args) {
  const result = spawnSync(command, args, { cwd: process.cwd(), env: environment, stdio: "inherit" });
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed with status ${result.status}`);
}

try {
  run("npx", ["prisma", "generate", "--schema", "prisma/schema.prisma"]);
  run("npx", ["prisma", "migrate", "deploy", "--schema", "prisma/schema.prisma"]);
  run("npx", ["tsx", "prisma/seed.ts"]);
  process.env.DATABASE_URL = databaseUrl;
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();
  const difficultyTransitions = await prisma.question.groupBy({
    by: ["sourceDifficulty", "difficulty"],
    _count: { _all: true },
  });
  const result = {
    total: await prisma.question.count(),
    published: await prisma.question.count({ where: { status: "PUBLISHED" } }),
    review: await prisma.question.count({ where: { status: "NEEDS_REVIEW" } }),
    importPublished: await prisma.question.count({ where: { importStatus: "PUBLISHED" } }),
    quarantined: await prisma.question.count({ where: { quarantinedAt: { not: null } } }),
    retired: await prisma.question.count({ where: { retiredAt: { not: null } } }),
    autoGradable: await prisma.question.count({ where: { status: "PUBLISHED", isAutoGradable: true } }),
    assets: await prisma.questionAsset.count(),
    approvedAssets: await prisma.questionAsset.count({ where: { reviewStatus: "APPROVED" } }),
    hints: await prisma.questionHint.count(),
    questionsWithHints: (await prisma.questionHint.groupBy({ by: ["questionId"] })).length,
    contestPapers: await prisma.contestPaper.count(),
    contestSlots: await prisma.contestPaperSlot.count(),
    difficultyAudited: await prisma.question.count({ where: { difficultyAuditVersion: 1, difficultyReason: { not: "Pending difficulty audit" } } }),
    difficultyAdjusted: difficultyTransitions.filter((item) => item.sourceDifficulty !== item.difficulty).reduce((total, item) => total + item._count._all, 0),
    difficultyEasy: await prisma.question.count({ where: { difficulty: "EASY" } }),
    difficultyMedium: await prisma.question.count({ where: { difficulty: "MEDIUM" } }),
    difficultyHard: await prisma.question.count({ where: { difficulty: "HARD" } }),
    subjects: await prisma.subject.count({ where: { questions: { some: { status: "PUBLISHED" } } } }),
    englishTranslations: await prisma.questionTranslation.count({ where: { locale: "en" } }),
  };
  await prisma.$disconnect();
  // The expected counts are the catalog numbers quoted in the docs.
  const statsPath = path.join(process.cwd(), "docs/catalog-stats.json");
  const stats = JSON.parse(await readFile(statsPath, "utf8"));
  if (process.argv.includes("--update")) {
    stats.seed = result;
    await writeFile(statsPath, `${JSON.stringify(stats, null, 2)}\n`);
    console.log("Updated docs/catalog-stats.json; run `npm run docs:check -- --write` to refresh the docs.");
  } else if (JSON.stringify(result) !== JSON.stringify(stats.seed)) {
    throw new Error(`Seed verification mismatch: expected ${JSON.stringify(stats.seed)}, received ${JSON.stringify(result)}. If the catalog change is intended, run \`npm run seed:verify -- --update\`.`);
  }
  console.log(`Seed verification passed: ${JSON.stringify(result)}`);
} finally {
  await rm(directory, { recursive: true, force: true });
}
