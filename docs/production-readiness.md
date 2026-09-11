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
| Learners control account and learning data | `/privacy`, recent-auth versioned secret-minimized account export covering every semantic learner field, session-version-bound learning-only cascade deletion with a confirmation notice, authenticated-version-bound full account erasure with a final notice, and database-enforced removal of reporter identity/free text while deidentified moderation state remains actionable |
| Public account consent is explicit | public versioned `/terms` and `/privacy-policy`, adult/guardian attestation, append-only `ConsentRecord`, and re-consent gating |
| Account sessions are revocable | recent-auth self-service all-device sign-out, an optimistic database-checked `sessionVersion` rotation, adapter-session and pending-proof deletion, a security notice, and SQLite/PostgreSQL/browser coverage |
| Linked login methods are minimized and removable safely | provider identities stored without OAuth/OIDC bearer credentials, legacy-token purge migration, no same-email auto-relinking, recent-auth and session-version-bound linking/disconnection, connection-and-version-bound provider login, verified-password-aware final-method protection, concurrency-safe ownership transitions, all-session revocation, recoverable provider discovery/initiation/callback failures, and SQLite/PostgreSQL/browser coverage |
| Login email changes prove ownership | current-password or recent-social proof, session-version-bound issuance, delivery-aware replacement that preserves the last accepted proof, hashed single-use new-address verification, atomic uniqueness enforcement, old-address notice, all-session revocation, and SQLite/PostgreSQL coverage |
| Password email ownership is proven | assurance restricted to exact matching verified Google claims or password-bound mailbox links, unsolicited-link pre-hijack protection, atomic untrusted-provider removal, conservative legacy re-verification, generic resend responses, delivery-aware newest-issued winner selection, hashed 24-hour fragment tokens, and verified-login enforcement across SQLite/PostgreSQL/browser coverage |
| Password credentials rotate safely | generic reset requests, delivery-aware hashed expiring tokens that survive failed replacements, authenticated-session-version-bound changes, hash-and-version-bound login proofs and bcrypt upgrades, atomic mailbox-ownership transfer for unverified social accounts, trusted-provider preservation for verified accounts, stale-proof cleanup, security notices, all-session revocation, and SQLite/PostgreSQL race coverage |
| Expired security data is minimized | indexed transactional cleanup for adapter sessions, verification and recovery proofs, and keyed limiter pseudonym buckets through both live-traffic cadence and an operator command, with SQLite/PostgreSQL coverage |
| Abandoned registrations do not reserve mailboxes indefinitely | explicit 30-day expiry, proof deadlines capped at that marker, relation-safe bounded deletion, same-request email reuse, legacy deployment grace, and SQLite/PostgreSQL coverage |
| Online authentication abuse is bounded across replicas | shared window-scoped HMAC-SHA-256 pseudonym buckets keyed by `AUTH_SECRET`, trusted-hop address selection, independent source and email/proof limits for anonymous authentication, and address-independent account limits after sign-in |
| Session and limiter cryptography reject copied placeholders | production requires a generated `AUTH_SECRET` with bounded length and diversity, rejects common fixture/placeholder forms at startup and runtime, and fails authentication, pseudonymization, and readiness closed if validation is bypassed |
| Sensitive actions require fresh proof | persistent `authenticatedAt` claim with a 10-minute reauthentication window for complete export, learning-data erasure, all-device sign-out, sensitive account changes, privileged answer-key access, learning metrics, and content-review mutations; every high-impact mutation also claims the exact authenticated session version inside its transaction |
| Concurrent session restarts stay coherent | nullable unique `PracticeSession.activeKey` plus integration coverage on SQLite and PostgreSQL |
| Content problems can be surfaced | `QuestionReport` and in-practice feedback form |
| Content reports can be triaged safely | role- and recent-auth-protected `/studio`, transactional session-version, operator-role, and report-state claims shared with the trusted CLI, import-resistant quarantine provenance, final-open-report restoration to audited import status, erasure-resistant anonymous `ContentReviewAction` history, and SQLite/PostgreSQL/browser coverage |
| Both databases stay portable | paired schemas and migration stages enforced by `npm run schema:check` |
| Production database transport is protected | startup rejects malformed PostgreSQL URLs, non-loopback connections without a required TLS mode, and certificate-validation bypasses |
| Database overload is bounded | startup requires an explicit per-replica connection limit plus nonzero pool-acquisition and connection timeouts; pool exhaustion and database-unavailable errors return privacy-safe HTTP 503 responses |
| Runtime release identity is trustworthy | production startup rejects missing, placeholder, or unsafe `APP_VERSION` values, startup telemetry emits only a bounded identifier, and readiness fails closed if the wrapper is bypassed without one |
| Dependency outages do not trigger restart storms | dependency-free `/api/live` process liveness is separate from release-, database-, migration-, and catalog-aware `/api/health` traffic readiness; the image health check uses liveness |
| Failures are diagnosable | schema-aware `/api/health`, privacy-safe request, Auth.js, and operational-command completion/error telemetry, cleanup dead-man monitoring, typed and guarded post-response task failures, error boundaries |
| A live release is externally verifiable | cookie-free `npm run smoke:deployment` checks security headers, process liveness, readiness, matching release identity, answer isolation, and stateless guest grading |
| Deployed guest capacity is measurably bounded | confirmed `npm run probe:capacity` pins the exact release, runs rate-limit-aware non-persistent guest journeys, and enforces explicit error, p95 latency, and worker-saturation budgets with aggregate-only telemetry |
| Production email is explicitly probed | confirmed `npm run smoke:email` reuses the account-email transport while emitting only a random correlation ID and bounded acceptance telemetry |
| Deployed social-provider initiation is verifiable | confirmed `npm run smoke:oauth` requires the complete deployed OAuth/OIDC set to match expectations and pins every provider to its exact authorization host and callback while keeping cookies, state, client IDs, and full URLs out of telemetry |
| A restored database is repeatably inspectable | isolated-target guard plus read-only `npm run restore:verify` checks migration completion, durable-table access, catalog presence, and privacy-safe aggregate counts |
| External launch approval fails closed | confirmed `npm run launch:verify` requires release-, origin-, legal-, and provider-bound private evidence for every gate and rejects missing, failed, future, expired, stale, duplicate, or mismatched records without logging their contents |
| Browser resource loading is constrained | tested CSP, HSTS, framing, MIME, referrer, permission, and cross-origin response headers |
| Proxy-derived security decisions are bounded | `AUTH_URL`-anchored mutation origins plus trusted-hop client address selection and validation |
| Untrusted mutation payloads are bounded | shared streaming 32 KiB JSON cap with declared-length and chunked-body coverage |
| Supply and build are repeatable | lockfile, exact Node/npm toolchain, exact dependency-script policy, SHA-pinned Actions, digest-pinned images, Dependabot, standalone Dockerfile |

