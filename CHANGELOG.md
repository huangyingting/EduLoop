# Changelog

All notable changes to EduLoop are recorded here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and commits use [Conventional Commits](https://www.conventionalcommits.org/) so entries can be collected from `git log` by type (`feat` → Added, `fix` → Fixed, `perf` → Performance, `refactor` → Changed).

## [Unreleased]

Work from the production-readiness improvement plan (#49).

### Added

- Public home page, SEO metadata (`robots.txt`, sitemap, Open Graph image), and guest sign-up prompts (#40).
- Question-specific progressive hints with an honest generic-strategy fallback; hints halve the first-try bonus and are tracked in the studio (#41).
- AMC contest mode with timed papers, official scoring, and per-topic results; question-bank browsing; per-question attempt history (#42).
- In-app question editing with revisions, a second-approver option for answer-key changes, re-grading of past attempts, hint curation, and image uploads (#43).
- Guardian-managed child learner profiles with a learner switcher, export, and erasure (phase 1 of #44).
- Opt-in due-review and weekly-summary emails with one-click unsubscribe; installable PWA with an offline page (#45).
- Prometheus metrics, webhook error alerts, slow-query logs, and signed question tickets for guest grading (#46).
- Data-driven badge rules, a stored learner time zone for streaks, and long-term review of mastered questions (#38).
- English interface with typed message catalogs, a language switcher, and localized API errors (#39).
- English AMC 8/10/12 practice: the original English archives are imported as translations, and practice, contests, hints, and explanations use them in the English interface (#39).
- Emails in the learner's language: request-triggered emails follow the interface language, and reminders use the language stored on the account (#39).
- Question images can be served from object storage: `QUESTION_ASSET_ORIGIN`, the `BUNDLE_QUESTION_ASSETS=false` Docker build argument, and `npm run assets:sync` for Azure Blob Storage (#48).
- Optional OpenTelemetry tracing (route, fetch, and Prisma spans over OTLP) with trace IDs in API logs and alerts (#46).
- `npm run learners:audit`, `npm run perf:check`, and `npm run docs:check`.
- Architecture decision records, a contributing guide, a development guide, and this changelog (#47).

### Changed

- Route handlers delegate to practice services; request and response contracts are shared with the client; persisted status values come from one module enforced by lint (#36).
- The practice player is a tested state machine with focused hooks and components (#37).
- Selection prefers unseen questions and targets difficulty to the learner's rating in adaptive mode (#42).
- Recommendation reasons and awarded badges are returned as structured data and worded by the client (#39).
- Catalog numbers in the docs are generated from `docs/catalog-stats.json` and checked in CI (#47).
- The content pipeline moved to `scripts/content/` with its own path-filtered CI workflow; `npm test` no longer runs pipeline tests (`npm run test:content` does) (#48).
- The API integration suite is split by domain into files under 700 lines that share `src/integration/api-shared.ts` (#48).

### Fixed

- Re-seeding no longer deletes learner history: removed questions are retired, and replaced IDs move history to their successors (#32).
- Temporary 503 responses keep the feature-specific error message (#36).
- Text colors meet WCAG AA contrast on every surface, and the logo link's accessible name includes its visible text; Lighthouse accessibility and SEO score 100 on `/`, `/practice`, and `/login` (#40).

### Performance

- Incremental, single-transaction catalog import that skips unchanged releases (#33).
- Fewer queries on practice hot paths, precomputed progress aggregates, and a release-keyed catalog cache (#34, #35).

### Security

- Next.js 16.4.6 and zod 4.6.7 patch a critical RCE advisory and a memory-exhaustion advisory.

## [0.1.0] - 2026-10-17

First deployable release, developed from 2026-07-26.

- Practice loop: ten-question rounds, server-side grading, self-assessed written answers, saved questions, spaced mistake review, adaptive practice, XP, streak shields, badges, and a growth dashboard.
- Catalog: six subject archives plus Chinese AMC 8/10/12 archives with deep, gated data-quality repairs (Waves 1-17), generated replacement diagrams, KaTeX rendering, and a calibrated difficulty audit.
- Accounts: Auth.js email/password with verified email, Google/Microsoft/Facebook sign-in with safe linking and disconnection, versioned adult/guardian consent, email change, password recovery, all-device sign-out, export, and full erasure.
- Content operations: question reports, a protected review studio with quarantine and an audit trail, and learning-loop health summaries.
- Operations: PostgreSQL production schema, readiness and liveness probes, HMAC-keyed shared rate limits, supply-chain pinning, restore verification, launch-evidence gates, and Webstack VM deployment.
