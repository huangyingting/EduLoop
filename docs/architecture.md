# Architecture

## Runtime shape

```text
Browser
  -> Next.js App Router pages and client practice player
  -> /api/auth/* (optional account and database session)
  -> /api/questions/next (filtered selection; answer omitted)
  -> /api/attempts (server-side grading and rewards)
  -> /api/sessions, /api/review, /api/learner/progress
  -> Prisma Client
  -> SQLite locally / PostgreSQL in production

data/zh-CN/*.json (default runtime catalog)
  -> normalization boundary
  -> catalog + questions + options + inferred tags

data/en/amc*.json
  -> localization + structural parity audit
  -> data/zh-CN/amc*.json

public/question-assets/source/amc/*
  -> shared, content-addressed upstream figures

public/question-assets/generated/zh-CN/<question-id>/*
  -> reviewed locale-specific replacement diagrams
```

The catalog API discovers every filterable tag dimension from the database, so new curriculum dimensions do not require a new practice UI control. Question filters encode tags as `DIMENSION:slug` while retaining unqualified topic slugs for older links. A bounded `questionId` filter lets saved and scheduled-review cards reuse the same player for targeted practice. The question API returns only the stem, options, display metadata, and tags. Correct labels, reference answers, and explanations remain server-side until an attempt is posted.

## Data-model decisions

- Source IDs are the canonical question IDs. Imports are idempotent and traceable by `sourceFile` and `sourceType`.
- Subject, grade band, and grade are relations because they have display metadata, ordering, and stable identity.
- Difficulty and normalized question type are portable strings so the model behaves identically on SQLite and PostgreSQL.
- Options are ordered child rows; answer labels are stored as a small JSON-encoded string because both database providers can handle it without provider-specific array types.
- Tags are many-to-many and dimensioned. Confidence plus provenance prevents inferred metadata from masquerading as teacher-reviewed truth.
- Practice attempts are immutable events. A browser-generated unique attempt ID makes network retries idempotent, while `DailyActivity` is a derived aggregate for efficient streak/history displays.
- `ReviewItem` stores the explainable 1/3/7-day mistake schedule; `SavedQuestion` is independent of correctness. Review lists and counts honor the same `PUBLISHED` boundary as question serving.
- Written attempts are created before the learner sees the reference answer; their nullable correctness is then finalized by an explicit self-assessment update.
- `QuestionReport` captures learner feedback for the protected content-review workflow.
- `LearnerProfile` has one optional unique `User`. Guests resolve by `deviceKey`; authenticated requests resolve by the hashed database session and `userId` instead of trusting that client key.
- Registering links the current guest profile. Logging into an established account merges unowned guest activity into its profile while preserving dependent attempts, sessions, daily activity, badges, saved questions, reviews, and reports.

## Selection and scaling

The MVP chooses a random offset within the filtered result count and excludes the last eight client-seen IDs. This is simple and adequate for 10k questions. At larger scale, replace offset selection with a precomputed random key or adaptive candidate service; large PostgreSQL offsets should not become the long-term recommendation engine.

The recommendation layer prioritizes due review items, then sufficiently observed topic weakness within the active filters, and finally recent subject accuracy. Topic ranking uses accuracy plus a bounded response-time penalty so slow but correct work can receive more practice without overpowering correctness. Its output remains explainable, and future calibration can add curriculum confidence without changing the question API contract.

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

The importer rebuilds `IMPORT`/`RULE` option and tag links but preserves links whose source is `CURATED`; it also does not delete learner history. A future content-admin workflow can therefore promote or add editorial tags without losing them on the next import. Generated diagram replacements require an explicit `APPROVED` status before the practice API exposes them; all 12 current assets have completed that review. Learner reports are stored separately so content can be corrected without rewriting attempts.

## Production boundaries

- Public mode supports anonymous use and optional first-party email/password accounts. Institutional identity, verified guardian consent, teacher roles, password recovery, and school lifecycle management remain separate launch requirements.
- Mutation endpoints have per-process protection. Multi-replica deployments must also enforce limits at the trusted ingress or a shared rate-limit service.
- Errors are emitted as structured JSON through Next.js instrumentation; production must forward stdout/stderr to a monitored log or error service.
- `/api/health` verifies database readiness. CI checks types, lint, unit tests, content audit, schema parity, and the production build.
- PostgreSQL migrations, backups, restore drills, HTTPS, secret rotation, and rollback are deployment responsibilities documented in `docs/operations.md`.
