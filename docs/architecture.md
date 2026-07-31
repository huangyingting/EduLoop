# Architecture

## Runtime shape

```text
Browser
  -> Next.js App Router pages and client practice player
  -> /api/auth/* (Auth.js credentials, OAuth, and encrypted session)
  -> /api/questions/next (filtered selection; answer omitted)
  -> /api/attempts (server-side grading and rewards)
  -> /api/sessions, /api/review, /api/learner/progress
  -> Prisma Client
  -> SQLite locally / PostgreSQL in production

data/zh-CN/*.json (default runtime catalog)
  -> normalization boundary
  -> catalog + questions + options + inferred tags

data/en/amc*.json
  -> localization + structural parity audit
  -> data/zh-CN/amc*.json

public/question-assets/source/amc/*
  -> shared, content-addressed upstream figures

public/question-assets/generated/zh-CN/<question-id>/*
  -> reviewed locale-specific replacement diagrams
```

The catalog API discovers every filterable tag dimension from the database, so new curriculum dimensions do not require a new practice UI control. Its strict, public-only query surface is shared-cacheable and rate limited before relational lookup. Question filters encode tags as `DIMENSION:slug` while retaining unqualified topic slugs for older links. A bounded `questionId` filter lets saved and scheduled-review cards reuse the same player for targeted practice. The question API returns only the stem, options, display metadata, and tags. Correct labels, reference answers, and explanations remain server-side until an attempt is posted.

## Data-model decisions

- Source IDs are the canonical question IDs. Imports are idempotent and traceable by `sourceFile` and `sourceType`.
- Subject, grade band, and grade are relations because they have display metadata, ordering, and stable identity.
- Difficulty and normalized question type are portable strings so the model behaves identically on SQLite and PostgreSQL.
- Options are ordered child rows; answer labels are stored as a small JSON-encoded string because both database providers can handle it without provider-specific array types.
- Tags are many-to-many and dimensioned. Confidence plus provenance prevents inferred metadata from masquerading as teacher-reviewed truth.
- Practice attempts are immutable events. A browser-generated unique attempt ID makes network retries idempotent, while `DailyActivity` is a derived aggregate for efficient streak/history displays.
- `PracticeSession.activeKey` is a nullable unique learner slot. Active sessions carry the learner ID in that slot, while completed or abandoned sessions clear it, so the database—not a process-local check—enforces at most one active session per learner.
- An attempt may receive one idempotent `explanationViewedAt` timestamp after an incorrect result. The protected studio derives bounded, aggregate learning-health signals from attempts, sessions, and daily activity; it never returns learner identity or responses.
- `ReviewItem` stores the explainable 1/3/7-day mistake schedule; `SavedQuestion` is independent of correctness. Review lists and counts honor the same `PUBLISHED` boundary as question serving.
- Written attempts are created before the learner sees the reference answer; their nullable correctness is then finalized by an explicit self-assessment update.
- `QuestionReport` captures learner feedback for the protected content-review workflow.
- `ContentReviewAction` is an immutable operator trail for quarantine, resolution, and reopening. Public registration always receives `LEARNER`; only trusted operators can assign `CONTENT_EDITOR` or `ADMIN`.
- Every `LearnerProfile` belongs to exactly one `User`. Authenticated requests resolve an Auth.js encrypted token, verify its database `sessionVersion`, and use `userId`; guests never receive a persistent learner identity.
- `src/proxy.ts` redirects signed-out page requests except `/practice`, `/login`, and `/register`. API authorization remains inside each route: only question discovery, hints, catalog data, health, Auth.js, registration, and stateless attempt grading are public.
- Registering creates an account-owned profile. Logging into an established account resumes only that account's attempts, sessions, daily activity, badges, saved questions, reviews, and reports; guest practice is never merged because it is never persisted.
- Application API responses default to `Cache-Control: no-store`; public question selection can become learner-specific when a valid Auth.js cookie enables recommendations or saved state.
- The account export returns a small versioned identity/consent/session-metadata envelope and streams paginated learner and content-review-action sections in stable order. Prisma projections intentionally exclude password hashes, session tokens, provider tokens, and verification-token digests rather than loading secrets and filtering them after serialization.

