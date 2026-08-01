# Operations Runbook

## Deploy

Provision PostgreSQL with TLS, automated backups, and a restricted application role. A non-loopback production `DATABASE_URL` must set `sslmode=require`, `verify-ca`, or `verify-full`, and must not use a certificate-bypass `sslaccept`; startup validation fails closed otherwise. Loopback is exempt so an application can connect to a same-host database proxy over the local interface. Every production PostgreSQL URL must also set exactly one `connection_limit` from 1 through 100 and nonzero `pool_timeout` and `connect_timeout` values from 1 through 30 seconds. Keep `DATABASE_URL`, `AUTH_SECRET`, `RESEND_API_KEY`, and social-provider credentials in the deployment secret store. Set `AUTH_URL` to the public HTTPS origin and `AUTH_EMAIL_FROM` to a verified Resend sender. Configure `LEGAL_ENTITY_NAME`, `LEGAL_CONTACT_EMAIL`, and `LEGAL_JURISDICTION` with counsel-approved production values; placeholders fail the organizational launch review even if syntactically valid.

```bash
npm ci
npm run env:check
npm run db:generate:postgres
npm run db:deploy:postgres
npm run db:seed       # first release or content update only
npm run build
```

Run migrations as a single pre-deploy job, not from every application replica. The included Dockerfile builds a standalone server; set `DATABASE_URL`, `EDULOOP_DATABASE_PROVIDER=postgresql`, `APP_VERSION`, and `PORT` at runtime. Container startup validates these values before launching Next.js. Terminate HTTPS at the trusted ingress.

Size `connection_limit` per application replica: the maximum replica count multiplied by that limit, plus connections for the migration job, scheduled cleanup, and operator reserve, must remain below PostgreSQL `max_connections` or the pooler's application allocation. The example uses eight connections, a 10-second pool-acquisition timeout, and a 5-second connection timeout; load-test those values against the actual replica and database plan before launch. Never set `pool_timeout=0`, because that permits an overloaded request to wait indefinitely. A Prisma `P2024` pool timeout and database reachability/timeout errors are logged with bounded metadata and returned by custom APIs as HTTP 503 rather than an opaque 500. Alert on those codes and sustained 503 completion records, and keep readiness-probe timeouts compatible with the selected database timeouts.

Send `SIGTERM` for replica shutdown and allow at least 30 seconds before a forced kill. The standalone Next.js server first stops accepting connections, finishes in-flight requests, and then drains registered post-response tasks; the local `npm start` wrapper forwards the same signal. Email-provider requests abort after 10 seconds, leaving time for proof cleanup or delivery finalization. A shorter or hard-kill path can still interrupt an acknowledged verification or recovery request, so keep the resend controls available and alert on the delivery events below.

The provider-credential minimization migration rewrites only `Account` rows that contain legacy OAuth/OIDC response credentials, setting those fields to `NULL` while preserving each provider identity and login connection. It does not sign users out or require them to reconnect a provider. The delivery-aware proof migration marks existing verification, password-reset, and email-change rows as already delivered and permits an accepted email-change proof to coexist briefly with in-flight replacements; it does not invalidate existing links.

After the new replicas become ready but before opening production traffic, run the cookie-free deployment smoke journey from outside the ingress:

```bash
npm run smoke:deployment -- https://learn.example
```

It fails unless the public practice page's security headers, database migration and catalog readiness, public catalog, answer isolation, and stateless guest-grading contract all hold. HTTP is accepted only for loopback testing. The smoke request writes no learner or attempt data; the shared limiter still creates its normal short-lived keyed pseudonym buckets.

Validate every enabled production social provider separately. List only the providers expected on that deployment and pin each one to the exact authorization hostname controlled by its provider. The confirmation acknowledges that the command will initiate each Auth.js flow; the deployment may retrieve provider metadata, but the command never follows the returned authorization URL or signs in.

```bash
OAUTH_SMOKE_EXPECT='google=accounts.google.com,microsoft-entra-id=login.microsoftonline.com,facebook=www.facebook.com' \
OAUTH_SMOKE_CONFIRM_INITIATE=1 \
npm run smoke:oauth -- https://learn.example
```

