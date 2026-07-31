import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

const [sqliteMigration, postgresqlMigration] = await Promise.all([
  readFile(new URL(
    "../prisma/migrations/20260731110000_stale_registration_cleanup/migration.sql",
    import.meta.url,
  ), "utf8"),
  readFile(new URL(
    "../prisma/postgresql/migrations/20260731110000_stale_registration_cleanup/migration.sql",
    import.meta.url,
  ), "utf8"),
]);

test("adds an indexed expiry marker with a legacy registration grace period", () => {
  assert.match(postgresqlMigration, /INTERVAL '30 days'/);
  assert.match(postgresqlMigration, /TIMESTAMP\(3\)/);
  assert.match(postgresqlMigration, /User_emailVerified_role_registrationExpiresAt_idx/);

  const database = new DatabaseSync(":memory:");
  try {
    database.exec(`
      CREATE TABLE "User" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "emailVerified" DATETIME,
        "passwordHash" TEXT,
        "role" TEXT NOT NULL DEFAULT 'LEARNER'
      );
      CREATE TABLE "Account" (
        "userId" TEXT NOT NULL,
        "provider" TEXT NOT NULL,
        "providerAccountId" TEXT NOT NULL,
        PRIMARY KEY ("provider", "providerAccountId")
      );
      INSERT INTO "User" VALUES ('password-registration', NULL, 'hash', 'LEARNER');
      INSERT INTO "User" VALUES ('social-account', NULL, 'hash', 'LEARNER');
      INSERT INTO "User" VALUES ('verified-account', '2026-07-31 08:00:00', 'hash', 'LEARNER');
      INSERT INTO "User" VALUES ('passwordless-account', NULL, NULL, 'LEARNER');
      INSERT INTO "User" VALUES ('operator-account', NULL, 'hash', 'CONTENT_EDITOR');
      INSERT INTO "Account" VALUES ('social-account', 'example', 'social-1');
    `);

    database.exec(sqliteMigration);
    const rows = database.prepare(`
      SELECT "id", "registrationExpiresAt" FROM "User" ORDER BY "id"
    `).all().map((row) => ({ ...row }));
    assert.ok(rows.find(({ id }) => id === "password-registration").registrationExpiresAt);
    for (const id of [
      "social-account",
      "verified-account",
      "passwordless-account",
      "operator-account",
    ]) {
      assert.equal(rows.find((row) => row.id === id).registrationExpiresAt, null);
    }

    const indexColumns = database.prepare(`
      SELECT "name" FROM pragma_index_info('User_emailVerified_role_registrationExpiresAt_idx')
      ORDER BY "seqno"
    `).all().map(({ name }) => name);
    assert.deepEqual(indexColumns, ["emailVerified", "role", "registrationExpiresAt"]);
  } finally {
    database.close();
  }
});
