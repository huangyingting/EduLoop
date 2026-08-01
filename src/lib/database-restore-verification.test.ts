import { describe, expect, it, vi } from "vitest";
import { REQUIRED_DATABASE_MIGRATION } from "./database-readiness";
import {
  DatabaseRestoreVerificationError,
  inspectDatabaseRestore,
  RESTORE_COUNT_KEYS,
  type DatabaseRestoreVerificationQueries,
  type RestoreDataCounts,
  validateRestoreDatabaseTarget,
} from "./database-restore-verification";

const localRestoreUrl = "postgresql://restore:secret@127.0.0.1:5432/eduloop_restore?schema=public&connection_limit=1&pool_timeout=10&connect_timeout=5";

function dataCounts(overrides: Partial<RestoreDataCounts> = {}): RestoreDataCounts {
  return {
    subjects: 9,
    gradeBands: 4,
    grades: 13,
    questions: 16_537,
    questionOptions: 61_000,
    questionAssets: 12,
    tagDimensions: 5,
    tags: 80,
    questionTags: 42_000,
    badges: 3,
    users: 20,
    providerAccounts: 6,
    consentRecords: 20,
    learners: 20,
    practiceSessions: 45,
    practiceAttempts: 300,
    learnerBadges: 18,
    dailyActivities: 60,
    savedQuestions: 15,
    reviewItems: 8,
    questionReports: 2,
    contentReviewActions: 1,
    ...overrides,
  };
}

function queries(overrides: Partial<DatabaseRestoreVerificationQueries> = {}): DatabaseRestoreVerificationQueries {
  return {
    inspectMigrations: vi.fn(async () => ({
      appliedMigrations: 26,
      requiredMigrationMatches: 1,
      unfinishedMigrations: 0,
    })),
    countData: vi.fn(async () => dataCounts()),
    ...overrides,
  };
}

function expectCode(run: () => unknown, code: string) {
  try {
    run();
    throw new Error("Expected restore validation to fail.");
  } catch (error) {
    expect(error).toBeInstanceOf(DatabaseRestoreVerificationError);
    expect(error).toMatchObject({ code });
  }
}

describe("restore database target validation", () => {
  it("accepts an explicitly confirmed, single-connection local PostgreSQL target", () => {
    expect(validateRestoreDatabaseTarget({
      restoreDatabaseUrl: `  ${localRestoreUrl}  `,
      confirmation: "1",
      applicationDatabaseUrl: "file:./dev.db",
    })).toBe(localRestoreUrl);
  });

  it("requires both a dedicated URL and an explicit isolation confirmation", () => {
    expectCode(() => validateRestoreDatabaseTarget({ confirmation: "1" }), "ERESTORE_URL_REQUIRED");
    expectCode(() => validateRestoreDatabaseTarget({
      restoreDatabaseUrl: localRestoreUrl,
    }), "ERESTORE_CONFIRMATION_REQUIRED");
  });

  it("rejects malformed, non-PostgreSQL, and fragmented targets", () => {
    for (const restoreDatabaseUrl of [
      "file:./restore.db",
      "postgresql:not-a-network-target",
      `${localRestoreUrl}#unexpected`,
    ]) {
      expectCode(() => validateRestoreDatabaseTarget({
        restoreDatabaseUrl,
        confirmation: "1",
      }), "ERESTORE_URL_INVALID");
    }
  });

  it("requires one connection plus bounded acquisition and connection timeouts", () => {
    for (const restoreDatabaseUrl of [
      "postgresql://restore:secret@localhost/restore?connection_limit=2&pool_timeout=10&connect_timeout=5",
      "postgresql://restore:secret@localhost/restore?connection_limit=1&pool_timeout=0&connect_timeout=5",
      "postgresql://restore:secret@localhost/restore?connection_limit=1&pool_timeout=10",
      "postgresql://restore:secret@localhost/restore?connection_limit=1&connection_limit=1&pool_timeout=10&connect_timeout=5",
    ]) {
      expectCode(() => validateRestoreDatabaseTarget({
        restoreDatabaseUrl,
        confirmation: "1",
      }), "ERESTORE_CONNECTION_PARAMETERS");
    }
  });

  it("requires TLS without certificate bypass for remote targets", () => {
    for (const suffix of [
      "",
      "&sslmode=disable",
      "&sslmode=require&sslaccept=accept_invalid_certs",
      "&sslmode=require&sslmode=verify-full",
    ]) {
      expectCode(() => validateRestoreDatabaseTarget({
        restoreDatabaseUrl: `postgresql://restore:secret@database.example/restore?connection_limit=1&pool_timeout=10&connect_timeout=5${suffix}`,
        confirmation: "1",
      }), "ERESTORE_TLS_REQUIRED");
    }
    expect(validateRestoreDatabaseTarget({
      restoreDatabaseUrl: "postgresql://restore:secret@database.example/restore?connection_limit=1&pool_timeout=10&connect_timeout=5&sslmode=verify-full&sslaccept=strict",
      confirmation: "1",
    })).toContain("database.example");
  });

  it("rejects the application database across credentials and default target forms", () => {
    expectCode(() => validateRestoreDatabaseTarget({
      restoreDatabaseUrl: "postgresql://restore:restore-secret@localhost/eduloop?schema=restore&connection_limit=1&pool_timeout=10&connect_timeout=5",
      applicationDatabaseUrl: "postgres://app:app-secret@127.0.0.1:5432/eduloop?schema=public&connection_limit=8&pool_timeout=10&connect_timeout=5",
      confirmation: "1",
    }), "ERESTORE_APPLICATION_TARGET");
  });

  it("does not place credentials in fixed validation messages", () => {
    let error: unknown;
    try {
      validateRestoreDatabaseTarget({
        restoreDatabaseUrl: "postgresql://restore:super-private@database.example/restore?connection_limit=1&pool_timeout=10&connect_timeout=5",
        confirmation: "1",
      });
    } catch (caught) {
      error = caught;
    }
    expect(String(error)).not.toContain("super-private");
    expect(String(error)).not.toContain("database.example");
  });
});