The deployed catalog's complete OAuth/OIDC provider set must match the mappings exactly; a missing, extra supported, or unknown provider fails before any authorization flow begins. For every mapping, `npm run smoke:oauth` then obtains a fresh Auth.js CSRF token and cookie, starts the provider flow, and requires an HTTPS authorization request on the exact expected hostname and default port. It also requires one nonempty client ID, one nonempty state value, `response_type=code`, and exactly `{origin}/api/auth/callback/{provider}` as the callback. A success record contains only the provider IDs, operator-supplied hostnames, check names, and bounded timing. A failure contains only a fixed code, phase, and safe provider ID. Cookies, CSRF and state values, client IDs, full URLs, provider bodies, and deployment response bodies are never logged.

This is an initiation and configuration check, not an OAuth login test. It cannot prove the client secret, provider-app publication or consent settings, callback token exchange, returned identity claims, account creation, explicit linking, session issuance, persistence, disconnection, or later re-login. Before launch, complete an interactive journey with a dedicated provider test identity for every enabled provider: sign in as a new account, accept current consent, sign out, sign in again, link the provider to an existing recently authenticated account, sign in through that link, disconnect it while another verified login method remains, and confirm that the disconnected identity cannot silently relink. Verify the exact callback in each provider console and exercise rejection/cancellation recovery. Delete the test accounts afterward, and record the provider, release, callback, test time, operator, and result in the launch ticket without copying tokens, codes, claims, or account identifiers into general logs.

Verify the real production sender separately with an operator-controlled mailbox that is not a learner account. Set the recipient only for this invocation; do not persist it in repository configuration or forward the command environment to general logs. The second variable is an explicit external-send acknowledgment.

```bash
EMAIL_DELIVERY_PROBE_RECIPIENT=launch-check@example.com \
EMAIL_DELIVERY_PROBE_CONFIRM_SEND=1 \
npm run smoke:email
```

The command sends one link-free message through the same Resend endpoint, sender setting, authorization mechanism, and 10-second timeout used by account email. `email_delivery_probe_accepted` means only that Resend returned a successful HTTP response; it includes a random probe ID and timing but never the recipient, sender, key, or provider response. `email_delivery_probe_failed` emits only a bounded error class and allowlisted HTTP status or error code and exits nonzero. Locate that probe ID in the controlled inbox and Resend events, require a delivered event with no later bounce or complaint, and inspect the received headers for aligned SPF, DKIM, and DMARC. Record acceptance time, delivery time, mailbox provider, probe ID, header result, and operator in the launch ticket.

Provider acceptance and a delivered event still do not exercise an application proof lifecycle. Before launch, use a dedicated production test account to request and consume email verification and password recovery through the public HTTPS deployment, confirm that both messages arrive and that a link cannot be replayed, then delete the test account. Do not use a real learner address or retain message contents in general logs. A sender is launch-ready only when the probe, provider delivery event, authentication headers, and application journey all pass.

Establish capacity evidence in a production-equivalent environment and repeat a bounded check against the exact production release before opening traffic. Start with a small warm-up run, then set the evidence run's release, arrival rate, concurrency ceiling, timeout, and acceptance budgets explicitly. One worker is capped at one guest journey every two seconds so it remains below the application limit of 45 guest attempts per source address per minute.

```bash
CAPACITY_PROBE_CONFIRM_RUN=1 \
CAPACITY_PROBE_EXPECT_VERSION='RELEASE_ID' \
CAPACITY_PROBE_JOURNEYS=60 \
CAPACITY_PROBE_INTERVAL_MS=2000 \
CAPACITY_PROBE_CONCURRENCY=4 \
CAPACITY_PROBE_TIMEOUT_MS=10000 \
CAPACITY_PROBE_MAX_P95_MS=2000 \
CAPACITY_PROBE_MAX_ERROR_RATE=0.01 \
npm run probe:capacity -- https://learn.example
```

`npm run probe:capacity` first requires `/api/health` to report the exact expected release with a ready schema and database. Each scheduled journey then selects one public question and submits one guest answer, requiring the grading result to remain non-persistent. The body reader is capped at 64 KiB. Output contains only a random probe ID, the operator-supplied release and numeric settings, aggregate success/error counts, fixed failure categories, HTTP status counts, latency percentiles, failed-threshold names, and bounded timing. It never emits question IDs or content, answers, request/response bodies, network addresses, cookies, account identifiers, or exception messages. A configuration or preflight failure emits only a fixed error code and phase; a threshold failure emits the safe aggregate result and exits nonzero. The probe creates the normal short-lived keyed rate-limit pseudonym buckets but no learner, session, attempt, activity, XP, or review data.

