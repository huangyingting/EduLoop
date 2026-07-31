# EduLoop

EduLoop is a Chinese-language practice app for primary, middle, and high school students. The scaffold turns the nine Simplified Chinese files in `data/zh-CN/`—six subject archives plus AMC 8, AMC 10, and AMC 12 archives—into a searchable question bank, supports automatically graded choice questions and self-assessed written work, and wraps the practice loop in lightweight XP, streak, and badge rewards. Matching English AMC source archives live in `data/en/`.

## What is included

- Next.js App Router, React, TypeScript, and Tailwind CSS 4
- Prisma with SQLite for local development and a parallel PostgreSQL production schema
- Idempotent import for all 16,537 unique questions, including 2,499 licensed CJEval junior-high Chinese questions, 227 MIT-licensed AGIEval high-school Chinese questions, and 3,462 AMC questions representing 3,575 contest slots, with BOM-safe JSON parsing
- Normalized subject, school stage, grade, difficulty, and question-family filters
- Extensible, learner-filterable topic, skill, and format dimensions with provenance and confidence
- KaTeX rendering for the 4,595 questions detected with LaTeX-like notation, including inline AMC notation
- Server-side answer checking, account-owned learner profiles, XP, daily streaks, activity, and badges
- Auth.js verified email/password plus optional Google, Microsoft, and Facebook login, single-use email password recovery, encrypted revocable sessions, full account erasure, cross-device progress, and stateless guest practice
- Ten-question sessions, written-answer self-assessment, saved questions, and spaced mistake review
- Adaptive practice that prioritizes due reviews and recently weak subjects
- Growth dashboard with a 28-day activity map, subject signals, topic radar, and badge shelf
- Question-quality reports, learner-data export/deletion, health checks, security headers, and bounded APIs
- Role-protected content review workspace with immediate quarantine and an attributable action history
- First-party learning-loop health summaries without third-party tracking or learner-level operator views
- Responsive, keyboard-friendly student dashboard and practice experience

## Run locally

The repository includes an ignored local `.env` configured for SQLite. For a fresh checkout:

```bash
cp .env.example .env
npm install
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The full seed takes roughly one minute and is safe to run again: imported questions are upserted by their stable source IDs.

Useful commands:

```bash
npm run data:verify      # run every source and translated-content gate
npm run seed:verify      # import into a fresh database and verify catalog counts
npm run reports:review -- list # inspect the trusted content-report queue
npm run users:role -- editor@example.com CONTENT_EDITOR # grant review workspace access
npm run schema:check   # ensure SQLite/PostgreSQL models still match
npm run db:studio      # inspect the local database
npm run test           # normalization unit tests
npm run test:integration
npm run test:e2e       # seeded browser journeys; first run: npx playwright install chromium
npm run typecheck
npm run lint
npm run build
```

Specialist content-import commands are documented in [`data/README.md`](data/README.md) and run directly from `scripts/`.

Guests may use `/practice` without saving anything. After login, the main student routes are `/`, `/practice`, `/progress`, `/review`, and `/privacy`; authorized content editors can also use `/studio`. `/api/health` is the deployment readiness probe.

## PostgreSQL production deployment

Production has its own schema and migration history under `prisma/postgresql/`. In CI or the deployment build:

```bash
export DATABASE_URL='postgresql://USER:PASSWORD@HOST:5432/eduloop?schema=public'
export EDULOOP_DATABASE_PROVIDER='postgresql'
export APP_VERSION='RELEASE_ID'
npm ci
npm run env:check
npm run db:generate:postgres
npm run db:deploy:postgres
npm run build
```

Run `npm run db:seed` once if the production database should include the bundled question set. The SQLite and PostgreSQL Prisma models intentionally match; when the data model changes, update both schema files and generate a migration in each migration directory. This keeps local setup simple without pretending SQLite migrations are safe to apply to PostgreSQL.

The included multi-stage `Dockerfile` builds the PostgreSQL Prisma client and Next.js standalone server. Its startup validation refuses provider drift and malformed ports before accepting traffic. Apply migrations and seed content as release jobs before starting application replicas. See [production readiness](./docs/production-readiness.md) and [operations](./docs/operations.md) for launch gates, backups, monitoring, and rollback guidance.

## Adding question content

Place another `.json` file with the same source contract in `data/zh-CN/`, then run `npm run data:verify` and `npm run db:seed`. Put translated source material under its BCP 47 locale directory and keep matching filenames and stable IDs across locales. Stable source IDs prevent duplicates. The normalization boundary is [content.ts](./src/lib/content.ts): add aliases there when a new provider uses different subject, grade, difficulty, or type labels. Add source-specific invariants to `data:verify` so CI enforces them alongside the generic audit. See [the content layout](./data/README.md) for the directory contract.

For curated taxonomy, add or update `Tag` and `QuestionTag` rows through Prisma. Curated tags should use `source = "CURATED"` and confidence `1`; the importer currently produces deterministic `RULE` and `IMPORT` tags. A future admin workflow can manage these rows without changing the question table.

## Important product boundaries

- Only answer keys that can be parsed with high confidence are auto-graded. Written and ambiguous answers reveal the reference answer for student self-assessment.
- Unrecognized nested, missing-stem, malformed-choice, and figure-dependent imports are marked `NEEDS_REVIEW` by default. All current bundled records have reviewed corrections or replacements and are published; curation lives in `src/lib/content-curation.ts`.
- The four original subject files contain no linked image assets. Shared AMC figures are downloaded into `public/question-assets/source/amc/`, deduplicated by SHA-256, and traced to their original URLs in `manifest.json`; five remote hosts remain allowlisted only as a pre-localization fallback. Twelve reviewed Chinese replacement diagrams live under `public/question-assets/generated/zh-CN/`. Topic tags are useful discovery hints, not authoritative curriculum classification.
- Guests have no persistent identity: their answers, filters, and counters remain only in the open practice page and disappear on refresh or close. Auth.js password or social accounts own one `LearnerProfile` for cross-device progress. School-managed deployments still need guardian-consent, email-verification/recovery, and staff-role policies appropriate to their jurisdiction.

See [authentication](./docs/authentication.md), [data audit](./docs/data-audit.md), [product design](./docs/product-design.md), and [architecture](./docs/architecture.md) for the decisions behind the scaffold.
