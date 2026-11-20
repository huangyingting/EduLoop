# 0001. Separate SQLite and PostgreSQL Prisma schemas

- Status: Accepted
- Date: 2026-11-19 (recorded; the decision predates this log)

## Context

Contributors should be able to run the whole app with no database server, but production needs PostgreSQL for concurrency, TLS, managed backups, and connection pooling. Prisma binds one schema file to one provider, and SQLite migration SQL is not safe to apply to PostgreSQL.

## Decision

- Keep two schema files with identical models: `prisma/schema.prisma` (SQLite) and `prisma/postgresql/schema.prisma`.
- Keep a migration history per provider. Every data-model change adds a migration to both directories, with the same name.
- `npm run schema:check` fails when the models differ, when one history has a migration the other lacks, or when `REQUIRED_DATABASE_MIGRATION` in `src/lib/database-migration.ts` is not the latest migration.
- Readiness (`/api/health`) refuses traffic when the database has not applied `REQUIRED_DATABASE_MIGRATION`.
- Raw SQL in application code is limited to statements both providers accept (for example `INSERT ... ON CONFLICT DO NOTHING`).

## Consequences

- Local setup is `npm run db:migrate && npm run db:seed` with no services.
- Every schema change costs two hand-checked migrations. SQLite column additions are written as `ALTER TABLE ... ADD COLUMN` rather than Prisma's table rebuilds where possible.
- The integration suite runs against both providers in CI, so provider-specific behavior (locking, constraint names, case sensitivity) is caught before release.