A single process proves only that source's bounded guest path, not system capacity. For peak-load evidence, run the same checked-out release from enough independently addressed load workers to represent forecast peak traffic plus agreed headroom; synchronize them through the load platform, never by spoofing forwarding headers. Use production-like replica, pool, PostgreSQL, cache, and ingress settings, and test in staging before any scheduled production run. Require the aggregate error and latency budgets, no worker saturation, no unexpected 429s, healthy readiness throughout, and no pool-timeout or database-unavailable events. Record the release, environment, planned and achieved journey rate, worker count, start/end time, probe IDs, p50/p95/p99/max, status/failure counts, application 5xx and route latency, CPU/memory, replica scaling, PostgreSQL connections/CPU/locks, pool saturation, operator, and ticket. Keep raw learner data and response bodies out of the load platform. The guest probe does not exercise authenticated persistence, OAuth, email, studio operations, destructive privacy actions, CDN behavior for every asset, geographic latency, or a sustained soak; cover those separately and rerun capacity evidence whenever traffic shape, infrastructure, database plan, pool sizing, or a material hot path changes.

Keep the application port private to the ingress. Configure the ingress to replace the public host/protocol headers and append the connecting address to `X-Forwarded-For`. The container defaults `TRUSTED_PROXY_HOPS` to `1`; set it to the exact number of trusted hops between the browser and application (for example, `2` for a CDN plus ingress). EduLoop selects the address immediately before those trusted hops, so an untrusted prefix supplied by a client cannot create fresh rate-limit identities. Anonymous authentication applies that address ceiling before a separate email or proof-token ceiling, while authenticated actions remain bounded by account even if the client address changes. `AUTH_URL`, not forwarded headers, is the authority for custom mutation-route origin checks.

Custom application JSON mutations reject bodies larger than 32 KiB while streaming and return HTTP 413 even when a client omits or falsifies `Content-Length`. Configure a compatible ingress request-body ceiling as earlier defense in depth, while preserving Auth.js provider callbacks and normal form posts.

The Auth.js/account-only migrations intentionally sign old sessions out and erase historical anonymous learner rows. The active-session migration abandons all but the newest active session per learner before adding the unique active slot. The delivery-aware proof migration removes the unique `EmailChangeToken.userId` index that the earlier application uses for upsert, so an older replica must not serve email-change requests after that migration either. Deploy this release as a drained or maintenance-window cutover: stop every old replica, record the pre-migration anonymous-profile and duplicate-active-session counts, take a backup, apply migrations, replace every replica, and then verify no duplicate active sessions remain.

The Docker runtime, PostgreSQL CI service, and GitHub Actions are pinned to immutable digests or commit SHAs. `.node-version` and `packageManager` align CI with the container toolchain. Dependency lifecycle scripts are denied unless their exact package version has an `allowScripts` decision; `.npmrc` makes a newly introduced script fail `npm ci`. Dependabot proposes weekly npm, Actions, and Docker updates. Review upstream release notes and any changed install script before refreshing its exact allowlist entry, then require the full CI suite before merging.

Production responses set HSTS, same-origin opener/resource isolation, and a resource-complete CSP. Next.js hydration currently requires inline scripts and the UI uses inline style values, so `script-src` and `style-src` allow inline content; `unsafe-eval` and WebSocket connections are development-only. Recheck the built application before tightening these remaining framework allowances.

## Launch Evidence Approval

Keep the real launch-evidence manifest in the controlled release system or another access-restricted location outside the repository. Start from `docs/launch-evidence.json.example`, replace every placeholder, and use only private references that an accountable reviewer has opened and checked. The template is `PENDING` and its placeholder references are rejected, so it fails by design until every record is replaced after review. Every gate needs uppercase `PASS`, canonical UTC `verifiedAt` and `expiresAt` values, a private `evidenceRef`, and an accountable `operatorRef`. The root release, origin, active legal versions, and OAuth-provider list scope all entries together. Add exactly one `oauth-provider-journeys` entry for each enabled provider; use an empty manifest list and `LAUNCH_EXPECT_OAUTH_PROVIDERS=none` when social login is deliberately disabled.

The required evidence is:

