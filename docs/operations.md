# Operations Runbook

## Deploy

Provision PostgreSQL with TLS, automated backups, and a restricted application role. Keep `DATABASE_URL` and platform credentials in the deployment secret store.

```bash
npm ci
npm run env:check
npm run db:generate:postgres
npm run db:deploy:postgres
npm run db:seed       # first release or content update only
npm run build
```

Run migrations as a single pre-deploy job, not from every application replica. The included Dockerfile builds a standalone server; set `DATABASE_URL`, `EDULOOP_DATABASE_PROVIDER=postgresql`, `APP_VERSION`, and `PORT` at runtime. Container startup validates these values before launching Next.js. Terminate HTTPS at the trusted ingress.

## Observe

Use `GET /api/health` for readiness and container health. Forward JSON stdout/stderr to the platform log service and alert on readiness failures, HTTP 5xx rate, attempt latency, and PostgreSQL connection saturation. Never log request bodies, answers, device keys, or report details.

Authorized content operators can view 28-day aggregate learning-loop health in `/studio`. The endpoint returns no learner identifiers or responses. Session totals use database-side aggregates. “Seven-day return” compares distinct learners in adjacent seven-day windows and caps each cohort at 50,000; repeat-topic change is capped at the latest 20,000 graded observations. Both declare when sampling is active. Move long-term or high-volume analytics to a privacy-reviewed warehouse rather than removing these bounds.

Application limits are a single-process safety net. Configure the trusted ingress or shared limiter for at least:

- attempts: 45 per device/IP per minute;
- question selection: 120 per device/IP per minute;
- reports: 6 per device/IP per 10 minutes.
- login: 10 attempts per email/IP per 15 minutes;
- registration: 5 attempts per email/IP per 15 minutes.
- studio review: 180 reads and 60 transitions per operator/IP per 10 minutes.
- studio metrics: 60 aggregate reads per operator/IP per 10 minutes.

Periodically delete expired `AuthSession` rows if login traffic is too low for opportunistic pruning. A suspected session compromise should revoke the affected rows; a database credential compromise requires revoking all sessions and rotating database credentials.

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

`quarantine` removes the reported question from practice but deliberately leaves the report open. Correct the source normalization or curated replacement, run the content checks, re-import, verify the question, and only then resolve the report. The CLI never prints learner device keys.

Generated diagrams require subject review and `reviewStatus = APPROVED`; never bulk-approve them. Preserve stable question IDs so attempts and review history remain attached.

## Rollback

Application releases should be immutable and reversible. Roll back the application image first. Database migrations in this repository are additive; do not reverse them while an older release can safely ignore the new tables. For a destructive future migration, ship expand/migrate/contract as separate releases and document a tested recovery step before approval.
