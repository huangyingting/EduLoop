# Cloudflare deployment

This deployment path runs the existing Next.js application on Cloudflare Workers through OpenNext. Application routes keep importing the same Prisma client. The provider wrapper in `src/lib/prisma.ts` selects a request-scoped Prisma PostgreSQL adapter backed by Cloudflare Hyperdrive.

Cloudflare D1 is deliberately not used. EduLoop relies on interactive transactions for attempt rewards, session revocation, mailbox proofs, content review, retention, and account erasure. Prisma's D1 adapter currently runs transaction statements individually without ACID guarantees. A small database fits D1, but size does not remove that correctness requirement.

## Architecture

```text
Browser
  -> Cloudflare Workers / Workers Assets (OpenNext)
  -> request-scoped PrismaPg adapter
  -> Hyperdrive
  -> PostgreSQL
```

The Node/Azure path remains unchanged. `EDULOOP_DEPLOYMENT_RUNTIME=node` uses the native Prisma client; `cloudflare` selects Hyperdrive. Startup validation rejects Cloudflare with SQLite or D1.

The Edge Middleware reads only the encrypted Auth.js token to perform page-navigation and consent redirects. Protected pages and APIs still perform database-backed session-version, role, recent-authentication, and consent checks before returning data or mutating state.

## Prerequisites

- Node.js 24 and npm 11;
- a Cloudflare account with Workers, Hyperdrive, and Images available;
- a reachable PostgreSQL database with authenticated TLS;
- Wrangler authentication through `npx wrangler login`;
- the production configuration required by `.env.example`.

The Cloudflare services can stay within their free allowances for a small release, but PostgreSQL is an external dependency. Use an existing PostgreSQL server or a provider whose free plan and durability terms are acceptable. Hyperdrive does not turn a local SQLite file into hosted storage.

## Database

Apply migrations and seed through a direct PostgreSQL URL before deploying the Worker. Do not run migrations through Hyperdrive.

```bash
export DATABASE_URL='postgresql://USER:PASSWORD@HOST:5432/eduloop?schema=public&sslmode=require&connection_limit=8&pool_timeout=10&connect_timeout=5'
export EDULOOP_DATABASE_PROVIDER='postgresql'
npm ci
npm run db:generate:postgres
npm run db:deploy:postgres
npm run db:seed
```

Create Hyperdrive with the provider's direct connection string, then replace the all-zero placeholder `id` in `wrangler.jsonc` with the returned configuration ID:

```bash
npx wrangler hyperdrive create eduloop-db --connection-string="$DATABASE_URL"
```

For local Worker preview, change `localConnectionString` in an ignored local Wrangler configuration or run a local PostgreSQL instance matching the checked-in default. Never commit database credentials.

## Cloudflare resources

The initial deployment uses OpenNext's no-op incremental cache and does not require R2. Add an R2 or KV cache later if the application introduces dynamic revalidation that must persist across requests.

Set production values with Wrangler's interactive secret command so values do not enter shell history. At minimum configure:

```bash
npx wrangler secret put APP_VERSION
npx wrangler secret put AUTH_SECRET
npx wrangler secret put AUTH_URL
npx wrangler secret put RESEND_API_KEY
npx wrangler secret put AUTH_EMAIL_FROM
npx wrangler secret put LEGAL_ENTITY_NAME
npx wrangler secret put LEGAL_CONTACT_EMAIL
npx wrangler secret put LEGAL_JURISDICTION
```

Keep the direct `DATABASE_URL` only in the trusted migration, seed, cleanup, and operator environment. The Worker receives its database connection from the `HYPERDRIVE` binding. Add the optional OAuth IDs and secrets with Wrangler when those providers are enabled. `AUTH_URL` must be the final path-free HTTPS origin, and `APP_VERSION` must be an immutable release ID.

## Build and deploy

Validate the release artifact without publishing:

```bash
npm run typecheck
npm run lint
npm run supply:check
npm audit --omit=dev --audit-level=high
npm run build:cloudflare
npx wrangler deploy --dry-run
```

Deploy after the Hyperdrive ID, domain, and secrets are configured:

```bash
npm run deploy:cloudflare
```

For a local Workers-runtime check backed by local PostgreSQL:

```bash
npm run preview:cloudflare
```

The current dry-run upload is approximately 2.7 MiB gzip, below the Workers Free 3 MiB script limit but with little headroom. Check the reported upload size on every dependency update. Static question assets are uploaded separately through Workers Assets.

## Operations

Run the same production smoke checks after deployment:

```bash
npm run smoke:deployment -- https://your-production-origin.example
npm run smoke:oauth -- https://your-production-origin.example
```

The application retains opportunistic expired-data cleanup during live traffic. For deterministic cleanup on an idle deployment, run `npm run data:cleanup` from a trusted scheduled environment with the direct PostgreSQL URL; the generated OpenNext Worker does not expose a maintenance endpoint.

Backups, migration rollout, restore drills, email delivery, OAuth callbacks, monitoring, capacity checks, and launch evidence remain required. Follow `docs/operations.md` and `docs/production-readiness.md`; Cloudflare deployment changes the compute and connection path, not those release gates.