- `legal-review`: counsel approval of the published terms, privacy notice, entity, contact, and jurisdiction for the pinned legal versions;
- `production-deployment`: the immutable release is deployed at the intended origin and the platform reports the same release identity;
- `postgresql-migration`: the exact migration set passed on a disposable PostgreSQL database and the production migration job completed once;
- `live-deployment-smoke`: the outside-ingress deployment smoke passed against that release;
- `email-delivery`: provider acceptance, delivered status without later bounce or complaint, and SPF/DKIM/DMARC alignment passed;
- `email-account-journeys`: deployed verification and recovery links arrived, completed once, rejected replay, and the test account was removed;
- `oauth-provider-journeys`: provider initiation plus new sign-in, consent, callback, re-login, explicit linking, disconnection, disconnected-login rejection, cancellation recovery, and test-account cleanup passed for the named provider;
- `monitoring-alerts`: readiness, application error, database/pool, email finalization, and after-response alert routes were configured and exercised;
- `cleanup-scheduler`: the hourly cleanup completed and its two-hour dead-man alert was exercised;
- `backup-restore`: the selected provider backup was restored in isolation, aggregate counts matched, the restored release became healthy, the recovery objective passed, and the temporary target was destroyed;
- `ingress-controls`: TLS, private application port, trusted-hop handling, request-size defense, and an ingress-level rate limit were exercised;
- `distributed-capacity`: production-like, independently addressed workers met the agreed forecast, headroom, latency, error, saturation, replica, pool, and database budgets;
- `rollback-readiness`: the immutable previous image, schema compatibility decision, backup boundary, and tested roll-forward or restore procedure were reviewed for this release;
- `desktop-mobile-review`: desktop and mobile screenshots plus the critical guest, account, practice, progress, review, privacy, and studio journeys were reviewed for layout and usability regressions.

Evidence becomes invalid at its declared `expiresAt` or, if sooner, after the verifier's maximum age: 365 days for legal review; 90 days for backup/restore; seven days for monitoring, ingress, distributed capacity, rollback, and desktop/mobile review; 24 hours for deployment, PostgreSQL migration, live smoke, email delivery, email account journeys, and each OAuth provider journey; and two hours for the cleanup scheduler. A future verification time, unknown or duplicate gate, missing provider, extra provider, stale record, failed status, changed legal version, release mismatch, or origin mismatch fails closed.

Run the verifier only after personally reviewing every referenced record:

```bash
LAUNCH_EVIDENCE_CONFIRM_REVIEW=1 \
LAUNCH_EXPECT_VERSION='RELEASE_ID' \
LAUNCH_EXPECT_ORIGIN='https://learn.example' \
LAUNCH_EXPECT_OAUTH_PROVIDERS='google,microsoft-entra-id,facebook' \
npm run launch:verify -- /secure/launch-evidence.json
```

The command reads at most 64 KiB and never logs the deployment origin, evidence references, operator identities, or manifest contents. Success output contains only the release, gate/provider counts, fixed gate/provider names, status, and bounded freshness metadata. Failure output contains only a fixed code, phase, and, when safe, the required gate/provider name. `launch_evidence_verification_completed` proves only that the strict manifest was complete, current, and matched the supplied expectations; it does not authenticate the file, inspect a ticket, verify an operator, or query any external system. Store the manifest and underlying evidence under the release system's access, review, retention, and tamper-evidence controls. Never treat the example file or a successful syntax check as launch approval by itself.

## Observe

Use `GET /api/health` for readiness and container health. A ready response proves database connectivity, the migration required by this application release, and a populated catalog; `outdated`, `initializing`, and `unavailable` responses return HTTP 503. If migrations run under a separate database owner, grant the restricted application role `SELECT` on `_prisma_migrations` so it can perform this check without migration privileges. Forward JSON stdout/stderr to the platform log service. Production custom API responses emit one `api_request_completed` record containing only route template, method, status, duration, and request ID; thrown failures also emit `api_request_failed` with a bounded error class and, when present, an allowlisted runtime code or numeric provider status. Framework request failures add the route template and a safe digest, never the raw path or exception message. Auth.js emits `authjs_error` with only a bounded error class and Auth.js type; aggregate by `authErrorType`, and investigate sustained `Configuration`, `AdapterError`, `CallbackRouteError`, or `OAuthSignInError` increases without treating ordinary user-cancelled callbacks as pages. Alert on readiness failures, 5xx completion records, `POST /api/attempts` duration, and PostgreSQL connection saturation. Track `email_verification_delivery_failed`, `password_reset_email_failed`, and `email_change_delivery_failed` as provider-delivery health signals. Page immediately on their corresponding `*_delivery_cleanup_failed` or `*_delivery_finalize_failed` events: cleanup failure leaves an undelivered row for normal expiry, while finalization failure means the provider accepted the message and its link remains usable but database supersession is unconfirmed. Also alert on `after_response_task_failed`; its allowlisted `task` value identifies an unexpected failure that escaped the operation-specific handler, while its error fields remain bounded and omit exception text. Investigate database availability and the scheduled expiry cleanup before asking the learner to resend. Never log request bodies, answers, account identifiers, report details, exception messages, OAuth callback values, authorization codes, provider tokens, or raw request paths.

