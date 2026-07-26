# Architecture

## Runtime shape

```text
Browser
  -> Next.js App Router pages and client practice player
  -> /api/questions/next (filtered selection; answer omitted)
  -> /api/attempts (server-side grading and rewards)
  -> Prisma Client
  -> SQLite locally / PostgreSQL in production

data/*.json
  -> normalization boundary
  -> catalog + questions + options + inferred tags
```

The question API returns only the stem, options, display metadata, and tags. Correct labels, reference answers, and explanations remain server-side until an attempt is posted.

## Data-model decisions

- Source IDs are the canonical question IDs. Imports are idempotent and traceable by `sourceFile` and `sourceType`.
- Subject, grade band, and grade are relations because they have display metadata, ordering, and stable identity.
- Difficulty and normalized question type are portable strings so the model behaves identically on SQLite and PostgreSQL.
- Options are ordered child rows; answer labels are stored as a small JSON-encoded string because both database providers can handle it without provider-specific array types.
- Tags are many-to-many and dimensioned. Confidence plus provenance prevents inferred metadata from masquerading as teacher-reviewed truth.
- Practice attempts are immutable events. `DailyActivity` is a derived aggregate for efficient streak/history displays.
- `LearnerProfile.deviceKey` is an authentication seam. A future identity provider can attach accounts without rewriting question or attempt records.

## Selection and scaling

The MVP chooses a random offset within the filtered result count and excludes the last eight client-seen IDs. This is simple and adequate for 10k questions. At larger scale, replace offset selection with a precomputed random key or adaptive candidate service; large PostgreSQL offsets should not become the long-term recommendation engine.

The next recommendation layer should consider due review items, topic exposure, recent correctness, difficulty calibration, and content confidence. Keep recommendation output explainable (“reviewing geometry after two misses”), particularly for children.

## Database workflow

SQLite and PostgreSQL have separate schema entrypoints and migration histories:

- `prisma/schema.prisma` and `prisma/migrations/` for local SQLite.
- `prisma/postgresql/schema.prisma` and `prisma/postgresql/migrations/` for production PostgreSQL.

Both contain the same portable models but different datasource providers. This duplication is explicit and testable; it avoids runtime provider tricks and prevents SQLite migration SQL from reaching production. Schema changes must be applied to both files in one change.

For a production schema change, update both schemas, run a local migration, generate a PostgreSQL migration against a disposable/shadow PostgreSQL database, inspect both SQL files, and then deploy the PostgreSQL migration before the application build starts serving traffic.

## Content pipeline

`src/lib/content.ts` is the anti-corruption layer between external content and product concepts. It:

- strips source-specific labels into stable difficulty and type values;
- extracts only conservative choice answer keys;
- marks unrenderable/compound records for review;
- produces options and inferred tags;
- preserves full answer and explanation text.

The importer rebuilds `IMPORT`/`RULE` option and tag links but preserves links whose source is `CURATED`; it also does not delete learner history. A future content-admin workflow can therefore promote or add editorial tags without losing them on the next import.

## Near-term production hardening

1. Add real authentication, rate limiting, request logging, and abuse controls to attempt endpoints.
2. Add an admin-only review/report workflow and schema fields for content revision history.
3. Validate database schema parity in CI and test imports against representative fixtures.
4. Add API integration tests against SQLite and PostgreSQL.
5. Add error monitoring, backups, retention rules, and privacy/consent documentation.
6. Replace per-attempt badge queries with a reward service or asynchronous event handler as traffic grows.
