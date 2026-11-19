import { prisma } from "./prisma";
import { REQUIRED_DATABASE_MIGRATION } from "./database-migration";

export { REQUIRED_DATABASE_MIGRATION } from "./database-migration";

export type CatalogReleaseSummary = { manifestHash: string; completedAt: Date };

export type DatabaseReadinessQueries = {
  countQuestions: () => Promise<number>;
  countSubjects: () => Promise<number>;
  hasRequiredMigration: () => Promise<boolean>;
  latestCatalogRelease?: () => Promise<CatalogReleaseSummary | null>;
};

const productionQueries: DatabaseReadinessQueries = {
  countQuestions: () => prisma.question.count({ where: { status: "PUBLISHED" } }),
  countSubjects: () => prisma.subject.count(),
  latestCatalogRelease: () => prisma.catalogRelease.findFirst({
    where: { scope: "catalog" },
    orderBy: { completedAt: "desc" },
    select: { manifestHash: true, completedAt: true },
  }),
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
  // The release table exists only once the schema is current.
  const release = hasRequiredMigration && queries.latestCatalogRelease
    ? await queries.latestCatalogRelease()
    : null;
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
    catalog: {
      subjects,
      questions,
      // A short manifest prefix identifies the live content without exposing it.
      release: release
        ? { version: release.manifestHash.slice(0, 12), importedAt: release.completedAt.toISOString() }
        : null,
    },
  };
}
