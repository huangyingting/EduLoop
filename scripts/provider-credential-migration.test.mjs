import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

const [sqliteMigration, postgresqlMigration] = await Promise.all([
  readFile(new URL(
    "../prisma/migrations/20260731080000_minimize_provider_credentials/migration.sql",
    import.meta.url,
  ), "utf8"),
  readFile(new URL(
    "../prisma/postgresql/migrations/20260731080000_minimize_provider_credentials/migration.sql",
    import.meta.url,
  ), "utf8"),
]);

test("removes legacy provider credentials without breaking the login identity", () => {
  assert.equal(postgresqlMigration, sqliteMigration);
  const database = new DatabaseSync(":memory:");
  try {
    database.exec(`
      CREATE TABLE "Account" (
        "userId" TEXT NOT NULL,
        "type" TEXT NOT NULL,
        "provider" TEXT NOT NULL,
        "providerAccountId" TEXT NOT NULL,
        "refresh_token" TEXT,
        "access_token" TEXT,
        "expires_at" INTEGER,
        "token_type" TEXT,
        "scope" TEXT,
        "id_token" TEXT,
        "session_state" TEXT,
        PRIMARY KEY ("provider", "providerAccountId")
      );
      INSERT INTO "Account" VALUES (
        'user-1', 'oidc', 'example', 'provider-user-1',
        'refresh-secret', 'access-secret', 1800000000, 'bearer',
        'openid email profile', 'identity-secret', 'session-secret'
      );
    `);

    database.exec(sqliteMigration);
    const account = database.prepare(`
      SELECT * FROM "Account"
      WHERE "provider" = 'example' AND "providerAccountId" = 'provider-user-1'
    `).get();

    assert.equal(account.userId, "user-1");
    assert.equal(account.type, "oidc");
    assert.equal(account.provider, "example");
    assert.equal(account.providerAccountId, "provider-user-1");
    for (const field of [
      "refresh_token",
      "access_token",
      "expires_at",
      "token_type",
      "scope",
      "id_token",
      "session_state",
    ]) {
      assert.equal(account[field], null, `${field} was not removed`);
    }
  } finally {
    database.close();
  }
});
