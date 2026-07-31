# Operations Runbook

## Deploy

Provision PostgreSQL with TLS, automated backups, and a restricted application role. Keep `DATABASE_URL`, `AUTH_SECRET`, `RESEND_API_KEY`, and social-provider credentials in the deployment secret store. Set `AUTH_URL` to the public HTTPS origin and `AUTH_EMAIL_FROM` to a verified Resend sender. Configure `LEGAL_ENTITY_NAME`, `LEGAL_CONTACT_EMAIL`, and `LEGAL_JURISDICTION` with counsel-approved production values; placeholders fail the organizational launch review even if syntactically valid.

```bash
npm ci
npm run env:check
npm run db:generate:postgres
npm run db:deploy:postgres
npm run db:seed       # first release or content update only
npm run build
```

Run migrations as a single pre-deploy job, not from every application replica. The included Dockerfile builds a standalone server; set `DATABASE_URL`, `EDULOOP_DATABASE_PROVIDER=postgresql`, `APP_VERSION`, and `PORT` at runtime. Container startup validates these values before launching Next.js. Terminate HTTPS at the trusted ingress.

The provider-credential minimization migration rewrites only `Account` rows that contain legacy OAuth/OIDC response credentials, setting those fields to `NULL` while preserving each provider identity and login connection. It does not sign users out or require them to reconnect a provider.

After the new replicas become ready but before opening production traffic, run the cookie-free deployment smoke journey from outside the ingress:

```bash
npm run smoke:deployment -- https://learn.example
```

It fails unless the public practice page's security headers, database migration and catalog readiness, public catalog, answer isolation, and stateless guest-grading contract all hold. HTTP is accepted only for loopback testing. The smoke request writes no learner or attempt data; the shared limiter still creates its normal short-lived hashed buckets.

Keep the application port private to the ingress. Configure the ingress to replace the public host/protocol headers and append the connecting address to `X-Forwarded-For`. The container defaults `TRUSTED_PROXY_HOPS` to `1`; set it to the exact number of trusted hops between the browser and application (for example, `2` for a CDN plus ingress). EduLoop selects the address immediately before those trusted hops, so an untrusted prefix supplied by a client cannot create fresh rate-limit identities. Anonymous authentication applies that address ceiling before a separate email or proof-token ceiling, while authenticated actions remain bounded by account even if the client address changes. `AUTH_URL`, not forwarded headers, is the authority for custom mutation-route origin checks.

Custom application JSON mutations reject bodies larger than 32 KiB while streaming and return HTTP 413 even when a client omits or falsifies `Content-Length`. Configure a compatible ingress request-body ceiling as earlier defense in depth, while preserving Auth.js provider callbacks and normal form posts.

The Auth.js/account-only migrations intentionally sign old sessions out and erase historical anonymous learner rows. The active-session migration abandons all but the newest active session per learner before adding the unique active slot. Deploy this release as a drained or maintenance-window cutover: an older replica does not populate `activeKey` and must not keep writing after the migration. Record the pre-migration anonymous-profile and duplicate-active-session counts, take a backup, apply migrations, replace every replica, and then verify no duplicate active sessions remain.

The Docker runtime, PostgreSQL CI service, and GitHub Actions are pinned to immutable digests or commit SHAs. `.node-version` and `packageManager` align CI with the container toolchain. Dependency lifecycle scripts are denied unless their exact package version has an `allowScripts` decision; `.npmrc` makes a newly introduced script fail `npm ci`. Dependabot proposes weekly npm, Actions, and Docker updates. Review upstream release notes and any changed install script before refreshing its exact allowlist entry, then require the full CI suite before merging.

Production responses set HSTS, same-origin opener/resource isolation, and a resource-complete CSP. Next.js hydration currently requires inline scripts and the UI uses inline style values, so `script-src` and `style-src` allow inline content; `unsafe-eval` and WebSocket connections are development-only. Recheck the built application before tightening these remaining framework allowances.

## Observe

