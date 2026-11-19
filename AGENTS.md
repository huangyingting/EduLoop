# Repository Guidelines

## Project Structure & Module Organization

EduLoop is a Next.js App Router project. Pages and API routes live in `src/app/`; reusable UI is in `src/components/`; database, learner, and question-normalization logic belongs in `src/lib/`. Keep unit tests next to their modules as `*.test.ts` or `*.test.tsx`.

API route handlers only parse input, authenticate, rate limit, and map results to HTTP. Business rules live in services: practice grading, rewards, review scheduling, selection, sessions, and progress are in `src/lib/practice/`, and catalog import is in `src/lib/catalog-import.ts`. Request schemas and response types shared by routes and components live in `src/lib/contracts/`; components call APIs through `apiRequest` in `src/lib/api-client.ts`. Persisted status, role, and action values come from `src/lib/domain-constants.ts`, and ESLint rejects the raw literals elsewhere in `src/`. Display labels that the browser also needs live in `src/lib/question-labels.ts`. Learner-facing text lives in the message catalogs under `src/i18n/messages/` and is rendered with `t()` (see `docs/i18n.md`); ESLint rejects Chinese literals in components and pages outside the documented exemptions.

The default question catalog is in `data/zh-CN/`; translated source archives are grouped under their locale, such as `data/en/`. Import and audit utilities live in `prisma/seed.ts` and `scripts/`. SQLite uses `prisma/schema.prisma` and `prisma/migrations/`; production PostgreSQL uses `prisma/postgresql/`. Product, data, and architecture decisions are documented in `docs/`, with decision records in `docs/adr/`.

## Build, Test, and Development Commands

- `npm install` installs the locked dependencies.
- `npm run db:generate && npm run db:migrate && npm run db:seed` prepares a local SQLite database.
- `npm run dev` starts the development server at `http://localhost:3000`.
- `npm run build` creates a production build; `npm start` serves it.
- `npm test` runs Vitest once.
- `npm run lint` and `npm run typecheck` run ESLint and strict TypeScript checks.
- `npm run data:verify` audits source JSON; `npm run schema:check` verifies that both Prisma model definitions match.

## Coding Style & Naming Conventions

Use TypeScript, two-space indentation, semicolons, and double quotes, matching the existing code. Components and exported types use PascalCase; functions, variables, and hooks use camelCase; route and utility filenames use lowercase kebab-case. Prefer the `@/` alias for imports from `src/`. Keep server-only database access in API routes or server modules. Use Tailwind utilities and existing color tokens from `src/app/globals.css` before adding custom CSS.

## Testing Guidelines

Vitest discovers `src/**/*.test.ts`. Add focused tests for normalization rules, answer parsing, and other deterministic behavior. Every change should pass `npm test`, `npm run typecheck`, `npm run lint`, and `npm run build`. Database changes must also pass `npm run schema:check` and include migrations for both providers. Content changes must also pass `npm run data:verify`, `npm run seed:verify`, and `npm run docs:check`.

## Commit & Pull Request Guidelines

Use concise, imperative commits with Conventional Commit prefixes such as `feat:`, `fix:`, `perf:`, `refactor:`, `docs:`, or `test:`, and add notable changes to the Unreleased section of `CHANGELOG.md`. `CONTRIBUTING.md` has the full checklist, the content-repair workflow, and how to add a subject or language. Pull requests should explain intent, list verification commands, link relevant issues, and include screenshots for UI changes. Call out schema, migration, import, or source-data effects explicitly.

## Security & Configuration

Copy `.env.example` to `.env`; never commit credentials or local database files. Treat bundled question JSON as source material: preserve stable IDs and make transformations through `src/lib/content.ts` rather than editing imported records in the database.