## Release Gates

Every release must pass:

```bash
npm ci
npm run dependencies:activate
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

Before production traffic, also verify the PostgreSQL migration on a disposable database, run `npm run smoke:deployment -- https://your-production-origin.example`, inspect desktop/mobile screenshots, and run a forecast-based distributed `npm run probe:capacity` exercise with the exact release and production-like infrastructure. Require the declared aggregate error/latency budgets, no worker saturation, and healthy application, replica, pool, and PostgreSQL telemetry. Run `npm run smoke:oauth` for every enabled provider, and complete provider sign-in, callback, consent, explicit linking, disconnection, and re-login journeys with dedicated test identities. Run `npm run smoke:email`, confirm the matching delivered event plus SPF/DKIM/DMARC alignment, and complete verification and recovery through a dedicated deployed test account. Restore the latest backup into an isolated database, run `npm run restore:verify`, compare its aggregate counts with evidence for the selected recovery point, exercise the restored release's `/api/health`, and confirm any ingress-level defense-in-depth limit. Exercise monitoring alerts, confirm the hourly cleanup plus its dead-man alert, review rollback compatibility, and obtain counsel approval for the active legal versions and production legal configuration. A single capacity-probe worker is not system-capacity evidence; OAuth initiation does not prove callback exchange, identity claims, or persisted account behavior; email-probe HTTP acceptance is not delivery evidence; and the restore command does not substitute for a real provider restore or application health evidence. The deployment smoke command uses no cookies, creates no learner or attempt, and checks public-practice security headers, schema-aware readiness, public catalog shape, pre-answer isolation, and guest grading. The smoke and capacity commands create only the short-lived keyed rate-limit pseudonym buckets used by their public requests.

After reviewing those private records, run `npm run launch:verify -- /secure/launch-evidence.json` with the exact expected release, production origin, and enabled OAuth-provider set. This final fail-closed check requires every external gate to be present, current, `PASS`, and scoped to the same release; it does not inspect or prove the referenced tickets or external systems. The manifest contract and freshness limits are defined in the operations runbook.

## Content Launch Boundary

Only `PUBLISHED` questions and `APPROVED` assets are served. Of the 16,537 bundled questions, 16,536 have passed the repository's content-repair checks and are available. The sole irrecoverable record, whose complete source stem is `略`, retains its stable ID with `NEEDS_REVIEW` status and is not served. The deterministic repair layer includes 226 subject-record repairs, 30 CJEval repairs, and 10 AGIEval source-row repairs; imported repairs are pinned and labeled in provenance. All 12 generated diagrams are approved and available, and new uncertain imports still default to quarantine. `npm run data:verify` checks the generic source contract, non-AMC question/answer/solution integrity, pinned AGIEval provenance and deduplication, AMC archive integrity, Simplified Chinese math/figure parity, and a catalog-wide KaTeX parse audit with non-increasing warning budgets. Inferred topic tags support discovery but must not be advertised as formal curriculum mastery.
