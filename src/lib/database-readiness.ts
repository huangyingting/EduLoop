import { prisma } from "./prisma";

// Advance this marker with every migration. schema:check keeps it aligned with
// both provider histories so a newer application cannot accept old-schema traffic.
export const REQUIRED_DATABASE_MIGRATION = "20260731050000_shared_rate_limits";

export type DatabaseReadinessQueries = {
  countQuestions: () => Promise<number>;
  countSubjects: () => Promise<number>;
  hasRequiredMigration: () => Promise<boolean>;
};

const productionQueries: DatabaseReadinessQueries = {
  countQuestions: () => prisma.question.count(),
  countSubjects: () => prisma.subject.count(),
  async hasRequiredMigration() {
    const rows = await prisma.$queryRaw<Array<{ migration_name: string }>>`
      SELECT "migration_name"
      FROM "_prisma_migrations"
      WHERE "migration_name" = ${REQUIRED_DATABASE_MIGRATION}
        AND "finished_at" IS NOT NULL
        AND "rolled_back_at" IS NULL
      LIMIT 1
    `;
    return rows.length === 1;
  },
};

export async function inspectDatabaseReadiness(queries: DatabaseReadinessQueries = productionQueries) {
  const [subjects, questions, hasRequiredMigration] = await Promise.all([
    queries.countSubjects(),
    queries.countQuestions(),
    queries.hasRequiredMigration(),
  ]);
  const status = !hasRequiredMigration
    ? "outdated" as const
    : subjects > 0 && questions > 0
      ? "ok" as const
      : "initializing" as const;
  return {
    ready: status === "ok",
    status,
    database: "ready" as const,
    schema: {
      status: hasRequiredMigration ? "ready" as const : "outdated" as const,
      requiredMigration: REQUIRED_DATABASE_MIGRATION,
    },
    catalog: { subjects, questions },
  };
}
