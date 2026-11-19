import { describe, expect, it, vi } from "vitest";
import {
  inspectDatabaseReadiness,
  REQUIRED_DATABASE_MIGRATION,
  type DatabaseReadinessQueries,
} from "./database-readiness";

function queries(overrides: Partial<DatabaseReadinessQueries> = {}): DatabaseReadinessQueries {
  return {
    countQuestions: vi.fn(async () => 16_537),
    countSubjects: vi.fn(async () => 9),
    hasRequiredMigration: vi.fn(async () => true),
    ...overrides,
  };
}

describe("database readiness", () => {
  it("requires both the current schema and a populated catalog", async () => {
    await expect(inspectDatabaseReadiness(queries())).resolves.toEqual({
      ready: true,
      status: "ok",
      database: "ready",
      schema: { status: "ready", requiredMigration: REQUIRED_DATABASE_MIGRATION },
      catalog: { subjects: 9, questions: 16_537, release: null },
    });
  });

  it("reports the live catalog release once the schema is current", async () => {
    await expect(inspectDatabaseReadiness(queries({
      latestCatalogRelease: vi.fn(async () => ({
        manifestHash: "09d85e4422b8eb81fc29aa6776d3fae1365552204d6f292ed68bd18bc7b211c1",
        completedAt: new Date("2026-11-19T12:00:00.000Z"),
      })),
    }))).resolves.toMatchObject({
      catalog: { release: { version: "09d85e4422b8", importedAt: "2026-11-19T12:00:00.000Z" } },
    });
  });

  it("rejects an otherwise populated database with an outdated schema", async () => {
    await expect(inspectDatabaseReadiness(queries({
      hasRequiredMigration: vi.fn(async () => false),
    }))).resolves.toMatchObject({
      ready: false,
      status: "outdated",
      schema: { status: "outdated", requiredMigration: REQUIRED_DATABASE_MIGRATION },
      catalog: { subjects: 9, questions: 16_537 },
    });
  });

  it("keeps an empty catalog out of service after migrations finish", async () => {
    await expect(inspectDatabaseReadiness(queries({
      countQuestions: vi.fn(async () => 0),
      countSubjects: vi.fn(async () => 0),
    }))).resolves.toMatchObject({
      ready: false,
      status: "initializing",
      schema: { status: "ready" },
      catalog: { subjects: 0, questions: 0 },
    });
  });

  it("propagates dependency failures to the health route", async () => {
    await expect(inspectDatabaseReadiness(queries({
      hasRequiredMigration: vi.fn(async () => {
        throw new Error("migration table unavailable");
      }),
    }))).rejects.toThrow("migration table unavailable");
  });
});