Use `GET /api/health` for readiness and container health. A ready response proves database connectivity, the migration required by this application release, and a populated catalog; `outdated`, `initializing`, and `unavailable` responses return HTTP 503. If migrations run under a separate database owner, grant the restricted application role `SELECT` on `_prisma_migrations` so it can perform this check without migration privileges. Forward JSON stdout/stderr to the platform log service. Production custom API responses emit one `api_request_completed` record containing only route template, method, status, duration, and request ID; thrown failures also emit `api_request_failed`. Alert on readiness failures, 5xx completion records, `POST /api/attempts` duration, and PostgreSQL connection saturation. Never log request bodies, answers, account identifiers, or report details.

Authorized content operators can view 28-day aggregate learning-loop health in `/studio` after authenticating within the previous 10 minutes. The endpoint returns no learner identifiers or responses. Session totals use database-side aggregates. “Seven-day return” compares distinct learners in adjacent seven-day windows and caps each cohort at 50,000; repeat-topic change is capped at the latest 20,000 graded observations. Both declare when sampling is active. Move long-term or high-volume analytics to a privacy-reviewed warehouse rather than removing these bounds.

Application limits use hashed fixed-window buckets in PostgreSQL and are shared by every replica. The trusted ingress can additionally enforce network-wide limits as defense in depth. Current application policies include:

- attempts: 45 per account or guest address per minute;
- public catalog: 180 per IP per minute, with one-minute browser and five-minute shared-cache freshness;
- question selection: 120 per IP per minute;
- learner summary: 120 per account per minute; profile and review reads: 60 per account per minute; progress aggregation: 30 per account per minute;
- reports: 6 per account per 10 minutes.
- account-data exports: 3 per account per hour.
- learning-data and full-account deletions: 3 per account per hour.
- login: 10 attempts per email and 50 per address per 15 minutes;
- registration: 5 attempts per email and 20 per address per 15 minutes.
- consent acceptance: 5 attempts per account per 15 minutes.
- email verification requests: 3 per email and 20 per address per hour; verification attempts: 8 per token and 40 per address per 15 minutes.
- login-email change requests: 3 per account per hour; confirmation attempts: 8 per token and 40 per address per 15 minutes.
- social-provider disconnections: 5 per account per hour.
- all-device session revocations: 5 per account per hour.
- password reset requests: 3 per email and 20 per address per hour; reset attempts: 8 per token and 40 per address per 15 minutes.
- studio review: 180 reads and 60 transitions per operator per 10 minutes.
- studio metrics: 60 aggregate reads per operator per 10 minutes.

Run expired security-artifact cleanup from a trusted scheduler at least hourly, using the same production `DATABASE_URL` and generated PostgreSQL Prisma client:

```bash
npm run data:cleanup
```

The command atomically removes records at or past their expiry from Auth.js adapter sessions and verification tokens, hashed email-verification, email-change, and password-reset proofs, and hashed rate-limit buckets. It also removes at most 100 expired unused password registrations per run. That account deletion is restricted to `LEARNER` records with no provider, live session or proof, operator history, non-default learner state, or learning/report relation; empty learner preferences and registration consent cascade with the account. It emits a timestamp and per-category counts without account identifiers. Expiry columns and the registration eligibility prefix are indexed by paired migrations. Normal application traffic invokes the same bounded cleanup every 250 rate-limit operations, but the scheduled command guarantees timely minimization for a low-traffic deployment. Run it repeatedly when `staleUnverifiedRegistrations` equals 100, alert on a nonzero command exit, and record only the aggregate counts; do not log or export deleted rows.