## Selection and scaling

The MVP chooses a random offset within the filtered result count and excludes the last eight client-seen IDs. This is simple and adequate for 10k questions. At larger scale, replace offset selection with a precomputed random key or adaptive candidate service; large PostgreSQL offsets should not become the long-term recommendation engine.

The recommendation layer prioritizes due review items, then sufficiently observed topic weakness within the active filters, and finally recent subject accuracy. Topic ranking uses accuracy plus a bounded response-time penalty so slow but correct work can receive more practice without overpowering correctness. Its output remains explainable, and future calibration can add curriculum confidence without changing the question API contract.

## Database workflow

SQLite and PostgreSQL have separate schema entrypoints and migration histories:

- `prisma/schema.prisma` and `prisma/migrations/` for local SQLite.
- `prisma/postgresql/schema.prisma` and `prisma/postgresql/migrations/` for production PostgreSQL.

Both contain the same portable models but different datasource providers. This duplication is explicit and testable; it avoids runtime provider tricks and prevents SQLite migration SQL from reaching production. Schema changes must be applied to both files in one change.

For a production schema change, update both schemas, run a local migration, generate a PostgreSQL migration against a disposable/shadow PostgreSQL database, inspect both SQL files, and then deploy the PostgreSQL migration before the application build starts serving traffic.

## Content pipeline

`src/lib/content.ts` is the anti-corruption layer between external content and product concepts. It:

- strips source-specific labels into stable difficulty and type values;
- extracts only conservative choice answer keys;
- marks unrenderable/compound records for review;
- produces options and inferred tags;
- preserves full answer and explanation text.

The importer rebuilds `IMPORT`/`RULE` option and tag links but preserves links whose source is `CURATED`; it also does not delete learner history. A future content-admin workflow can therefore promote or add editorial tags without losing them on the next import. Generated diagram replacements require an explicit `APPROVED` status before the practice API exposes them; all 12 current assets have completed that review. Learner reports are stored separately so content can be corrected without rewriting attempts.

## Production boundaries

- Public mode supports stateless anonymous practice and optional Auth.js verified email/password, Google, Microsoft, and Facebook accounts. Persistent public accounts are limited to adult learners or parents/legal guardians. `ConsentRecord` preserves each accepted terms/privacy version and basis; existing accounts without the current versions receive a provisional session that can access only consent and data-rights surfaces. Learner data is created only after current consent. New production password accounts must consume an email-delivered verification link before login and have single-use recovery with session revocation. Login-email changes require fresh account proof, verify the new address through a hashed single-use token, and revoke old sessions. Linked social identities can be removed with recent authentication, a concurrency-safe final-method guard, stored-token deletion, and all-session revocation. Every other non-practice surface requires login and current consent. Content roles are assigned only through the trusted operator CLI and gate `/studio` plus its API. Institutional identity, verified guardian consent, teacher/guardian roles, and school lifecycle management remain separate school-launch requirements.
- Rate-limited application endpoints use hashed, fixed-window buckets in the shared database, so limits remain coherent across replicas without persisting raw IP addresses, emails, account IDs, or tokens. A trusted ingress may add broader network-level protection as defense in depth.
- Custom JSON mutation routes read request streams through a shared 32 KiB byte cap before schema validation. The cap is enforced even when `Content-Length` is missing or false, preventing an unbounded payload from being buffered in an application worker.
- Errors are emitted as structured JSON through Next.js instrumentation. Every production custom API response also emits a privacy-safe completion record with its route template, method, status, duration, and request ID, giving the deployment an executable source for 5xx and attempt-latency alerts without logging learner data. Production must forward stdout/stderr to a monitored log or error service.
- `/api/health` verifies database connectivity, the exact migration required by the running application, and a populated catalog. `npm run schema:check` fails when that required migration marker falls behind either provider's migration history. CI also checks types, lint, unit tests, content audit, schema parity, and the production build.
- PostgreSQL migrations, backups, restore drills, HTTPS, secret rotation, and rollback are deployment responsibilities documented in `docs/operations.md`.
