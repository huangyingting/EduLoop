import { PrismaClient, type Prisma } from "@prisma/client";
import {
  inspectDatabaseRestore,
  type RestoreDataCounts,
  type RestoreMigrationState,
  validateRestoreDatabaseTarget,
} from "../src/lib/database-restore-verification";
import { REQUIRED_DATABASE_MIGRATION } from "../src/lib/database-migration";
import {
  finishOperatorCommand,
  operatorCommandFailureEntry,
  startOperatorCommand,
} from "../src/lib/operator-command";

const commandTiming = startOperatorCommand();

function numericCount(value: bigint | number) {
  const count = Number(value);
  return Number.isSafeInteger(count) ? count : Number.NaN;
}

async function inspectMigrations(transaction: Prisma.TransactionClient): Promise<RestoreMigrationState> {
  const rows = await transaction.$queryRaw<Array<{
    applied_migrations: bigint;
    required_migration_matches: bigint;
    unfinished_migrations: bigint;
  }>>`
    SELECT
      COUNT(*) FILTER (
        WHERE "finished_at" IS NOT NULL
          AND "rolled_back_at" IS NULL
      ) AS "applied_migrations",
      COUNT(*) FILTER (
        WHERE "migration_name" = ${REQUIRED_DATABASE_MIGRATION}
          AND "finished_at" IS NOT NULL
          AND "rolled_back_at" IS NULL
      ) AS "required_migration_matches",
      COUNT(*) FILTER (
        WHERE "finished_at" IS NULL
          AND "rolled_back_at" IS NULL
      ) AS "unfinished_migrations"
    FROM "_prisma_migrations"
  `;
  const row = rows[0];
  return {
    appliedMigrations: numericCount(row?.applied_migrations ?? Number.NaN),
    requiredMigrationMatches: numericCount(row?.required_migration_matches ?? Number.NaN),
    unfinishedMigrations: numericCount(row?.unfinished_migrations ?? Number.NaN),
  };
}

async function countData(transaction: Prisma.TransactionClient): Promise<RestoreDataCounts> {
  const [
    subjects,
    gradeBands,
    grades,
    questions,
    questionOptions,
    questionAssets,
    tagDimensions,
    tags,
    questionTags,
    badges,
    users,
    providerAccounts,
    consentRecords,
    learners,
    practiceSessions,
    practiceAttempts,
    learnerBadges,
    dailyActivities,
    savedQuestions,
    reviewItems,
    questionReports,
    contentReviewActions,
  ] = await Promise.all([
    transaction.subject.count(),
    transaction.gradeBand.count(),
    transaction.grade.count(),
    transaction.question.count(),
    transaction.questionOption.count(),
    transaction.questionAsset.count(),
    transaction.tagDimension.count(),
    transaction.tag.count(),
    transaction.questionTag.count(),
    transaction.badge.count(),
    transaction.user.count(),
    transaction.account.count(),
    transaction.consentRecord.count(),
    transaction.learnerProfile.count(),
    transaction.practiceSession.count(),
    transaction.practiceAttempt.count(),
    transaction.learnerBadge.count(),
    transaction.dailyActivity.count(),
    transaction.savedQuestion.count(),
    transaction.reviewItem.count(),
    transaction.questionReport.count(),
    transaction.contentReviewAction.count(),
  ]);
  return {
    subjects,
    gradeBands,
    grades,
    questions,
    questionOptions,
    questionAssets,
    tagDimensions,
    tags,
    questionTags,
    badges,
    users,
    providerAccounts,
    consentRecords,
    learners,
    practiceSessions,
    practiceAttempts,
    learnerBadges,
    dailyActivities,
    savedQuestions,
    reviewItems,
    questionReports,
    contentReviewActions,
  };
}

async function main() {
  const restoreDatabaseUrl = validateRestoreDatabaseTarget({
    restoreDatabaseUrl: process.env.RESTORE_DATABASE_URL,
    applicationDatabaseUrl: process.env.DATABASE_URL,
    confirmation: process.env.RESTORE_CONFIRM_ISOLATED,
  });
  const prisma = new PrismaClient({
    datasourceUrl: restoreDatabaseUrl,
    errorFormat: "minimal",
    log: [],
  });
  try {
    return await prisma.$transaction(async (transaction: Prisma.TransactionClient) => {
      await transaction.$executeRaw`SET TRANSACTION READ ONLY`;
      return inspectDatabaseRestore({
        inspectMigrations: () => inspectMigrations(transaction),
        countData: () => countData(transaction),
      });
    }, {
      isolationLevel: "Serializable",
      maxWait: 5_000,
      timeout: 30_000,
    });
  } finally {
    await prisma.$disconnect();
  }
}

void main()
  .then((result) => {
    const completed = finishOperatorCommand(commandTiming);
    console.info(JSON.stringify({
      level: "info",
      event: "database_restore_verification_completed",
      startedAt: completed.startedAt,
      completedAt: completed.finishedAt,
      durationMs: completed.durationMs,
      ...result,
    }));
  })
  .catch((error) => {
    console.error(JSON.stringify(operatorCommandFailureEntry(
      "database_restore_verification",
      error,
      commandTiming,
    )));
    process.exitCode = 1;
  });
