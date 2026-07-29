import { mkdtemp, rm } from "node:fs/promises";
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
    autoGradable: await prisma.question.count({ where: { status: "PUBLISHED", isAutoGradable: true } }),
    assets: await prisma.questionAsset.count(),
    approvedAssets: await prisma.questionAsset.count({ where: { reviewStatus: "APPROVED" } }),
    difficultyAudited: await prisma.question.count({ where: { difficultyAuditVersion: 1, difficultyReason: { not: "Pending difficulty audit" } } }),
    difficultyAdjusted: difficultyTransitions.filter((item) => item.sourceDifficulty !== item.difficulty).reduce((total, item) => total + item._count._all, 0),
    difficultyEasy: await prisma.question.count({ where: { difficulty: "EASY" } }),
    difficultyMedium: await prisma.question.count({ where: { difficulty: "MEDIUM" } }),
    difficultyHard: await prisma.question.count({ where: { difficulty: "HARD" } }),
  };
  await prisma.$disconnect();
  const expected = {
    total: 13_811, published: 13_811, review: 0, autoGradable: 9_743, assets: 12, approvedAssets: 12,
    difficultyAudited: 13_811, difficultyAdjusted: 4_088, difficultyEasy: 8_412, difficultyMedium: 4_031, difficultyHard: 1_368,
  };
  if (JSON.stringify(result) !== JSON.stringify(expected)) {
    throw new Error(`Seed verification mismatch: expected ${JSON.stringify(expected)}, received ${JSON.stringify(result)}`);
  }
  console.log(`Seed verification passed: ${JSON.stringify(result)}`);
} finally {
  await rm(directory, { recursive: true, force: true });
}
