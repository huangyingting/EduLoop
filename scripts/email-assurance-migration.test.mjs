import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

const [sqliteMigration, postgresqlMigration] = await Promise.all([
  readFile(new URL(
    "../prisma/migrations/20260731090000_enforce_email_assurance/migration.sql",
    import.meta.url,
  ), "utf8"),
  readFile(new URL(
    "../prisma/postgresql/migrations/20260731090000_enforce_email_assurance/migration.sql",
    import.meta.url,
  ), "utf8"),
]);

test("requires legacy verified addresses to prove ownership again", () => {
  assert.equal(postgresqlMigration, sqliteMigration);
  const database = new DatabaseSync(":memory:");
  try {
    database.exec(`
      CREATE TABLE "User" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "emailVerified" DATETIME,
        "sessionVersion" INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE "Session" (
        "sessionToken" TEXT NOT NULL PRIMARY KEY,
        "userId" TEXT NOT NULL
      );
      INSERT INTO "User" VALUES ('verified-user', '2026-07-31 08:00:00', 4);
      INSERT INTO "User" VALUES ('pending-user', NULL, 7);
      INSERT INTO "Session" VALUES ('verified-session', 'verified-user');
      INSERT INTO "Session" VALUES ('pending-session', 'pending-user');
    `);

    database.exec(sqliteMigration);
    assert.deepEqual(
      { ...database.prepare(`SELECT * FROM "User" WHERE "id" = 'verified-user'`).get() },
      { id: "verified-user", emailVerified: null, sessionVersion: 5 },
    );
    assert.deepEqual(
      { ...database.prepare(`SELECT * FROM "User" WHERE "id" = 'pending-user'`).get() },
      { id: "pending-user", emailVerified: null, sessionVersion: 7 },
    );
    assert.deepEqual(
      database.prepare(`SELECT "sessionToken" FROM "Session" ORDER BY "sessionToken"`).all().map((row) => ({ ...row })),
      [{ sessionToken: "pending-session" }],
    );
  } finally {
    database.close();
  }
});
