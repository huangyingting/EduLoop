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
  const production = {
    NODE_ENV: "production",
    DATABASE_URL: "postgresql://user:password@database:5432/eduloop?sslmode=require&connection_limit=8&pool_timeout=10&connect_timeout=5",
    EDULOOP_DATABASE_PROVIDER: "postgresql",
    APP_VERSION: "2026.07.28",
    AUTH_SECRET: "a-production-secret-with-at-least-32-characters",
    AUTH_URL: "https://learn.example",
    RESEND_API_KEY: "re_test_key",
    AUTH_EMAIL_FROM: "EduLoop <accounts@learn.example>",
    LEGAL_ENTITY_NAME: "EduLoop Learning Ltd.",
    LEGAL_CONTACT_EMAIL: "privacy@learn.example",
    LEGAL_JURISDICTION: "Example jurisdiction",
    PORT: "8080",
    TRUSTED_PROXY_HOPS: "2",
  };
  assert.deepEqual(validateEnvironment(production), {
    errors: [],
    warnings: [],
    provider: "postgresql",
  });
  assert.deepEqual(validateEnvironment({
    ...production,
    APP_VERSION: "development",
  }).errors, [
    "APP_VERSION must be a non-placeholder release identifier of 1 through 128 letters, numbers, dots, underscores, or hyphens.",
  ]);
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
    "APP_VERSION is required in production.",
    "AUTH_SECRET must be at least 32 characters in production.",
    "AUTH_URL is required in production.",
    "Production account email requires RESEND_API_KEY and AUTH_EMAIL_FROM.",
    "Production legal pages require LEGAL_ENTITY_NAME, LEGAL_CONTACT_EMAIL, and LEGAL_JURISDICTION.",
    "PORT must be an integer from 1 through 65535.",
  ]);
  assert.equal(result.warnings.length, 0);
});

test("requires a bounded log-safe release identity", () => {
  assert.deepEqual(validateEnvironment({
    DATABASE_URL: "file:./dev.db",
    APP_VERSION: "release/private value",
  }).errors, [
    "APP_VERSION must be a non-placeholder release identifier of 1 through 128 letters, numbers, dots, underscores, or hyphens.",
  ]);
  assert.deepEqual(validateEnvironment({
    DATABASE_URL: "file:./dev.db",
    APP_VERSION: `r${"x".repeat(128)}`,
  }).errors, [
    "APP_VERSION must be a non-placeholder release identifier of 1 through 128 letters, numbers, dots, underscores, or hyphens.",
  ]);
});

test("requires explicit production provider intent", () => {
  const result = validateEnvironment({
    NODE_ENV: "production",
    DATABASE_URL: "postgresql://user:password@database:5432/eduloop?sslmode=require&connection_limit=8&pool_timeout=10&connect_timeout=5",
    APP_VERSION: "release",
    AUTH_SECRET: "a-production-secret-with-at-least-32-characters",
    AUTH_URL: "https://learn.example",
    RESEND_API_KEY: "re_test_key",
    AUTH_EMAIL_FROM: "accounts@learn.example",
    LEGAL_ENTITY_NAME: "EduLoop Learning Ltd.",
    LEGAL_CONTACT_EMAIL: "privacy@learn.example",
    LEGAL_JURISDICTION: "Example jurisdiction",
  });
  assert.deepEqual(result.errors, ["EDULOOP_DATABASE_PROVIDER is required in production."]);
});

test("rejects partial social provider configuration", () => {
  const result = validateEnvironment({
    DATABASE_URL: "file:./dev.db",
    AUTH_GOOGLE_ID: "client-id",
    RESEND_API_KEY: "re_test_key",
    LEGAL_CONTACT_EMAIL: "not-an-email",
    FACEBOOK_GRAPH_API_VERSION: "23",
  });
  assert.deepEqual(result.errors, [
    "Account email requires both RESEND_API_KEY and AUTH_EMAIL_FROM.",
    "LEGAL_CONTACT_EMAIL must be a valid email address.",
    "Google social login requires both AUTH_GOOGLE_ID and AUTH_GOOGLE_SECRET.",
    "FACEBOOK_GRAPH_API_VERSION must look like v23.0.",
  ]);
});

test("rejects an invalid trusted proxy depth", () => {
  const result = validateEnvironment({
    DATABASE_URL: "file:./dev.db",
    TRUSTED_PROXY_HOPS: "0",
  });
  assert.deepEqual(result.errors, [
    "TRUSTED_PROXY_HOPS must be an integer from 1 through 10.",
  ]);
});

