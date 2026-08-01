import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

const [sqliteMigration, postgresqlMigration] = await Promise.all([
  readFile(new URL(
    "../prisma/migrations/20260801030000_delivery_aware_email_proofs/migration.sql",
    import.meta.url,
  ), "utf8"),
  readFile(new URL(
    "../prisma/postgresql/migrations/20260801030000_delivery_aware_email_proofs/migration.sql",
    import.meta.url,
  ), "utf8"),
]);

test("backfills delivered proofs and permits in-flight email-change replacements", () => {
  assert.match(postgresqlMigration, /SET "deliveredAt" = "createdAt"/);
  assert.match(postgresqlMigration, /DROP INDEX "EmailChangeToken_userId_key"/);

  const database = new DatabaseSync(":memory:");
  try {
    database.exec(`
      PRAGMA foreign_keys=ON;
      CREATE TABLE "User" (
        "id" TEXT NOT NULL PRIMARY KEY
      );
      CREATE TABLE "EmailVerificationToken" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "userId" TEXT NOT NULL,
        "tokenHash" TEXT NOT NULL,
        "expiresAt" DATETIME NOT NULL,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "EmailVerificationToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
      );
      CREATE TABLE "PasswordResetToken" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "userId" TEXT NOT NULL,
        "tokenHash" TEXT NOT NULL,
        "expiresAt" DATETIME NOT NULL,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
      );
      CREATE TABLE "EmailChangeToken" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "userId" TEXT NOT NULL,
        "newEmail" TEXT NOT NULL,
        "tokenHash" TEXT NOT NULL,
        "expiresAt" DATETIME NOT NULL,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "EmailChangeToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
      );
      CREATE UNIQUE INDEX "EmailVerificationToken_tokenHash_key" ON "EmailVerificationToken"("tokenHash");
      CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");
      CREATE UNIQUE INDEX "EmailChangeToken_userId_key" ON "EmailChangeToken"("userId");
      CREATE UNIQUE INDEX "EmailChangeToken_tokenHash_key" ON "EmailChangeToken"("tokenHash");
      CREATE INDEX "EmailChangeToken_expiresAt_idx" ON "EmailChangeToken"("expiresAt");

      INSERT INTO "User" VALUES ('user');
      INSERT INTO "EmailVerificationToken" VALUES (
        'verification', 'user', 'verification-hash', '2026-08-02 00:00:00', '2026-08-01 00:00:00'
      );
      INSERT INTO "PasswordResetToken" VALUES (
        'reset', 'user', 'reset-hash', '2026-08-02 00:00:00', '2026-08-01 00:01:00'
      );
      INSERT INTO "EmailChangeToken" VALUES (
        'change', 'user', 'first@example.com', 'change-hash', '2026-08-02 00:00:00', '2026-08-01 00:02:00'
      );
    `);

    database.exec(sqliteMigration);
    assert.deepEqual(
      database.prepare(`
        SELECT "id", "deliveredAt"
        FROM (
          SELECT "id", "deliveredAt" FROM "EmailVerificationToken"
          UNION ALL
          SELECT "id", "deliveredAt" FROM "PasswordResetToken"
          UNION ALL
          SELECT "id", "deliveredAt" FROM "EmailChangeToken"
        )
        ORDER BY "id"
      `).all().map((row) => ({ ...row })),
      [
        { id: "change", deliveredAt: "2026-08-01 00:02:00" },
        { id: "reset", deliveredAt: "2026-08-01 00:01:00" },
        { id: "verification", deliveredAt: "2026-08-01 00:00:00" },
      ],
    );

    database.exec(`
      INSERT INTO "EmailChangeToken" (
        "id", "userId", "newEmail", "tokenHash", "expiresAt", "deliveredAt"
      ) VALUES (
        'replacement', 'user', 'second@example.com', 'replacement-hash', '2026-08-02 00:00:00', NULL
      )
    `);
    assert.equal(database.prepare(`SELECT COUNT(*) AS "count" FROM "EmailChangeToken"`).get().count, 2);
    assert.throws(() => database.exec(`
      INSERT INTO "EmailChangeToken" (
        "id", "userId", "newEmail", "tokenHash", "expiresAt"
      ) VALUES (
        'duplicate', 'user', 'third@example.com', 'replacement-hash', '2026-08-02 00:00:00'
      )
    `), /UNIQUE constraint failed/);

    database.exec(`DELETE FROM "User" WHERE "id" = 'user'`);
    assert.equal(database.prepare(`SELECT COUNT(*) AS "count" FROM "EmailChangeToken"`).get().count, 0);
  } finally {
    database.close();
  }
});
