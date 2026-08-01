import { REQUIRED_DATABASE_MIGRATION } from "./database-migration";

const SECURE_POSTGRES_SSL_MODES = new Set(["require", "verify-ca", "verify-full"]);
const RESTORE_CONFIRMATION = "1";

export const RESTORE_COUNT_KEYS = [
  "subjects",
  "gradeBands",
  "grades",
  "questions",
  "questionOptions",
  "questionAssets",
  "tagDimensions",
  "tags",
  "questionTags",
  "badges",
  "users",
  "providerAccounts",
  "consentRecords",
  "learners",
  "practiceSessions",
  "practiceAttempts",
  "learnerBadges",
  "dailyActivities",
  "savedQuestions",
  "reviewItems",
  "questionReports",
  "contentReviewActions",
] as const;

export type RestoreCountKey = typeof RESTORE_COUNT_KEYS[number];
export type RestoreDataCounts = Record<RestoreCountKey, number>;

export type RestoreMigrationState = {
  appliedMigrations: number;
  requiredMigrationMatches: number;
  unfinishedMigrations: number;
};

export type DatabaseRestoreVerificationQueries = {
  countData: () => Promise<RestoreDataCounts>;
  inspectMigrations: () => Promise<RestoreMigrationState>;
};

export type DatabaseRestoreVerificationErrorCode =
  | "ERESTORE_APPLICATION_TARGET"
  | "ERESTORE_CATALOG_EMPTY"
  | "ERESTORE_CONFIRMATION_REQUIRED"
  | "ERESTORE_CONNECTION_PARAMETERS"
  | "ERESTORE_COUNT_INVALID"
  | "ERESTORE_REQUIRED_MIGRATION"
  | "ERESTORE_TLS_REQUIRED"
  | "ERESTORE_UNFINISHED_MIGRATION"
  | "ERESTORE_URL_INVALID"
  | "ERESTORE_URL_REQUIRED";

const ERROR_MESSAGES: Record<DatabaseRestoreVerificationErrorCode, string> = {
  ERESTORE_APPLICATION_TARGET: "The restore target must not be the configured application database.",
  ERESTORE_CATALOG_EMPTY: "The restored database must contain a populated subject and question catalog.",
  ERESTORE_CONFIRMATION_REQUIRED: "RESTORE_CONFIRM_ISOLATED=1 is required for an isolated restore target.",
  ERESTORE_CONNECTION_PARAMETERS: "The restore URL must use one connection and bounded pool and connection timeouts.",
  ERESTORE_COUNT_INVALID: "The restored database returned an invalid aggregate count.",
  ERESTORE_REQUIRED_MIGRATION: "The restored database is missing the release's required successful migration.",
  ERESTORE_TLS_REQUIRED: "A remote restore database must use certificate-validated TLS.",
  ERESTORE_UNFINISHED_MIGRATION: "The restored database contains an unfinished migration.",
  ERESTORE_URL_INVALID: "RESTORE_DATABASE_URL must be a valid PostgreSQL URL with a host and database name.",
  ERESTORE_URL_REQUIRED: "RESTORE_DATABASE_URL is required.",
};

export class DatabaseRestoreVerificationError extends Error {
  readonly code: DatabaseRestoreVerificationErrorCode;

  constructor(code: DatabaseRestoreVerificationErrorCode) {
    super(ERROR_MESSAGES[code]);
    this.name = "DatabaseRestoreVerificationError";
    this.code = code;
  }
}

function parsePostgresqlUrl(value: string) {
  try {
    const parsed = new URL(value);
    if (
      !["postgresql:", "postgres:"].includes(parsed.protocol)
      || !parsed.hostname
      || parsed.pathname.length <= 1
      || parsed.hash
    ) return null;
    return parsed;
  } catch {
    return null;
  }
}

function isLoopbackHostname(hostname: string) {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1";
}

function validSingleIntegerParameter(
  parsed: URL,
  name: string,
  minimum: number,
  maximum: number,
) {
  const values = parsed.searchParams.getAll(name);
  if (values.length !== 1 || !/^\d+$/.test(values[0])) return false;
  const numericValue = Number(values[0]);
  return Number.isSafeInteger(numericValue)
    && numericValue >= minimum
    && numericValue <= maximum;
}

function databaseTarget(parsed: URL) {
  let databaseName: string;
  try {
    databaseName = decodeURIComponent(parsed.pathname.slice(1));
  } catch {
    throw new DatabaseRestoreVerificationError("ERESTORE_URL_INVALID");
  }
  const normalizedHostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  return {
    hostname: isLoopbackHostname(normalizedHostname) ? "loopback" : normalizedHostname,
    port: parsed.port || "5432",
    databaseName,
  };
}

function sameDatabaseTarget(left: URL, right: URL) {
  const leftTarget = databaseTarget(left);
  const rightTarget = databaseTarget(right);
  return leftTarget.hostname === rightTarget.hostname
    && leftTarget.port === rightTarget.port
    && leftTarget.databaseName === rightTarget.databaseName;
}

