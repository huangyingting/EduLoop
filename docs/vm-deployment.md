# Webstack VM deployment

EduLoop deploys to the Azure VM managed by the sibling
[`webstack`](https://github.com/huangyingting/webstack) repository. The local
workflow is intentionally a thin caller of Webstack's reusable workflow; it
does not contain SSH credentials or duplicate VM orchestration.

## Architecture

```text
successful EduLoop CI
  -> pinned Webstack reusable workflow
  -> build ghcr.io/OWNER/eduloop:{commit}
  -> build ghcr.io/OWNER/eduloop-ops:{commit}
  -> Azure OIDC + VM Run Command
  -> operations container on webstack-apps
       -> Prisma migrations
       -> idempotent catalog seed
  -> webstack-deploy eduloop APP_IMAGE
  -> Docker Compose health check and old-image rollback

Internet -> Caddy HTTPS -> 127.0.0.1:10001 -> EduLoop container
EduLoop -> 172.30.0.1:5432 -> native shared PostgreSQL
```

The workflow reference is pinned to a full Webstack commit SHA. Dependabot and
the repository supply-chain check reject mutable action references.

## One-time Webstack setup

The VM must be deployed from a Webstack revision that installs
`webstack-create-app`, `webstack-deploy`, and `webstack-db`. Add the lowercase
caller repository `huangyingting/eduloop` to Webstack's
`github_repositories` Terraform variable, apply the infrastructure, and obtain
the repository-specific client ID from `deployment.GITHUB_CLIENT_IDS`.

Create the app once on the VM:

```bash
sudo webstack-create-app eduloop eduloop.genisisiq.com \
  --container-port 3000 \
  --host-port 10001
```

This creates the isolated `app_eduloop` role/database, Caddy route,
`webstack-apps` network attachment, and root-only
`/data/apps/eduloop/app.env`. Preserve the generated database settings and add
the EduLoop production settings:

```dotenv
DATABASE_URL=******172.30.0.1:5432/app_eduloop?schema=public&sslmode=require&connection_limit=8&pool_timeout=10&connect_timeout=5
EDULOOP_DATABASE_PROVIDER=postgresql
AUTH_SECRET=generated-high-entropy-secret
AUTH_URL=https://eduloop.genisisiq.com
TRUSTED_PROXY_HOPS=1
EDULOOP_PRIVATE_DEPLOYMENT=true
PORT=3000
```

`APP_VERSION` is maintained automatically from the immutable image tag. Do not
store the administrator bootstrap password in `app.env`.

The generated Compose service must expose `127.0.0.1:10001:3000`, join the
external `webstack-apps` network, and provide an `/api/health` healthcheck.

## GitHub production environment

Create a protected `production` environment in EduLoop and configure the
values emitted by Webstack Terraform:

| Variable | Value |
| --- | --- |
| `AZURE_CLIENT_ID` | `deployment.GITHUB_CLIENT_IDS["huangyingting/eduloop"]` |
| `AZURE_TENANT_ID` | Webstack `AZURE_TENANT_ID` |
| `AZURE_SUBSCRIPTION_ID` | Webstack `AZURE_SUBSCRIPTION_ID` |
| `AZURE_RESOURCE_GROUP` | Webstack resource group |
| `AZURE_VM_NAME` | Webstack VM name |
| `VM_APP_NAME` | `eduloop` |

Set the repository variable `VM_DEPLOY_ENABLED=true` only after those values
are present. The reusable workflow uses short-lived GitHub OIDC credentials;
EduLoop no longer needs `VM_HOST`, `VM_USER`, `VM_SSH_PRIVATE_KEY`,
`VM_KNOWN_HOSTS`, `VM_DEPLOY_PATH`, `VM_SSH_PORT`, `VM_APP_DOMAIN`,
`VM_APP_PORT`, or `VM_APP_ENV`.

If the GHCR packages are private, authenticate the VM's root Docker client once
with a narrowly scoped `read:packages` token as documented by Webstack.

## Deployment behavior

`.github/workflows/deploy-vm.yml` runs after a successful `CI` push to `main`
or by manual dispatch. It delegates to the SHA-pinned reusable workflow with:

- `mode: deploy-webapp`;
- the exact CI commit as `ref`;
- `Dockerfile.ops` as the transient operations image;
- `npm run db:deploy:postgres && npm run db:seed` before activation;
- `APP_VERSION` synchronized from the immutable image tag.

Webstack builds both linux/amd64 images, uses Azure Run Command instead of
inbound GitHub-runner SSH, executes migrations and seed data with the
application's root-only database environment, and calls `webstack-deploy` only
after those operations succeed. Compose keeps the prior image available and
rolls back if the new container does not become healthy. Database migrations
are not reversed by image rollback, so schema changes must remain
backward-compatible.

## Administrator and verification

Create the initial verified administrator once with the operations image and
transient `BOOTSTRAP_USER_EMAIL` and `BOOTSTRAP_USER_PASSWORD` variables. The
command refuses to overwrite a non-admin and never prints the password:

```bash
npm run users:bootstrap
```

After deployment, verify:

```bash
curl --fail https://eduloop.genisisiq.com/api/live
curl --fail https://eduloop.genisisiq.com/api/health
npm run smoke:deployment -- https://eduloop.genisisiq.com
```

Also confirm the administrator can sign in and access `/studio`, and that
public registration returns `403` in private deployment mode.