Auth.js session cookies are encrypted JWTs checked against `User.sessionVersion`. Complete account export, irreversible learning-data deletion, explicit all-device sign-out, and sensitive social-account actions require an `authenticatedAt` claim no older than 10 minutes; routine JWT refresh does not extend that window, and rejected stale requests do not consume the action's rate limit. Successful learning-data deletion sends a non-blocking confirmation notice while retaining the login account. The `/privacy` account-security panel gives a suspected-compromise user a self-service all-device sign-out: one optimistic version rotation invalidates every old JWT, removes adapter sessions, retains credentials and learning data, and sends a security notice. Password changes and recovery, first mailbox verification, verified login-email changes, and provider disconnection also increment the version, clear stale account-proof tokens, and sign every browser out; verified flows send a security notice when email delivery is available. First-password setup on an unverified Microsoft/Facebook account sends a fresh verification link and leaves Credentials disabled. The link recipient must re-enter that password; completion atomically removes the untrusted provider association, invalidates old sessions, and enables Credentials. Password recovery for any unverified social account likewise chooses a mailbox-controlled password and removes every provider association, while recovery for an already verified account preserves its providers. Only a matching verified Google claim, a password-bound EduLoop verification, a reset chosen by the mailbox owner, or a verified login-email change establishes assurance. An unverified password cannot justify removing the final social login method. Full account deletion checks the confirmed password and session-version snapshot in the cascading delete statement, so a concurrent credential change wins or deletion wins without a stale-confirmation or partial-data outcome; successful deletion sends a final notice. The Auth.js adapter stores only the stable provider identity needed for later login and discards OAuth/OIDC access, refresh, and ID tokens plus related response metadata; the provider-credential minimization migration nulls fields written by earlier releases. Provider disconnection deletes that identity record, but operators should still direct users to the provider's own security console when provider-side grant revocation is required. If a user cannot access the self-service control, an operator may increment that user's version after verified support escalation; a broad compromise requires incrementing all versions and rotating `AUTH_SECRET`. Secret rotation signs every browser out. Rotate OAuth client secrets in each provider console and the deployment secret store together.

`src/lib/legal.ts` pins the active terms and privacy versions. A version change deliberately sends every account through `/consent` again while preserving confirmed deletion access and recently reauthenticated data export or learning-data erasure. Publish and legally review the matching public pages before changing either constant; never rewrite an old `ConsentRecord`.

## Back Up and Restore

Take encrypted daily PostgreSQL backups with 30-day retention and point-in-time recovery when available. Quarterly, restore the latest backup into an isolated database, run `npm run db:deploy:postgres`, query catalog and attempt counts, and exercise `/api/health`. Record restore duration and result. Do not copy production learner data into developer laptops.

## Content Incidents

Learner reports enter `QuestionReport` as `OPEN`. Content operators use the role-protected `/studio` workspace to inspect the complete question context, quarantine unsafe content, and record a resolution. The API additionally requires a login no older than 10 minutes for every studio read and mutation, so an unattended 30-day operator session cannot expose answer keys or alter the catalog; the workspace prompts for reauthentication when that window closes. Each transition creates an immutable `ContentReviewAction`; the API never returns learner identity. Validate the original source and update normalization or curated records before resolving a genuine defect.

Public registration always creates `LEARNER` accounts. Grant or revoke studio access only from a trusted operator terminal connected to the intended database:

```bash
npm run users:role -- editor@example.com CONTENT_EDITOR
npm run users:role -- editor@example.com LEARNER
npm run users:role # list current content operators
```

The report CLI remains available for incident response when the web application is unavailable:

```bash
npm run reports:review -- list --status=OPEN --limit=25
npm run reports:review -- show REPORT_ID
npm run reports:review -- quarantine REPORT_ID
npm run reports:review -- resolve REPORT_ID --note="verified against source"
```

`quarantine` removes the reported question from practice but deliberately leaves the report open. Correct the source normalization or curated replacement, run the content checks, re-import, verify the question, and only then resolve the report. The CLI never prints learner or account identifiers.

Generated diagrams require subject review and `reviewStatus = APPROVED`; never bulk-approve them. Preserve stable question IDs so attempts and review history remain attached.

## Rollback

Application releases should be immutable and reversible. Roll back the application image first only when that image is compatible with the deployed schema. The Auth.js and account-only privacy migrations are destructive boundaries: they remove legacy sessions and anonymous learning data, and the pre-`activeKey` application must not be rolled back after the active-session migration. The email-assurance migration deliberately clears unverifiable legacy assurance timestamps and revokes affected sessions without deleting users, hashes, provider identities, or learning data. The following mailbox-ownership migration deletes only pending ordinary verification tokens for passwordless accounts; those users retain social access and password-reset recovery. Announce the one-time sign-in and re-verification requirement, verify email delivery before deployment, and keep the social-provider callbacks healthy so Microsoft/Facebook users retain access. Do not roll back to an application release that marks every OAuth/OIDC address verified or consumes verification links without password confirmation; restore the pre-deploy backup for a full rollback, or roll forward with this release. Future destructive changes should use expand/migrate/contract releases and a tested recovery step.
