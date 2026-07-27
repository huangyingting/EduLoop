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
  const result = {
    total: await prisma.question.count(),
    published: await prisma.question.count({ where: { status: "PUBLISHED" } }),
    review: await prisma.question.count({ where: { status: "NEEDS_REVIEW" } }),
    autoGradable: await prisma.question.count({ where: { status: "PUBLISHED", isAutoGradable: true } }),
    assets: await prisma.questionAsset.count(),
    approvedAssets: await prisma.questionAsset.count({ where: { reviewStatus: "APPROVED" } }),
  };
  await prisma.$disconnect();
  const expected = { total: 10_349, published: 10_349, review: 0, autoGradable: 6_281, assets: 12, approvedAssets: 12 };
  if (JSON.stringify(result) !== JSON.stringify(expected)) {
    throw new Error(`Seed verification mismatch: expected ${JSON.stringify(expected)}, received ${JSON.stringify(result)}`);
  }
  console.log(`Seed verification passed: ${JSON.stringify(result)}`);
} finally {
  await rm(directory, { recursive: true, force: true });
}
