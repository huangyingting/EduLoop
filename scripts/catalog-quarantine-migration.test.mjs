import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

const [sqliteMigration, postgresqlMigration] = await Promise.all([
  readFile(new URL(
    "../prisma/migrations/20260801010000_catalog_quarantine_lifecycle/migration.sql",
    import.meta.url,
  ), "utf8"),
  readFile(new URL(
    "../prisma/postgresql/migrations/20260801010000_catalog_quarantine_lifecycle/migration.sql",
    import.meta.url,
  ), "utf8"),
]);

test("separates imported status and backfills only active operator quarantines", () => {
  assert.match(postgresqlMigration, /TIMESTAMP\(3\)/);
  assert.match(postgresqlMigration, /MAX\("ContentReviewAction"\."createdAt"\)/);

  const database = new DatabaseSync(":memory:");
  try {
    database.exec(`
      CREATE TABLE "Question" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "status" TEXT NOT NULL DEFAULT 'PUBLISHED'
      );
      CREATE TABLE "QuestionReport" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "questionId" TEXT NOT NULL,
        "status" TEXT NOT NULL DEFAULT 'OPEN'
      );
      CREATE TABLE "ContentReviewAction" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "reportId" TEXT NOT NULL,
        "action" TEXT NOT NULL,
        "createdAt" DATETIME NOT NULL
      );

      INSERT INTO "Question" VALUES ('active-quarantine', 'NEEDS_REVIEW');
      INSERT INTO "Question" VALUES ('resolved-quarantine', 'NEEDS_REVIEW');
      INSERT INTO "Question" VALUES ('split-quarantine', 'NEEDS_REVIEW');
      INSERT INTO "Question" VALUES ('source-review', 'NEEDS_REVIEW');
      INSERT INTO "Question" VALUES ('published', 'PUBLISHED');

      INSERT INTO "QuestionReport" VALUES ('active-report', 'active-quarantine', 'OPEN');
      INSERT INTO "QuestionReport" VALUES ('resolved-report', 'resolved-quarantine', 'RESOLVED');
      INSERT INTO "QuestionReport" VALUES ('split-resolved-report', 'split-quarantine', 'RESOLVED');
      INSERT INTO "QuestionReport" VALUES ('split-open-report', 'split-quarantine', 'OPEN');
      INSERT INTO "ContentReviewAction" VALUES (
        'active-action', 'active-report', 'QUARANTINE', '2026-08-01 01:00:00'
      );
      INSERT INTO "ContentReviewAction" VALUES (
        'resolved-action', 'resolved-report', 'QUARANTINE', '2026-08-01 00:00:00'
      );
      INSERT INTO "ContentReviewAction" VALUES (
        'split-action', 'split-resolved-report', 'QUARANTINE', '2026-08-01 00:30:00'
      );
    `);

    database.exec(sqliteMigration);
    assert.deepEqual(
      database.prepare(`
        SELECT "id", "importStatus", "quarantinedAt"
        FROM "Question"
        ORDER BY "id"
      `).all().map((row) => ({ ...row })),
      [
        {
          id: "active-quarantine",
          importStatus: "NEEDS_REVIEW",
          quarantinedAt: "2026-08-01 01:00:00",
        },
        { id: "published", importStatus: "PUBLISHED", quarantinedAt: null },
        { id: "resolved-quarantine", importStatus: "NEEDS_REVIEW", quarantinedAt: null },
        { id: "source-review", importStatus: "NEEDS_REVIEW", quarantinedAt: null },
        {
          id: "split-quarantine",
          importStatus: "NEEDS_REVIEW",
          quarantinedAt: "2026-08-01 00:30:00",
        },
      ],
    );
  } finally {
    database.close();
  }
});
