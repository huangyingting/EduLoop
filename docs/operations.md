# Operations Runbook

## Deploy

Provision PostgreSQL with TLS, automated backups, and a restricted application role. Keep `DATABASE_URL` and platform credentials in the deployment secret store.

```bash
npm ci
npm run db:generate:postgres
npm run db:deploy:postgres
npm run db:seed       # first release or content update only
npm run build
```

Run migrations as a single pre-deploy job, not from every application replica. The included Dockerfile builds a standalone server; set `DATABASE_URL`, `APP_VERSION`, and `PORT` at runtime. Terminate HTTPS at the trusted ingress.

## Observe

Use `GET /api/health` for readiness and container health. Forward JSON stdout/stderr to the platform log service and alert on readiness failures, HTTP 5xx rate, attempt latency, and PostgreSQL connection saturation. Never log request bodies, answers, device keys, or report details.

Application limits are a single-process safety net. Configure the trusted ingress or shared limiter for at least:

- attempts: 45 per device/IP per minute;
- question selection: 120 per device/IP per minute;
- reports: 6 per device/IP per 10 minutes.

## Back Up and Restore

Take encrypted daily PostgreSQL backups with 30-day retention and point-in-time recovery when available. Quarterly, restore the latest backup into an isolated database, run `npm run db:deploy:postgres`, query catalog and attempt counts, and exercise `/api/health`. Record restore duration and result. Do not copy production learner data into developer laptops.

## Content Incidents

Learner reports enter `QuestionReport` as `OPEN`. Content operators review them using a protected database/admin tool, validate the original source, update normalization or curated records, then mark reports `RESOLVED` with `resolvedAt`. Urgent harmful or unanswerable content should be changed to `NEEDS_REVIEW` immediately and re-imported only after correction.

Run the repository CLI only from a trusted operator terminal connected to the intended database:

```bash
npm run reports:review -- list --status=OPEN --limit=25
npm run reports:review -- show REPORT_ID
npm run reports:review -- quarantine REPORT_ID
npm run reports:review -- resolve REPORT_ID
```

`quarantine` removes the reported question from practice but deliberately leaves the report open. Correct the source normalization or curated replacement, run the content checks, re-import, verify the question, and only then resolve the report. The CLI never prints learner device keys.

Generated diagrams require subject review and `reviewStatus = APPROVED`; never bulk-approve them. Preserve stable question IDs so attempts and review history remain attached.

## Rollback

Application releases should be immutable and reversible. Roll back the application image first. Database migrations in this repository are additive; do not reverse them while an older release can safely ignore the new tables. For a destructive future migration, ship expand/migrate/contract as separate releases and document a tested recovery step before approval.