Production maintenance commands follow the same policy. Prisma's built-in query-error logger is disabled outside explicit local development so it cannot print a provider exception before the application redacts it. Catalog seeding, deployment capacity probing, email probing, OAuth deployment smoke, launch-evidence verification, restore verification, security-artifact cleanup, role management, and report review emit structured failure or rejection events with timestamps, duration, a bounded error class, and only allowlisted provider codes; they never copy an exception message. Expected role/report usage and state rejections use `level=warn` and a fixed reason. Treat `catalog_seed_failed`, `deployment_capacity_probe_failed`, `deployment_capacity_probe_threshold_failed`, `email_delivery_probe_failed`, `oauth_deployment_smoke_failed`, `launch_evidence_verification_failed`, `database_restore_verification_failed`, `expired_security_artifact_cleanup_failed`, `user_role_command_failed`, and `content_report_command_failed` as actionable failures. Run commands that intentionally display operator accounts or report content only in a trusted terminal, and do not forward that human-readable incident output into general application logs.

Authorized content operators can view 28-day aggregate learning-loop health in `/studio` after authenticating within the previous 10 minutes. The endpoint returns no learner identifiers or responses. Session totals use database-side aggregates. “Seven-day return” compares distinct learners in adjacent seven-day windows and caps each cohort at 50,000; repeat-topic change is capped at the latest 20,000 graded observations. Both declare when sampling is active. Move long-term or high-volume analytics to a privacy-reviewed warehouse rather than removing these bounds.

Application limits use domain-separated HMAC-SHA-256 fixed-window pseudonyms in PostgreSQL and are shared by every replica. `AUTH_SECRET` is the key; limiter rows contain only the pseudonym, count, window, and expiry, never the raw network address, email, account ID, or proof token. The trusted ingress can additionally enforce network-wide limits as defense in depth. Current application policies include:

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

The command atomically removes records at or past their expiry from Auth.js adapter sessions and verification tokens, hashed email-verification, email-change, and password-reset proofs, and keyed rate-limit pseudonym buckets. It also removes at most 100 expired unused password registrations per run. That account deletion is restricted to `LEARNER` records with no provider, live session or proof, operator history, non-default learner state, or learning/report relation; empty learner preferences and registration consent cascade with the account. A successful run emits `expired_security_artifact_cleanup_completed` with its cutoff, start/completion timestamps, duration, total removed, and per-category aggregate counts without account identifiers. A failure emits `expired_security_artifact_cleanup_failed` with a `cleanup` or `disconnect` phase and bounded error metadata, never exception text. Expiry columns and the registration eligibility prefix are indexed by paired migrations. Normal application traffic invokes the same bounded cleanup every 250 rate-limit operations, but the scheduled command guarantees timely minimization for a low-traffic deployment. Run it repeatedly when `staleUnverifiedRegistrations` equals 100, alert immediately on the failure event or a nonzero command exit, and trigger a dead-man alert if no completion event is observed within two hours. Record only aggregate counts; do not log or export deleted rows.

