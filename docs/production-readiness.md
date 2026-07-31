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
| Learning-loop health is measurable | idempotent explanation views and fresh-operator-auth aggregate `/api/studio/metrics` session, return, and repeat-practice signals |
| Progress survives navigation | persisted profiles, sessions, attempts, activity, saved questions |
| Learners control account and learning data | `/privacy`, recent-auth versioned secret-minimized account export, recent-auth learning-only cascade deletion with a confirmation notice, and concurrency-safe full account erasure with a final notice |
| Public account consent is explicit | public versioned `/terms` and `/privacy-policy`, adult/guardian attestation, append-only `ConsentRecord`, and re-consent gating |
| Account sessions are revocable | recent-auth self-service all-device sign-out, an optimistic database-checked `sessionVersion` rotation, adapter-session deletion, a security notice, and SQLite/PostgreSQL/browser coverage |
| Linked login methods are minimized and removable safely | provider identities stored without OAuth/OIDC bearer credentials, legacy-token purge migration, recent-auth and session-version-bound linking/disconnection, verified-password-aware final-method protection, concurrency-safe ownership transitions, all-session revocation, and SQLite/PostgreSQL/browser coverage |
| Login email changes prove ownership | current-password or recent-social proof, hashed single-use new-address verification, atomic uniqueness enforcement, old-address notice, and all-session revocation |
| Password email ownership is proven | assurance restricted to exact matching verified Google claims or password-bound mailbox links, unsolicited-link pre-hijack protection, atomic untrusted-provider removal, conservative legacy re-verification, generic resend responses, hashed 24-hour fragment tokens, and verified-login enforcement across SQLite/PostgreSQL/browser coverage |
| Password credentials rotate safely | generic reset requests, hashed expiring tokens, optimistic authenticated changes, atomic mailbox-ownership transfer for unverified social accounts, trusted-provider preservation for verified accounts, stale-proof cleanup, security notices, and all-session revocation |
| Expired security data is minimized | indexed transactional cleanup for adapter sessions, verification and recovery proofs, and hashed limiter buckets through both live-traffic cadence and an operator command, with SQLite/PostgreSQL coverage |
| Abandoned registrations do not reserve mailboxes indefinitely | explicit 30-day expiry, proof deadlines capped at that marker, relation-safe bounded deletion, same-request email reuse, legacy deployment grace, and SQLite/PostgreSQL coverage |
| Sensitive actions require fresh proof | persistent `authenticatedAt` claim with a 10-minute reauthentication window for complete export, learning-data erasure, all-device sign-out, sensitive account changes, privileged answer-key access, learning metrics, and content-review mutations |
| Concurrent session restarts stay coherent | nullable unique `PracticeSession.activeKey` plus integration coverage on SQLite and PostgreSQL |
| Content problems can be surfaced | `QuestionReport` and in-practice feedback form |
| Content reports can be triaged safely | role- and recent-auth-protected `/studio`, immediate quarantine, immutable `ContentReviewAction` history, and SQLite/PostgreSQL/browser coverage |
| Both databases stay portable | paired schemas and migration stages enforced by `npm run schema:check` |
| Failures are diagnosable | schema-aware `/api/health`, privacy-safe request completion/error telemetry, error boundaries |
| A live release is externally verifiable | cookie-free `npm run smoke:deployment` checks security headers, readiness, answer isolation, and stateless guest grading |
| Browser resource loading is constrained | tested CSP, HSTS, framing, MIME, referrer, permission, and cross-origin response headers |
| Proxy-derived security decisions are bounded | `AUTH_URL`-anchored mutation origins plus trusted-hop client address selection and validation |
| Untrusted mutation payloads are bounded | shared streaming 32 KiB JSON cap with declared-length and chunked-body coverage |
| Supply and build are repeatable | lockfile, exact Node/npm toolchain, exact dependency-script policy, SHA-pinned Actions, digest-pinned images, Dependabot, standalone Dockerfile |

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

Before production traffic, also verify the PostgreSQL migration on a disposable database, run `npm run smoke:deployment -- https://your-production-origin.example`, inspect desktop/mobile screenshots, restore the latest backup into a disposable database, and confirm any ingress-level defense-in-depth limit. The deployment smoke command uses no cookies, creates no learner or attempt, and checks public-practice security headers, schema-aware readiness, public catalog shape, pre-answer isolation, and guest grading. It does create the short-lived hashed rate-limit buckets used by those public requests.

## Content Launch Boundary

Only `PUBLISHED` questions and `APPROVED` assets are served. All 16,537 bundled questions have passed the repository's content-repair checks and are available; the eight repaired CJEval records now have pinned, provenance-labeled editorial repairs. All 12 generated diagrams are approved and available, and new uncertain imports still default to quarantine. `npm run data:verify` checks the generic source contract, non-AMC question/answer/solution integrity, pinned AGIEval provenance and deduplication, AMC archive integrity, Simplified Chinese math/figure parity, and a catalog-wide KaTeX parse audit with non-increasing warning budgets. Inferred topic tags support discovery but must not be advertised as formal curriculum mastery.
