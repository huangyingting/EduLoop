# EduLoop

EduLoop is a Chinese-language practice app for primary, middle, and high school students. The scaffold turns the four subject files in `data/` (`mathematics.json`, `physics.json`, `chemistry.json`, and `biology.json`) into a searchable question bank, supports automatically graded choice questions and self-assessed written work, and wraps the practice loop in lightweight XP, streak, and badge rewards.

## What is included

- Next.js App Router, React, TypeScript, and Tailwind CSS 4
- Prisma with SQLite for local development and a parallel PostgreSQL production schema
- Idempotent import for all 10,349 source questions, including BOM-safe JSON parsing
- Normalized subject, school stage, grade, difficulty, and question-family filters
- Extensible topic, skill, and format tags with provenance and confidence
- KaTeX rendering for the 4,481 questions containing LaTeX-like notation
- Server-side answer checking, guest learner profiles, XP, daily streaks, activity, and badges
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
npm run data:audit     # profile all source JSON files
npm run schema:check   # ensure SQLite/PostgreSQL models still match
npm run db:studio      # inspect the local database
npm run test           # normalization unit tests
npm run typecheck
npm run lint
npm run build
```

## PostgreSQL production deployment

Production has its own schema and migration history under `prisma/postgresql/`. In CI or the deployment build:

```bash
export DATABASE_URL='postgresql://USER:PASSWORD@HOST:5432/eduloop?schema=public'
npm ci
npm run db:generate:postgres
npm run db:deploy:postgres
npm run build
```

Run `npm run db:seed` once if the production database should include the bundled question set. The SQLite and PostgreSQL Prisma models intentionally match; when the data model changes, update both schema files and generate a migration in each migration directory. This keeps local setup simple without pretending SQLite migrations are safe to apply to PostgreSQL.

## Adding question content

Place another `.json` file with the same source contract in `data/`, then run `npm run data:audit` and `npm run db:seed`. Stable source IDs prevent duplicates. The normalization boundary is [content.ts](./src/lib/content.ts): add aliases there when a new provider uses different subject, grade, difficulty, or type labels.

For curated taxonomy, add or update `Tag` and `QuestionTag` rows through Prisma. Curated tags should use `source = "CURATED"` and confidence `1`; the importer currently produces deterministic `RULE` and `IMPORT` tags. A future admin workflow can manage these rows without changing the question table.

## Important product boundaries

- Only answer keys that can be parsed with high confidence are auto-graded. Written and ambiguous answers reveal the reference answer for student self-assessment.
- Compound, incomplete-choice, missing-stem, and explicitly figure-dependent records are marked `NEEDS_REVIEW` and excluded from practice. The current bundle has 54 such records.
- The source bundle contains no image assets or explicit curriculum knowledge-point labels. Topic tags are useful discovery hints, not authoritative curriculum classification.
- Guest identity currently lives in local browser storage. Authentication and cross-device sync are deliberately left behind a clean `LearnerProfile` boundary.

See [data audit](./docs/data-audit.md), [product design](./docs/product-design.md), and [architecture](./docs/architecture.md) for the decisions behind the scaffold.
