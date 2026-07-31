import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

const [sqliteMigration, postgresqlMigration] = await Promise.all([
  readFile(new URL(
    "../prisma/migrations/20260731100000_harden_mailbox_ownership/migration.sql",
    import.meta.url,
  ), "utf8"),
  readFile(new URL(
    "../prisma/postgresql/migrations/20260731100000_harden_mailbox_ownership/migration.sql",
    import.meta.url,
  ), "utf8"),
]);

test("revokes legacy verification links that have no password proof", () => {
  assert.equal(postgresqlMigration, sqliteMigration);
  const database = new DatabaseSync(":memory:");
  try {
    database.exec(`
      CREATE TABLE "User" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "passwordHash" TEXT
      );
      CREATE TABLE "EmailVerificationToken" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "userId" TEXT NOT NULL
      );
      INSERT INTO "User" VALUES ('social-only', NULL);
      INSERT INTO "User" VALUES ('password-registration', 'bcrypt-hash');
      INSERT INTO "EmailVerificationToken" VALUES ('unsafe-token', 'social-only');
      INSERT INTO "EmailVerificationToken" VALUES ('password-bound-token', 'password-registration');
    `);

    database.exec(sqliteMigration);
    assert.deepEqual(
      database.prepare(`SELECT "id", "userId" FROM "EmailVerificationToken" ORDER BY "id"`).all()
        .map((row) => ({ ...row })),
      [{ id: "password-bound-token", userId: "password-registration" }],
    );
    assert.equal(database.prepare(`SELECT COUNT(*) AS "count" FROM "User"`).get().count, 2);
  } finally {
    database.close();
  }
});