Auth.js session cookies are encrypted JWTs checked against `User.sessionVersion`. Complete account export, irreversible learning-data deletion, explicit all-device sign-out, and sensitive social-account actions require an `authenticatedAt` claim no older than 10 minutes; routine JWT refresh does not extend that window, and rejected stale requests do not consume the action's rate limit. Successful learning-data deletion sends a non-blocking confirmation notice while retaining the login account. The `/privacy` account-security panel gives a suspected-compromise user a self-service all-device sign-out: one optimistic version rotation invalidates every old JWT, removes adapter sessions and pending account-proof tokens, retains credentials and learning data, and sends a security notice. Email-change issuance is bound to the exact authenticated version, so a delayed request cannot recreate a proof after revocation. Verification, recovery, and email-change resends retain the last provider-accepted proof until a newer issued proof is accepted; a failed send removes only its in-flight row, and serialized finalization prevents an older provider response from displacing the newer issued winner. Password changes and recovery, first mailbox verification, verified login-email changes, and provider disconnection increment the version, clear every outstanding account-proof token, and sign every browser out; verified flows send a security notice when email delivery is available. First-password setup on an unverified Microsoft/Facebook account sends a fresh verification link and leaves Credentials disabled. The link recipient must re-enter that password; completion atomically removes the untrusted provider association, invalidates old sessions, and enables Credentials. Password recovery for any unverified social account likewise chooses a mailbox-controlled password and removes every provider association, while recovery for an already verified account preserves its providers. Only a matching verified Google claim, a password-bound EduLoop verification, a reset chosen by the mailbox owner, or a verified login-email change establishes assurance. An unverified password cannot justify removing the final social login method. Full account deletion checks the confirmed password and session-version snapshot in the cascading delete statement, so a concurrent credential change wins or deletion wins without a stale-confirmation or partial-data outcome; successful deletion sends a final notice. The Auth.js adapter stores only the stable provider identity needed for later login and discards OAuth/OIDC access, refresh, and ID tokens plus related response metadata; the provider-credential minimization migration nulls fields written by earlier releases. Provider disconnection deletes that identity record, but operators should still direct users to the provider's own security console when provider-side grant revocation is required. If a user cannot access the self-service control, an operator may increment that user's version after verified support escalation; a broad compromise requires incrementing all versions and rotating `AUTH_SECRET`. Secret rotation signs every browser out and creates a fresh application rate-limit namespace; keep ingress rate limiting active during the rollout so the namespace reset cannot provide an abuse window, and allow old bucket rows to expire through normal cleanup. Rotate OAuth client secrets in each provider console and the deployment secret store together.

Credentials login also claims the exact password hash and session version it proves. Opportunistic bcrypt cost upgrades use a guarded write, and the initial JWT retains that claimed version through the Auth.js callback. If password recovery, rotation, or all-device revocation orders after password verification but before cookie issuance, the callback rejects the stale login instead of adopting the newer version; the delayed rehash cannot overwrite the new password.

Provider login follows the same ordering rule. The sign-in callback snapshots the exact stored provider identity and its owning user's version; the JWT callback confirms that connection still exists and that the version is unchanged. Provider disconnection therefore defeats an OAuth/OIDC callback already in flight. No provider, including Google, may recreate a disconnected identity by matching an existing email address: reconnecting requires a recent authenticated session and the explicit `/privacy` control.

Password setup and rotation, full account erasure, provider disconnection, learning-data erasure, and content-review transitions carry the exact version returned by request authentication into their database transaction; content transitions also claim the operator role. This gives revocation or demotion a deterministic order. An in-flight mutation may complete before the security change, but it cannot wait until afterward and silently adopt a version or role it never authenticated.

`src/lib/legal.ts` pins the active terms and privacy versions. Privacy version `2026-08-01.1` discloses transient network-address processing and keyed limiter pseudonyms; have counsel review the matching public page and publish it with this release. The version change deliberately sends every existing account through `/consent` again while preserving confirmed deletion access and recently reauthenticated data export or learning-data erasure. Never rewrite an old `ConsentRecord`.

## Back Up and Restore

Take encrypted daily PostgreSQL backups with 30-day retention and point-in-time recovery when available. Keep backup encryption keys outside the database account, restrict restore privileges, and alert when the provider misses its backup schedule. A provider dashboard saying that a backup completed is not restore evidence.

At least quarterly, select a specific recent backup or point-in-time target and restore it into a newly created, access-restricted database outside the application path. Record the backup identifier and timestamp, restoration start and finish times, expected aggregate counts captured for that recovery point, release version, operator, and ticket. Do not copy production learner data into developer laptops or any general-purpose development environment.

From the checked-out release, generate the PostgreSQL client, migrate the isolated target to that release, and run the read-only verifier. Use a one-connection URL with bounded timeouts and authenticated TLS for a remote database. Keep the normal application `DATABASE_URL` configured so the verifier can reject that target; `RESTORE_CONFIRM_ISOLATED=1` is a deliberate acknowledgment, not proof of isolation.

