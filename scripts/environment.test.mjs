import assert from "node:assert/strict";
import test from "node:test";
import { validateEnvironment } from "./environment.mjs";

test("accepts local SQLite configuration", () => {
  assert.deepEqual(validateEnvironment({
    DATABASE_URL: "file:./dev.db",
    EDULOOP_DATABASE_PROVIDER: "sqlite",
    PORT: "3000",
  }), { errors: [], warnings: [], provider: "sqlite" });
});

test("accepts injected PostgreSQL production configuration", () => {
  assert.deepEqual(validateEnvironment({
    NODE_ENV: "production",
    DATABASE_URL: "postgresql://user:password@database:5432/eduloop",
    EDULOOP_DATABASE_PROVIDER: "postgresql",
    APP_VERSION: "2026.07.28",
    PORT: "8080",
  }), { errors: [], warnings: [], provider: "postgresql" });
});

test("rejects provider drift and unsafe production SQLite", () => {
  const result = validateEnvironment({
    NODE_ENV: "production",
    DATABASE_URL: "file:./production.db",
    EDULOOP_DATABASE_PROVIDER: "postgresql",
    PORT: "70000",
  });
  assert.deepEqual(result.errors, [
    "EDULOOP_DATABASE_PROVIDER=postgresql does not match the DATABASE_URL provider sqlite.",
    "PORT must be an integer from 1 through 65535.",
  ]);
  assert.equal(result.warnings.length, 1);
});

test("requires explicit production provider intent", () => {
  const result = validateEnvironment({
    NODE_ENV: "production",
    DATABASE_URL: "postgresql://user:password@database:5432/eduloop",
    APP_VERSION: "release",
  });
  assert.deepEqual(result.errors, ["EDULOOP_DATABASE_PROVIDER is required in production."]);
});
