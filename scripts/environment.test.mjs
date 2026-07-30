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
    AUTH_SECRET: "a-production-secret-with-at-least-32-characters",
    AUTH_URL: "https://learn.example",
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
    "AUTH_SECRET must be at least 32 characters in production.",
    "AUTH_URL is required in production.",
    "PORT must be an integer from 1 through 65535.",
  ]);
  assert.equal(result.warnings.length, 1);
});

test("requires explicit production provider intent", () => {
  const result = validateEnvironment({
    NODE_ENV: "production",
    DATABASE_URL: "postgresql://user:password@database:5432/eduloop",
    APP_VERSION: "release",
    AUTH_SECRET: "a-production-secret-with-at-least-32-characters",
    AUTH_URL: "https://learn.example",
  });
  assert.deepEqual(result.errors, ["EDULOOP_DATABASE_PROVIDER is required in production."]);
});

test("rejects partial social provider configuration", () => {
  const result = validateEnvironment({
    DATABASE_URL: "file:./dev.db",
    AUTH_GOOGLE_ID: "client-id",
    FACEBOOK_GRAPH_API_VERSION: "23",
  });
  assert.deepEqual(result.errors, [
    "Google social login requires both AUTH_GOOGLE_ID and AUTH_GOOGLE_SECRET.",
    "FACEBOOK_GRAPH_API_VERSION must look like v23.0.",
  ]);
});
