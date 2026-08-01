import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

const [sqliteMigration, postgresqlMigration] = await Promise.all([
  readFile(new URL(
    "../prisma/migrations/20260801020000_anonymize_retained_reports/migration.sql",
    import.meta.url,
  ), "utf8"),
  readFile(new URL(
    "../prisma/postgresql/migrations/20260801020000_anonymize_retained_reports/migration.sql",
    import.meta.url,
  ), "utf8"),
]);

test("retains moderation evidence while anonymizing an erased reporter", () => {
  assert.match(postgresqlMigration, /ON DELETE SET NULL/);
  assert.match(postgresqlMigration, /BEFORE UPDATE OF "learnerId" ON "QuestionReport"/);
  assert.match(postgresqlMigration, /NEW\."detail" := NULL/);

  const database = new DatabaseSync(":memory:");
  try {
    database.exec(`
      PRAGMA foreign_keys=ON;
      CREATE TABLE "LearnerProfile" (
        "id" TEXT NOT NULL PRIMARY KEY
      );
      CREATE TABLE "Question" (
        "id" TEXT NOT NULL PRIMARY KEY
      );
      CREATE TABLE "QuestionReport" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "learnerId" TEXT NOT NULL,
        "questionId" TEXT NOT NULL,
        "category" TEXT NOT NULL,
        "detail" TEXT,
        "status" TEXT NOT NULL DEFAULT 'OPEN',
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL,
        "resolvedAt" DATETIME,
        CONSTRAINT "QuestionReport_learnerId_fkey" FOREIGN KEY ("learnerId") REFERENCES "LearnerProfile" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT "QuestionReport_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question" ("id") ON DELETE CASCADE ON UPDATE CASCADE
      );
      CREATE INDEX "QuestionReport_questionId_status_createdAt_idx" ON "QuestionReport"("questionId", "status", "createdAt");
      CREATE INDEX "QuestionReport_learnerId_createdAt_idx" ON "QuestionReport"("learnerId", "createdAt");
      CREATE TABLE "ContentReviewAction" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "reportId" TEXT NOT NULL,
        "action" TEXT NOT NULL,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "ContentReviewAction_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "QuestionReport" ("id") ON DELETE CASCADE ON UPDATE CASCADE
      );

      INSERT INTO "LearnerProfile" VALUES ('reporter');
      INSERT INTO "Question" VALUES ('question');
      INSERT INTO "QuestionReport" (
        "id", "learnerId", "questionId", "category", "detail", "updatedAt"
      ) VALUES (
        'report', 'reporter', 'question', 'UNCLEAR', 'possibly identifying free text', '2026-08-01 00:00:00'
      );
      INSERT INTO "ContentReviewAction" ("id", "reportId", "action")
      VALUES ('action', 'report', 'QUARANTINE');
    `);

    database.exec(sqliteMigration);
    assert.deepEqual(
      { ...database.prepare(`
        SELECT "learnerId", "detail", "reporterErasedAt"
        FROM "QuestionReport"
        WHERE "id" = 'report'
      `).get() },
      {
        learnerId: "reporter",
        detail: "possibly identifying free text",
        reporterErasedAt: null,
      },
    );

    database.exec(`DELETE FROM "LearnerProfile" WHERE "id" = 'reporter'`);
    const anonymized = database.prepare(`
      SELECT "learnerId", "detail", "reporterErasedAt"
      FROM "QuestionReport"
      WHERE "id" = 'report'
    `).get();
    assert.equal(anonymized.learnerId, null);
    assert.equal(anonymized.detail, null);
    assert.equal(typeof anonymized.reporterErasedAt, "string");
    assert.equal(
      database.prepare(`SELECT COUNT(*) AS "count" FROM "ContentReviewAction"`).get().count,
      1,
    );

    database.exec(`DELETE FROM "Question" WHERE "id" = 'question'`);
    assert.equal(database.prepare(`SELECT COUNT(*) AS "count" FROM "QuestionReport"`).get().count, 0);
    assert.equal(database.prepare(`SELECT COUNT(*) AS "count" FROM "ContentReviewAction"`).get().count, 0);
  } finally {
    database.close();
  }
});
