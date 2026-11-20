# EduLoop

EduLoop is a practice app for primary, middle, and high school learners. It turns the question archives in `data/zh-CN/` into a searchable question bank across <!-- stat:seed.subjects -->5<!-- /stat --> subjects and AMC 8/10/12 contest papers, grades choice questions on the server, lets learners self-assess written answers, schedules mistakes for spaced review, and rewards steady practice with XP, streaks, and badges. The interface is available in Simplified Chinese (default) and English.

- **Catalog:** <!-- stat:seed.published -->16,022<!-- /stat --> published questions, <!-- stat:seed.contestPapers -->143<!-- /stat --> timed AMC papers, step-by-step hints for <!-- stat:seed.questionsWithHints -->5,143<!-- /stat --> questions.
- **Stack:** Next.js App Router, React, TypeScript, Tailwind CSS 4, Auth.js, Prisma (SQLite locally, PostgreSQL in production).
- **Guests** can practice without an account; nothing they do is stored.

## Quick start

```bash
cp .env.example .env
npm install
npm run dependencies:activate
npm run db:generate && npm run db:migrate && npm run db:seed
npm run dev
```

Open <http://localhost:3000>. The first seed takes about a minute; later runs skip unchanged content.

Before sending a change, run `npm test`, `npm run typecheck`, `npm run lint`, and `npm run build`. See [CONTRIBUTING.md](CONTRIBUTING.md) for the full checklist.

## Documentation

| Topic | Where |
| --- | --- |
| Commands, local setup, adding content | [docs/development.md](docs/development.md) |
| Architecture and code layers | [docs/architecture.md](docs/architecture.md) |
| Architecture decisions | [docs/adr/](docs/adr/) |
| Product and UI design | [docs/product-design.md](docs/product-design.md) |
| Authentication and sessions | [docs/authentication.md](docs/authentication.md) |
| Internationalization | [docs/i18n.md](docs/i18n.md) |
| Source data audit | [docs/data-audit.md](docs/data-audit.md) and [data/README.md](data/README.md) |
| Deploying and operating | [docs/operations.md](docs/operations.md), [docs/vm-deployment.md](docs/vm-deployment.md) |
| Launch gates | [docs/production-readiness.md](docs/production-readiness.md) |
| Metrics and alerts | [docs/observability.md](docs/observability.md) |
| Release history | [CHANGELOG.md](CHANGELOG.md) |
