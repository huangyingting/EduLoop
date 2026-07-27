import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const directory = await mkdtemp(path.join(tmpdir(), "eduloop-integration-"));
const databaseUrl = `file:${path.join(directory, "integration.db")}`;
const environment = { ...process.env, DATABASE_URL: databaseUrl };

function run(command, args) {
  const result = spawnSync(command, args, { cwd: process.cwd(), env: environment, stdio: "inherit" });
  if (result.status !== 0) process.exitCode = result.status || 1;
  return result.status === 0;
}

try {
  if (run("npx", ["prisma", "migrate", "deploy", "--schema", "prisma/schema.prisma"])) {
    run("npx", ["vitest", "run", "--config", "vitest.integration.config.ts"]);
  }
} finally {
  await rm(directory, { recursive: true, force: true });
}
