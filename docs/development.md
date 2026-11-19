# Development guide

## Local setup

The repository ignores `.env`; copy the SQLite example and seed a local database:

```bash
cp .env.example .env
npm install
npm run dependencies:activate
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev
```

The seed upserts questions by their stable source IDs, so running it again is safe. It skips entirely when the content manifest has not changed since the last import.

Visitors land on `/` and can use `/practice` without saving anything; finishing a guest round invites them to register. Signed-in learners also use `/progress`, `/review`, `/contest`, `/browse`, `/profile`, and `/privacy`. Content editors and administrators can open `/studio`. `/api/live` is the dependency-free liveness probe and `/api/health` the readiness probe.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Development server on port 3000 |
| `npm test` | Vitest unit tests and app script tests |
| `npm run test:integration` | Integration suite against a fresh SQLite database |
| `npm run test:integration:postgres` | Integration suite against `DATABASE_URL` (PostgreSQL) |
| `npm run test:e2e` | Seeded browser journeys; run `npx playwright install chromium` once |
| `npm run typecheck`, `npm run lint`, `npm run build` | Static checks and production build |
| `npm run schema:check` | SQLite and PostgreSQL Prisma models still match |
| `npm run data:verify` | Every source and translated-content gate |
| `npm run seed:verify` | Import into a fresh database and compare counts with `docs/catalog-stats.json` |
| `npm run docs:check` | Catalog numbers in the docs match `docs/catalog-stats.json` |
| `npm run perf:check` | Query-count budget for the practice hot path |
| `npm run learners:audit` | Report learner history that points at missing questions |
| `npm run reports:review -- list` | Inspect the content-report queue |
| `npm run users:role -- editor@example.com CONTENT_EDITOR` | Grant studio access |
| `npm run notifications:send` | Send due reminder emails (schedule hourly) |
| `npm run data:cleanup` | Delete expired security artifacts |
| `npm run supply:check` | Immutable build inputs and dependency-script policy |
| `npm run smoke:deployment -- <origin>` | Cookie-free smoke journey against a deployment |
| `npm run db:studio` | Prisma Studio for the local database |

Production-only probes (`probe:capacity`, `smoke:email`, `smoke:oauth`, `restore:verify`, `launch:verify`) are described in [operations](operations.md).

## Adding question content

1. Put a new `.json` archive with the source contract from `data/schema.json` in `data/zh-CN/` and list it in `data/catalog.json`. Translated archives go under their BCP 47 locale directory with matching filenames and stable IDs.
2. Add subject, grade, difficulty, or type aliases for a new provider in [`src/lib/content.ts`](../src/lib/content.ts), the normalization boundary.
3. Add source-specific invariants to `npm run data:verify` so CI enforces them.
4. Run `npm run data:verify`, `npm run db:seed`, then `npm run seed:verify -- --update` and `npm run docs:check -- --write` to record the new catalog numbers.

Reviewed corrections belong in `src/lib/content-curation.ts`, not in the database. Curated taxonomy tags use `source = "CURATED"` and confidence `1`; the importer only produces `RULE` and `IMPORT` tags and never overwrites curated links. To replace or merge a question, see "Retiring and merging questions" in [operations](operations.md). The full workflow is in [CONTRIBUTING.md](../CONTRIBUTING.md).

## Product boundaries

- Only answer keys parsed with high confidence are auto-graded (<!-- stat:seed.autoGradable -->10,130<!-- /stat --> questions). Written and ambiguous answers reveal the reference answer for self-assessment (<!-- stat:derived.selfAssessed -->5,892<!-- /stat --> questions).
- Unrecognized nested, missing-stem, malformed-choice, and figure-dependent imports default to `NEEDS_REVIEW`. Every bundled record currently has a reviewed correction or replacement and is published (<!-- stat:seed.review -->0<!-- /stat --> records need review).
- AMC figures are stored under `public/question-assets/source/amc/`, deduplicated by SHA-256 and traced in `manifest.json`. Reviewed Chinese replacement diagrams (<!-- stat:repository.generatedDiagrams -->24<!-- /stat --> SVG files for <!-- stat:repository.generatedDiagramQuestions -->21<!-- /stat --> questions) live under `public/question-assets/generated/zh-CN/`.
- Topic tags are discovery hints, not authoritative curriculum classification.
- Guests have no persistent identity. Public accounts are limited to adult learners and parents or legal guardians, who can add child profiles. School deployments still need institutional consent, identity, and retention processes.