export function validateRestoreDatabaseTarget({
  applicationDatabaseUrl,
  confirmation,
  restoreDatabaseUrl,
}: {
  applicationDatabaseUrl?: string;
  confirmation?: string;
  restoreDatabaseUrl?: string;
}) {
  const candidate = restoreDatabaseUrl?.trim();
  if (!candidate) throw new DatabaseRestoreVerificationError("ERESTORE_URL_REQUIRED");
  if (confirmation?.trim() !== RESTORE_CONFIRMATION) {
    throw new DatabaseRestoreVerificationError("ERESTORE_CONFIRMATION_REQUIRED");
  }

  const parsed = parsePostgresqlUrl(candidate);
  if (!parsed) throw new DatabaseRestoreVerificationError("ERESTORE_URL_INVALID");

  if (
    !validSingleIntegerParameter(parsed, "connection_limit", 1, 1)
    || !validSingleIntegerParameter(parsed, "pool_timeout", 1, 30)
    || !validSingleIntegerParameter(parsed, "connect_timeout", 1, 30)
  ) {
    throw new DatabaseRestoreVerificationError("ERESTORE_CONNECTION_PARAMETERS");
  }

  if (!isLoopbackHostname(parsed.hostname)) {
    const sslModes = parsed.searchParams.getAll("sslmode").map((value) => value.toLowerCase());
    const sslAcceptModes = parsed.searchParams.getAll("sslaccept").map((value) => value.toLowerCase());
    if (
      sslModes.length !== 1
      || !SECURE_POSTGRES_SSL_MODES.has(sslModes[0])
      || sslAcceptModes.length > 1
      || (sslAcceptModes[0] && sslAcceptModes[0] !== "strict")
    ) {
      throw new DatabaseRestoreVerificationError("ERESTORE_TLS_REQUIRED");
    }
  }

  const applicationUrl = applicationDatabaseUrl?.trim();
  const parsedApplicationUrl = applicationUrl ? parsePostgresqlUrl(applicationUrl) : null;
  if (parsedApplicationUrl && sameDatabaseTarget(parsed, parsedApplicationUrl)) {
    throw new DatabaseRestoreVerificationError("ERESTORE_APPLICATION_TARGET");
  }

  return candidate;
}

function assertValidCounts(counts: RestoreDataCounts) {
  for (const key of RESTORE_COUNT_KEYS) {
    if (!Number.isSafeInteger(counts[key]) || counts[key] < 0) {
      throw new DatabaseRestoreVerificationError("ERESTORE_COUNT_INVALID");
    }
  }
}

export async function inspectDatabaseRestore(queries: DatabaseRestoreVerificationQueries) {
  const [migration, counts] = await Promise.all([
    queries.inspectMigrations(),
    queries.countData(),
  ]);

  if (
    !Number.isSafeInteger(migration.appliedMigrations)
    || migration.appliedMigrations < 0
    || !Number.isSafeInteger(migration.requiredMigrationMatches)
    || migration.requiredMigrationMatches < 0
    || !Number.isSafeInteger(migration.unfinishedMigrations)
    || migration.unfinishedMigrations < 0
  ) {
    throw new DatabaseRestoreVerificationError("ERESTORE_COUNT_INVALID");
  }
  if (migration.requiredMigrationMatches !== 1) {
    throw new DatabaseRestoreVerificationError("ERESTORE_REQUIRED_MIGRATION");
  }
  if (migration.unfinishedMigrations !== 0) {
    throw new DatabaseRestoreVerificationError("ERESTORE_UNFINISHED_MIGRATION");
  }
  assertValidCounts(counts);
  if (counts.subjects === 0 || counts.questions === 0) {
    throw new DatabaseRestoreVerificationError("ERESTORE_CATALOG_EMPTY");
  }

  return {
    requiredMigration: REQUIRED_DATABASE_MIGRATION,
    appliedMigrations: migration.appliedMigrations,
    counts: {
      catalog: {
        subjects: counts.subjects,
        gradeBands: counts.gradeBands,
        grades: counts.grades,
        questions: counts.questions,
        questionOptions: counts.questionOptions,
        questionAssets: counts.questionAssets,
        tagDimensions: counts.tagDimensions,
        tags: counts.tags,
        questionTags: counts.questionTags,
        badges: counts.badges,
      },
      identity: {
        users: counts.users,
        providerAccounts: counts.providerAccounts,
        consentRecords: counts.consentRecords,
      },
      learning: {
        learners: counts.learners,
        practiceSessions: counts.practiceSessions,
        practiceAttempts: counts.practiceAttempts,
        learnerBadges: counts.learnerBadges,
        dailyActivities: counts.dailyActivities,
        savedQuestions: counts.savedQuestions,
        reviewItems: counts.reviewItems,
      },
      governance: {
        questionReports: counts.questionReports,
        contentReviewActions: counts.contentReviewActions,
      },
    },
  };
}