```bash
npm run db:generate:postgres
DATABASE_URL="$RESTORE_DATABASE_URL" npm run db:deploy:postgres
RESTORE_CONFIRM_ISOLATED=1 npm run restore:verify
```

`npm run restore:verify` connects only through `RESTORE_DATABASE_URL`. In one serializable, read-only transaction it requires the release's successful migration, rejects unfinished migrations, reads every durable catalog, identity, learning, and governance table, and requires a nonempty subject/question catalog. It emits `database_restore_verification_completed` with duration and aggregate row counts only; it never emits the database URL, credentials, row contents, identifiers, or exception messages. Compare every aggregate with the evidence for the selected recovery point and investigate any mismatch. A missing migration, unfinished migration, empty catalog, unsafe target configuration, inaccessible table, or database error emits `database_restore_verification_failed` and exits nonzero.

The verifier deliberately does not claim that a provider backup was restored, that the chosen recovery point is correct, that every value matches production, or that the application can serve it. Launch the current release in the same isolated environment with its `DATABASE_URL` pointing at the restored target, exercise `GET /api/health`, and perform a privacy-approved functional spot check without exporting row data. Record both the provider restore duration and the application checks, then destroy the isolated database and its temporary credentials and confirm their deletion. A drill is successful only when the provider restore evidence, exact aggregate comparison, verifier, health check, deletion confirmation, and recovery-time objective all pass.

## Content Incidents

Learner reports enter `QuestionReport` as `OPEN`. Content operators use the role-protected `/studio` workspace to inspect the complete question context, quarantine unsafe content, and record a resolution. The API additionally requires a login no older than 10 minutes for every studio read and mutation, so an unattended 30-day operator session cannot expose answer keys or alter the catalog; the workspace prompts for reauthentication when that window closes. Each web or trusted-CLI transition conditionally claims the required report state before changing the question and writes an immutable `ContentReviewAction` in that transaction. Concurrent transitions are therefore serialized, and a quarantine that orders after another operator's resolution receives an explicit conflict. The API never returns learner identity. If a reporter erases learning data or the account, provider-specific database triggers react to the foreign-key unlink by clearing free text and recording anonymization while preserving the anonymous report state and action history; operators can still resolve the quarantine. Validate the original source and update normalization or curated records before resolving a genuine defect.

`Question.importStatus` is the latest source-audit decision; `Question.status` is the effective serving state. Quarantine records `quarantinedAt` and forces the effective state to `NEEDS_REVIEW`. Routine `npm run db:seed` executions continue importing repaired content and refreshing `importStatus`, but they never clear that marker or republish the question. Resolution locks the question and counts its other open reports; only the final resolution clears quarantine and copies the current `importStatus` into the effective state. Concurrent final resolutions therefore cannot leave a repaired question stranded, and resolving an import that still says `NEEDS_REVIEW` cannot publish it.

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

`quarantine` removes the reported question from practice but deliberately leaves the report open. Correct the source normalization or curated replacement, run the content checks, re-import, verify the updated content and `importStatus` in the studio, and only then resolve every open report for that question. Imports preserve quarantine; the last resolution restores the audited import state. The CLI never prints learner or account identifiers.

Generated diagrams require subject review and `reviewStatus = APPROVED`; never bulk-approve them. Preserve stable question IDs so attempts and review history remain attached.

## Rollback

Application releases should be immutable and reversible. Roll back the application image first only when that image is compatible with the deployed schema. The Auth.js and account-only privacy migrations are destructive boundaries: they remove legacy sessions and anonymous learning data, and the pre-`activeKey` application must not be rolled back after the active-session migration. The delivery-aware proof migration is another application-compatibility boundary because the prior email-change implementation requires the removed unique user index; roll forward with the current application or restore the pre-migration database backup before running an older image. The email-assurance migration deliberately clears unverifiable legacy assurance timestamps and revokes affected sessions without deleting users, hashes, provider identities, or learning data. The following mailbox-ownership migration deletes only pending ordinary verification tokens for passwordless accounts; those users retain social access and password-reset recovery. Announce the one-time sign-in and re-verification requirement, verify email delivery before deployment, and keep the social-provider callbacks healthy so Microsoft/Facebook users retain access. Do not roll back to an application release that marks every OAuth/OIDC address verified or consumes verification links without password confirmation; restore the pre-deploy backup for a full rollback, or roll forward with this release. Future destructive changes should use expand/migrate/contract releases and a tested recovery step.