test("permits a loopback production database without transport TLS", () => {
  const result = validateEnvironment({
    NODE_ENV: "production",
    DATABASE_URL: "postgresql://user:password@127.0.0.1:5432/eduloop?connection_limit=8&pool_timeout=10&connect_timeout=5",
    EDULOOP_DATABASE_PROVIDER: "postgresql",
    APP_VERSION: "release",
    AUTH_SECRET: "a-production-secret-with-at-least-32-characters",
    AUTH_URL: "https://learn.example",
    RESEND_API_KEY: "re_test_key",
    AUTH_EMAIL_FROM: "accounts@learn.example",
    LEGAL_ENTITY_NAME: "EduLoop Learning Ltd.",
    LEGAL_CONTACT_EMAIL: "privacy@learn.example",
    LEGAL_JURISDICTION: "Example jurisdiction",
  });
  assert.deepEqual(result, { errors: [], warnings: [], provider: "postgresql" });
});

test("rejects an unencrypted or certificate-unverified remote production database", () => {
  const production = {
    NODE_ENV: "production",
    EDULOOP_DATABASE_PROVIDER: "postgresql",
    APP_VERSION: "release",
    AUTH_SECRET: "a-production-secret-with-at-least-32-characters",
    AUTH_URL: "https://learn.example",
    RESEND_API_KEY: "re_test_key",
    AUTH_EMAIL_FROM: "accounts@learn.example",
    LEGAL_ENTITY_NAME: "EduLoop Learning Ltd.",
    LEGAL_CONTACT_EMAIL: "privacy@learn.example",
    LEGAL_JURISDICTION: "Example jurisdiction",
  };

  assert.deepEqual(validateEnvironment({
    ...production,
    DATABASE_URL: "postgresql://user:password@database:5432/eduloop?connection_limit=8&pool_timeout=10&connect_timeout=5",
  }).errors, [
    "Remote production PostgreSQL requires sslmode=require, verify-ca, or verify-full.",
  ]);
  assert.deepEqual(validateEnvironment({
    ...production,
    DATABASE_URL: "postgresql://user:password@database:5432/eduloop?sslmode=require&sslaccept=accept_invalid_certs&connection_limit=8&pool_timeout=10&connect_timeout=5",
  }).errors, [
    "Remote production PostgreSQL must not disable TLS certificate validation.",
  ]);
  assert.deepEqual(validateEnvironment({
    ...production,
    DATABASE_URL: "postgresql://user:password@database:5432/eduloop?sslmode=require&sslmode=disable&connection_limit=8&pool_timeout=10&connect_timeout=5",
  }).errors, [
    "Remote production PostgreSQL requires sslmode=require, verify-ca, or verify-full.",
  ]);
});

test("requires bounded production PostgreSQL pool and connection timeouts", () => {
  const production = {
    NODE_ENV: "production",
    EDULOOP_DATABASE_PROVIDER: "postgresql",
    APP_VERSION: "release",
    AUTH_SECRET: "a-production-secret-with-at-least-32-characters",
    AUTH_URL: "https://learn.example",
    RESEND_API_KEY: "re_test_key",
    AUTH_EMAIL_FROM: "accounts@learn.example",
    LEGAL_ENTITY_NAME: "EduLoop Learning Ltd.",
    LEGAL_CONTACT_EMAIL: "privacy@learn.example",
    LEGAL_JURISDICTION: "Example jurisdiction",
  };

  assert.deepEqual(validateEnvironment({
    ...production,
    DATABASE_URL: "postgresql://user:password@database:5432/eduloop?sslmode=require",
  }).errors, [
    "Production PostgreSQL DATABASE_URL requires exactly one connection_limit parameter.",
    "Production PostgreSQL DATABASE_URL requires exactly one pool_timeout parameter.",
    "Production PostgreSQL DATABASE_URL requires exactly one connect_timeout parameter.",
  ]);
  assert.deepEqual(validateEnvironment({
    ...production,
    DATABASE_URL: "postgresql://user:password@database:5432/eduloop?sslmode=require&connection_limit=0&pool_timeout=0&connect_timeout=31",
  }).errors, [
    "Production PostgreSQL connection_limit must be an integer from 1 through 100.",
    "Production PostgreSQL pool_timeout must be an integer from 1 through 30.",
    "Production PostgreSQL connect_timeout must be an integer from 1 through 30.",
  ]);
  assert.deepEqual(validateEnvironment({
    ...production,
    DATABASE_URL: "postgresql://user:password@database:5432/eduloop?sslmode=require&connection_limit=5&connection_limit=6&pool_timeout=10&connect_timeout=5",
  }).errors, [
    "Production PostgreSQL DATABASE_URL requires exactly one connection_limit parameter.",
  ]);
});

test("rejects a malformed PostgreSQL database URL before startup", () => {
  assert.deepEqual(validateEnvironment({
    DATABASE_URL: "postgresql:not-a-network-database",
    EDULOOP_DATABASE_PROVIDER: "postgresql",
  }).errors, [
    "DATABASE_URL must be a valid PostgreSQL URL with a host and database name.",
  ]);
});
