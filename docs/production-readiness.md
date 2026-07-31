# Production Readiness

## Launch Scope

EduLoop's production baseline provides stateless guest practice plus Auth.js password or social accounts for every persistent and cross-device function. New password accounts require email verification and include email-delivered, single-use recovery that revokes old sessions. Signed-in learners receive filtered and adaptive practice, durable ten-question sessions, self-assessed written work, XP and streaks, saved questions, spaced mistake review, progress views, and question reporting. It deliberately excludes public profiles and social ranking.

School-managed accounts are a separate launch mode. The public account path records an adult learner or parent/legal-guardian attestation but does not independently verify guardianship. Before using school rosters or allowing minors to operate accounts, add an approved institutional identity provider, verified guardian/institutional consent, teacher/guardian roles, and jurisdiction-specific retention rules.

## Acceptance Evidence

| Requirement | Repository evidence |
| --- | --- |
| Content is importable and traceable | Stable source IDs, `sourceFile`, `npm run data:verify`, quarantine status |
| Answers are not leaked | `/api/questions/next` omits keys; `/api/attempts` grades server-side |
| Learning continues after a mistake | `ReviewItem` scheduling, `/review`, adaptive due selection |
| Learning-loop health is measurable | idempotent explanation views and aggregate `/api/studio/metrics` session, return, and repeat-practice signals |
| Progress survives navigation | persisted profiles, sessions, attempts, activity, saved questions |
| Learners control learning data | `/privacy`, export, and `DELETE /api/learner` cascade deletion |
| Public account consent is explicit | public versioned `/terms` and `/privacy-policy`, adult/guardian attestation, append-only `ConsentRecord`, and re-consent gating |
| Account sessions are revocable | encrypted Auth.js cookies plus database-checked `sessionVersion` and an HttpOnly logout flow |
| Password email ownership is proven | generic resend responses, hashed 24-hour tokens, fragment-based links, and verified-login enforcement |
| Password accounts are recoverable | generic reset requests, hashed expiring tokens, Resend delivery, and all-session revocation |
| Sensitive account actions require fresh proof | persistent `authenticatedAt` claim with a 10-minute reauthentication window |
| Concurrent session restarts stay coherent | nullable unique `PracticeSession.activeKey` plus integration coverage on SQLite and PostgreSQL |
| Content problems can be surfaced | `QuestionReport` and in-practice feedback form |
| Content reports can be triaged safely | role-protected `/studio`, immediate quarantine, immutable `ContentReviewAction` history |
| Both databases stay portable | paired schemas and migration stages enforced by `npm run schema:check` |
| Failures are diagnosable | schema-aware `/api/health`, structured request errors, error boundaries |
| Browser resource loading is constrained | tested CSP, HSTS, framing, MIME, referrer, permission, and cross-origin response headers |
| Proxy-derived security decisions are bounded | `AUTH_URL`-anchored mutation origins plus trusted-hop client address selection and validation |
| Untrusted mutation payloads are bounded | shared streaming 32 KiB JSON cap with declared-length and chunked-body coverage |
| Supply and build are repeatable | lockfile, exact Node/npm toolchain, SHA-pinned Actions, digest-pinned images, Dependabot, standalone Dockerfile |

## Release Gates

Every release must pass:

```bash
npm ci
npm audit --omit=dev --audit-level=high
npm run db:generate
npm run env:check
npm run supply:check
npm test
npm run test:integration
npm run test:e2e
npm run typecheck
npm run lint
npm run schema:check
npm run data:verify
npm run seed:verify
npm run build
```

Before production traffic, also verify the PostgreSQL migration on a disposable database, run the API smoke journey, inspect desktop/mobile screenshots, confirm security headers and schema-aware `/api/health`, restore the latest backup into a disposable database, and confirm any ingress-level defense-in-depth limit.

## Content Launch Boundary

Only `PUBLISHED` questions and `APPROVED` assets are served. All 16,537 bundled questions have passed the repository's content-repair checks and are available; the seven formerly quarantined CJEval records now have pinned, provenance-labeled editorial repairs. All 12 generated diagrams are approved and available, and new uncertain imports still default to quarantine. `npm run data:verify` checks the generic source contract, non-AMC question/answer/solution integrity, pinned AGIEval provenance and deduplication, AMC archive integrity, Simplified Chinese math/figure parity, and a catalog-wide KaTeX parse audit with non-increasing warning budgets. Inferred topic tags support discovery but must not be advertised as formal curriculum mastery.
