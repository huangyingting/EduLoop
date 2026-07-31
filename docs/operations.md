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

After the new replicas become ready but before opening production traffic, run the cookie-free deployment smoke journey from outside the ingress:

```bash
npm run smoke:deployment -- https://learn.example
```

It fails unless the public practice page's security headers, database migration and catalog readiness, public catalog, answer isolation, and stateless guest-grading contract all hold. HTTP is accepted only for loopback testing. The smoke request writes no learner or attempt data; the shared limiter still creates its normal short-lived hashed buckets.

Keep the application port private to the ingress. Configure the ingress to replace the public host/protocol headers and append the connecting address to `X-Forwarded-For`. The container defaults `TRUSTED_PROXY_HOPS` to `1`; set it to the exact number of trusted hops between the browser and application (for example, `2` for a CDN plus ingress). EduLoop selects the address immediately before those trusted hops, so an untrusted prefix supplied by a client cannot create fresh rate-limit identities. `AUTH_URL`, not forwarded headers, is the authority for custom mutation-route origin checks.

Custom application JSON mutations reject bodies larger than 32 KiB while streaming and return HTTP 413 even when a client omits or falsifies `Content-Length`. Configure a compatible ingress request-body ceiling as earlier defense in depth, while preserving Auth.js provider callbacks and normal form posts.

The Auth.js/account-only migrations intentionally sign old sessions out and erase historical anonymous learner rows. The active-session migration abandons all but the newest active session per learner before adding the unique active slot. Deploy this release as a drained or maintenance-window cutover: an older replica does not populate `activeKey` and must not keep writing after the migration. Record the pre-migration anonymous-profile and duplicate-active-session counts, take a backup, apply migrations, replace every replica, and then verify no duplicate active sessions remain.

The Docker runtime, PostgreSQL CI service, and GitHub Actions are pinned to immutable digests or commit SHAs. `.node-version` and `packageManager` align CI with the container toolchain. Dependency lifecycle scripts are denied unless their exact package version has an `allowScripts` decision; `.npmrc` makes a newly introduced script fail `npm ci`. Dependabot proposes weekly npm, Actions, and Docker updates. Review upstream release notes and any changed install script before refreshing its exact allowlist entry, then require the full CI suite before merging.

Production responses set HSTS, same-origin opener/resource isolation, and a resource-complete CSP. Next.js hydration currently requires inline scripts and the UI uses inline style values, so `script-src` and `style-src` allow inline content; `unsafe-eval` and WebSocket connections are development-only. Recheck the built application before tightening these remaining framework allowances.

## Observe

Use `GET /api/health` for readiness and container health. A ready response proves database connectivity, the migration required by this application release, and a populated catalog; `outdated`, `initializing`, and `unavailable` responses return HTTP 503. If migrations run under a separate database owner, grant the restricted application role `SELECT` on `_prisma_migrations` so it can perform this check without migration privileges. Forward JSON stdout/stderr to the platform log service. Production custom API responses emit one `api_request_completed` record containing only route template, method, status, duration, and request ID; thrown failures also emit `api_request_failed`. Alert on readiness failures, 5xx completion records, `POST /api/attempts` duration, and PostgreSQL connection saturation. Never log request bodies, answers, account identifiers, or report details.

Authorized content operators can view 28-day aggregate learning-loop health in `/studio`. The endpoint returns no learner identifiers or responses. Session totals use database-side aggregates. “Seven-day return” compares distinct learners in adjacent seven-day windows and caps each cohort at 50,000; repeat-topic change is capped at the latest 20,000 graded observations. Both declare when sampling is active. Move long-term or high-volume analytics to a privacy-reviewed warehouse rather than removing these bounds.

Application limits use hashed fixed-window buckets in PostgreSQL and are shared by every replica. The trusted ingress can additionally enforce network-wide limits as defense in depth. Current application policies include:

