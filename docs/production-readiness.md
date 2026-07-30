# Production Readiness

## Launch Scope

EduLoop's production baseline is a guest-first student practice service with optional email/password accounts for cross-device continuity. It includes filtered and adaptive practice, ten-question sessions, self-assessed written work, XP and streaks, saved questions, spaced mistake review, progress views, and question reporting. It deliberately excludes public profiles and social ranking.

School-managed accounts are a separate launch mode. Before using accounts with school rosters, add an approved identity provider or verified-email recovery, teacher/guardian roles, consent records, and jurisdiction-specific retention rules.

## Acceptance Evidence

| Requirement | Repository evidence |
| --- | --- |
| Content is importable and traceable | Stable source IDs, `sourceFile`, `npm run data:verify`, quarantine status |
| Answers are not leaked | `/api/questions/next` omits keys; `/api/attempts` grades server-side |
| Learning continues after a mistake | `ReviewItem` scheduling, `/review`, adaptive due selection |
| Learning-loop health is measurable | idempotent explanation views and aggregate `/api/studio/metrics` session, return, and repeat-practice signals |
| Progress survives navigation | persisted profiles, sessions, attempts, activity, saved questions |
| Learners control learning data | `/privacy`, export, and `DELETE /api/learner` cascade deletion |
| Account sessions are revocable | hashed `AuthSession` rows and an HttpOnly logout flow |
| Content problems can be surfaced | `QuestionReport` and in-practice feedback form |
| Content reports can be triaged safely | role-protected `/studio`, immediate quarantine, immutable `ContentReviewAction` history |
| Both databases stay portable | paired schemas and migration stages enforced by `npm run schema:check` |
| Failures are diagnosable | `/api/health`, structured request errors, error boundaries |
| Browser resource loading is constrained | tested CSP, HSTS, framing, MIME, referrer, permission, and cross-origin response headers |
| Supply and build are repeatable | lockfile, CI workflow, standalone Dockerfile |

## Release Gates

Every release must pass:

```bash
npm ci
npm audit --omit=dev --audit-level=high
npm run db:generate
npm run env:check
npm test
npm run test:integration
npm run typecheck
npm run lint
npm run schema:check
npm run data:verify
npm run seed:verify
npm run build
```

Before production traffic, also verify the PostgreSQL migration on a disposable database, run the API smoke journey, inspect desktop/mobile screenshots, confirm security headers and `/api/health`, restore the latest backup into a disposable database, and confirm the ingress-level rate limit.

## Content Launch Boundary

Only `PUBLISHED` questions and `APPROVED` assets are served. All 13,811 bundled questions and 12 generated diagrams have passed the repository's content-repair checks and are available; new uncertain imports still default to quarantine. `npm run data:verify` checks the generic source contract, non-AMC question/answer/solution integrity, AMC archive integrity, and Simplified Chinese math/figure parity. Inferred topic tags support discovery but must not be advertised as formal curriculum mastery.
