# Contributing to EduLoop

Thanks for helping. This guide covers the workflow every change follows, plus the two kinds of change that need extra steps: content repairs and new subjects or languages. Coding conventions are in [AGENTS.md](AGENTS.md); the reasoning behind the main design choices is in [docs/adr/](docs/adr/).

## Workflow

1. Branch from `main`. Keep each pull request to one concern.
2. Use [Conventional Commits](https://www.conventionalcommits.org/): `feat:`, `fix:`, `perf:`, `refactor:`, `docs:`, `test:`, `build:`, `ci:`, `chore:`. Reference the issue (`Closes #123`).
3. Add an entry under `## [Unreleased]` in [CHANGELOG.md](CHANGELOG.md) for anything a learner, operator, or contributor would notice.
4. Before opening the pull request, run:

   | Always | When relevant |
   | --- | --- |
   | `npm test` | `npm run test:integration` for API, service, or database changes |
   | `npm run typecheck` | `npm run test:e2e` for user-facing changes |
   | `npm run lint` | `npm run schema:check` for Prisma changes |
   | `npm run build` | `npm run data:verify`, `npm run seed:verify`, `npm run docs:check` for content changes |

5. In the pull request, explain the intent, list the commands you ran, include screenshots for UI changes, and call out schema, migration, import, or source-data effects.

## Code changes

- Route handlers parse input, authenticate, rate limit, and map results to HTTP. Put business rules in `src/lib/` services and shared request/response types in `src/lib/contracts/` ([ADR 0006](docs/adr/0006-routes-services-contracts.md)).
- Use constants from `src/lib/domain-constants.ts` for persisted statuses, roles, and actions; lint rejects the raw strings.
- Put learner-facing text in both catalogs under `src/i18n/messages/` and render it with `t()`; lint rejects Chinese literals in components and pages ([Internationalization](docs/i18n.md)).
- Put unit tests next to the module (`*.test.ts`). Integration tests live in `src/integration/` and use the helpers in `src/integration/fixtures.ts`.

### Database changes

Update both `prisma/schema.prisma` and `prisma/postgresql/schema.prisma`, add a migration with the same name to `prisma/migrations/` and `prisma/postgresql/migrations/`, and set `REQUIRED_DATABASE_MIGRATION` in `src/lib/database-migration.ts` to the new migration. `npm run schema:check` enforces all three ([ADR 0001](docs/adr/0001-dual-prisma-schemas.md)). Run the integration suite against both SQLite and PostgreSQL.

## Content repairs

Question text is source material: never edit imported rows directly in the database.

| Situation | Fix |
| --- | --- |
| A live question is wrong and learners are affected now | Quarantine it from the report in `/studio`, then publish a reviewed revision from the studio editor. Answer-key changes re-grade past attempts ([operations](docs/operations.md#editing-questions-in-the-studio)). |
| A source record has a deterministic defect (OCR, punctuation, broken options) | Fix the source JSON or add a pinned repair to the source pipeline, then add a `data:verify` gate that would have caught it. |
| A record needs a reviewed correction that the source cannot express | Add a curation entry in `src/lib/content-curation.ts`, which the importer applies on every run. |
| A question should be removed or replaced | Remove it from the source; the next import deletes it with its learner history ([ADR 0010](docs/adr/0010-delete-removed-questions.md)). Add a replacement as a new record with a new ID. |
| A figure is missing | Add a reviewed SVG under `public/question-assets/generated/zh-CN/<question-id>/` and register it in `src/lib/question-replacements.ts`. |

After any content change, run `npm run data:verify`, `npm run seed:verify` (with `-- --update` when counts change intentionally), and `npm run docs:check -- --write`, and commit the updated `docs/catalog-stats.json`.

## Adding a subject

1. Add the subject name to the `Subject` enum in `data/schema.json` and to `QUESTION_SUBJECTS` in `scripts/validate-json-schemas.mjs`.
2. Add its slug, icon, color, description, and sort order to `SUBJECTS` in `src/lib/content.ts`, plus any topic rules and source aliases.
3. Add the archive to `data/zh-CN/` and `data/catalog.json`, with a source-specific audit in `data:verify` if the provider has known defects.
4. Seed, verify, and update the catalog stats as described above.

## Adding a language

There are two separate layers:

- **Interface language.** Add the locale to `LOCALES` and `LOCALE_LABELS` in `src/i18n/config.ts`, create `src/i18n/messages/<locale>.ts` typed as `Messages`, and register it in `src/i18n/messages/index.ts`. The type checker lists every missing key, and `src/i18n/i18n.test.ts` checks placeholders.
- **Content language.** Put translated archives under `data/<locale>/` with the same filenames and IDs, and declare them in `data/catalog.json`. Only the default locale is imported today; serving another content locale is tracked as follow-up work in [Internationalization](docs/i18n.md).

## Documentation

- Keep the README to one screen; put details in `docs/`.
- Write catalog numbers with stat markers, for example `<!-- stat:seed.published -->16,022<!-- /stat -->`, so `npm run docs:check` can keep them current.
- Record a significant design decision as a new ADR in `docs/adr/`.