- attempts: 45 per account/IP or guest IP per minute;
- public catalog: 180 per IP per minute, with one-minute browser and five-minute shared-cache freshness;
- question selection: 120 per IP per minute;
- learner summary: 120 per account/IP per minute; profile and review reads: 60 per account/IP per minute; progress aggregation: 30 per account/IP per minute;
- reports: 6 per account/IP per 10 minutes.
- account-data exports: 3 per account/IP per hour.
- learning-data and full-account deletions: 3 per account/IP per hour.
- login: 10 attempts per email/IP per 15 minutes;
- registration: 5 attempts per email/IP per 15 minutes.
- consent acceptance: 5 attempts per account/IP per 15 minutes.
- email verification requests: 3 per email/IP per hour; verification attempts: 8 per token/IP per 15 minutes.
- login-email change requests: 3 per account/IP per hour; confirmation attempts: 8 per token/IP per 15 minutes.
- social-provider disconnections: 5 per account/IP per hour.
- all-device session revocations: 5 per account/IP per hour.
- password reset requests: 3 per email/IP per hour; reset attempts: 8 per token/IP per 15 minutes.
- studio review: 180 reads and 60 transitions per operator/IP per 10 minutes.
- studio metrics: 60 aggregate reads per operator/IP per 10 minutes.

Auth.js session cookies are encrypted JWTs checked against `User.sessionVersion`. Complete account export, irreversible learning-data deletion, explicit all-device sign-out, and sensitive social-account actions require an `authenticatedAt` claim no older than 10 minutes; routine JWT refresh does not extend that window, and rejected stale requests do not consume the action's rate limit. Successful learning-data deletion sends a non-blocking confirmation notice while retaining the login account. The `/privacy` account-security panel gives a suspected-compromise user a self-service all-device sign-out: one optimistic version rotation invalidates every old JWT, removes adapter sessions, retains credentials and learning data, and sends a security notice. Password changes and recovery, verified login-email changes, and provider disconnection also increment the version, clear stale account-proof tokens, sign every browser out, and send a security notice when email delivery is available. Full account deletion checks the confirmed password and session-version snapshot in the cascading delete statement, so a concurrent credential change wins or deletion wins without a stale-confirmation or partial-data outcome; successful deletion sends a final notice. Provider disconnection deletes the stored adapter row and its access/refresh tokens, but operators should still direct users to the provider's own security console when provider-side grant revocation is required. If a user cannot access the self-service control, an operator may increment that user's version after verified support escalation; a broad compromise requires incrementing all versions and rotating `AUTH_SECRET`. Secret rotation signs every browser out. Rotate OAuth client secrets in each provider console and the deployment secret store together.

`src/lib/legal.ts` pins the active terms and privacy versions. A version change deliberately sends every account through `/consent` again while preserving confirmed deletion access and recently reauthenticated data export or learning-data erasure. Publish and legally review the matching public pages before changing either constant; never rewrite an old `ConsentRecord`.

## Back Up and Restore

Take encrypted daily PostgreSQL backups with 30-day retention and point-in-time recovery when available. Quarterly, restore the latest backup into an isolated database, run `npm run db:deploy:postgres`, query catalog and attempt counts, and exercise `/api/health`. Record restore duration and result. Do not copy production learner data into developer laptops.

## Content Incidents

Learner reports enter `QuestionReport` as `OPEN`. Content operators use the role-protected `/studio` workspace to inspect the complete question context, quarantine unsafe content, and record a resolution. Each transition creates an immutable `ContentReviewAction`; the API never returns learner identity. Validate the original source and update normalization or curated records before resolving a genuine defect.

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

Application releases should be immutable and reversible. Roll back the application image first only when that image is compatible with the deployed schema. The Auth.js and account-only privacy migrations are destructive boundaries: they remove legacy sessions and anonymous learning data, and the pre-`activeKey` application must not be rolled back after the active-session migration. Restore the pre-deploy backup for a full rollback, or roll forward with this release. Future destructive changes should use expand/migrate/contract releases and a tested recovery step.