describe("restored database inspection", () => {
  it("returns grouped aggregate evidence for the required schema and durable data", async () => {
    await expect(inspectDatabaseRestore(queries())).resolves.toEqual({
      requiredMigration: REQUIRED_DATABASE_MIGRATION,
      appliedMigrations: 26,
      counts: {
        catalog: {
          subjects: 9,
          gradeBands: 4,
          grades: 13,
          questions: 16_537,
          questionOptions: 61_000,
          questionAssets: 12,
          tagDimensions: 5,
          tags: 80,
          questionTags: 42_000,
          badges: 3,
        },
        identity: { users: 20, providerAccounts: 6, consentRecords: 20 },
        learning: {
          learners: 20,
          practiceSessions: 45,
          practiceAttempts: 300,
          learnerBadges: 18,
          dailyActivities: 60,
          savedQuestions: 15,
          reviewItems: 8,
        },
        governance: { questionReports: 2, contentReviewActions: 1 },
      },
    });
  });

  it("requires exactly one successful release migration", async () => {
    for (const requiredMigrationMatches of [0, 2]) {
      await expect(inspectDatabaseRestore(queries({
        inspectMigrations: vi.fn(async () => ({
          appliedMigrations: 26,
          requiredMigrationMatches,
          unfinishedMigrations: 0,
        })),
      }))).rejects.toMatchObject({ code: "ERESTORE_REQUIRED_MIGRATION" });
    }
  });

  it("rejects unfinished migration work", async () => {
    await expect(inspectDatabaseRestore(queries({
      inspectMigrations: vi.fn(async () => ({
        appliedMigrations: 26,
        requiredMigrationMatches: 1,
        unfinishedMigrations: 1,
      })),
    }))).rejects.toMatchObject({ code: "ERESTORE_UNFINISHED_MIGRATION" });
  });

  it("requires a populated catalog while permitting a legitimate pre-user restore", async () => {
    await expect(inspectDatabaseRestore(queries({
      countData: vi.fn(async () => dataCounts({ subjects: 0 })),
    }))).rejects.toMatchObject({ code: "ERESTORE_CATALOG_EMPTY" });

    await expect(inspectDatabaseRestore(queries({
      countData: vi.fn(async () => dataCounts({
        users: 0,
        providerAccounts: 0,
        consentRecords: 0,
        learners: 0,
        practiceSessions: 0,
        practiceAttempts: 0,
        learnerBadges: 0,
        dailyActivities: 0,
        savedQuestions: 0,
        reviewItems: 0,
        questionReports: 0,
        contentReviewActions: 0,
      })),
    }))).resolves.toMatchObject({ counts: { identity: { users: 0 }, learning: { learners: 0 } } });
  });

  it("rejects malformed aggregate results", async () => {
    for (const invalid of [-1, 1.5, Number.NaN]) {
      await expect(inspectDatabaseRestore(queries({
        countData: vi.fn(async () => dataCounts({ practiceAttempts: invalid })),
      }))).rejects.toMatchObject({ code: "ERESTORE_COUNT_INVALID" });
    }
    expect(RESTORE_COUNT_KEYS).toHaveLength(22);
  });
});
