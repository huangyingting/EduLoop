import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

const migrationName = "20261120030000_hot_path_counters_and_random_keys";
const [sqliteMigration, postgresqlMigration] = await Promise.all([
  readFile(new URL(`../prisma/migrations/${migrationName}/migration.sql`, import.meta.url), "utf8"),
  readFile(new URL(`../prisma/postgresql/migrations/${migrationName}/migration.sql`, import.meta.url), "utf8"),
]);

test("backfills attempt counters and the current automatically graded correct run", () => {
  assert.match(postgresqlMigration, /SET "randomKey" = random\(\)/);
  assert.match(postgresqlMigration, /"isSelfAssessed" = false/);

  const database = new DatabaseSync(":memory:");
  try {
    database.exec(`
      CREATE TABLE "LearnerProfile" ("id" TEXT NOT NULL PRIMARY KEY);
      CREATE TABLE "Question" ("id" TEXT NOT NULL PRIMARY KEY, "status" TEXT NOT NULL);
      CREATE TABLE "PracticeAttempt" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "learnerId" TEXT NOT NULL,
        "isCorrect" BOOLEAN,
        "isSelfAssessed" BOOLEAN NOT NULL DEFAULT false,
        "createdAt" DATETIME NOT NULL
      );
      INSERT INTO "LearnerProfile" VALUES ('runner'), ('broken'), ('idle');
      INSERT INTO "Question" VALUES ('q1', 'PUBLISHED'), ('q2', 'PUBLISHED');
      INSERT INTO "PracticeAttempt" VALUES
        ('a1', 'runner', 0, 0, 1000),
        ('a2', 'runner', 1, 0, 2000),
        ('a3', 'runner', NULL, 1, 2500),
        ('a4', 'runner', 0, 1, 2600),
        ('a5', 'runner', 1, 0, 3000),
        ('b1', 'broken', 1, 0, 1000),
        ('b2', 'broken', 0, 0, 2000);
    `);
    database.exec(sqliteMigration);

    const counters = Object.fromEntries(database.prepare(`
      SELECT "id", "totalAttempts", "correctRun" FROM "LearnerProfile" ORDER BY "id"
    `).all().map((row) => [row.id, { totalAttempts: row.totalAttempts, correctRun: row.correctRun }]));
    assert.deepEqual(counters, {
      broken: { totalAttempts: 2, correctRun: 0 },
      idle: { totalAttempts: 0, correctRun: 0 },
      runner: { totalAttempts: 5, correctRun: 2 },
    });

    const keys = database.prepare(`SELECT "randomKey" FROM "Question"`).all().map((row) => row.randomKey);
    assert.ok(keys.every((key) => key >= 0 && key < 1));
  } finally {
    database.close();
  }
});
