# Webstack VM deployment

This deployment path targets the Azure VM created by the sibling `webstack` infrastructure repository. It uses that VM's native Caddy, `webstack-apps` Docker network, `/data/apps` layout, per-application PostgreSQL isolation, deployment lock, and rollback helper.

GitHub Actions publishes immutable application and operations images to GitHub Container Registry, connects with the provided `webstack.pem`, creates the EduLoop app and database once, applies migrations and seed data, preflights readiness, then delegates the final Compose update to `webstack-deploy`.

## Architecture

```text
GitHub Actions
  -> ghcr.io/OWNER/eduloop:{commit}
  -> ghcr.io/OWNER/eduloop-ops:{commit}
  -> SSH port 22222 with verified host key
  -> sudo webstack-create-app eduloop DOMAIN --container-port 3000 --host-port 10001
  -> dedicated app_eduloop PostgreSQL role and database
  -> migrations and idempotent catalog seed on webstack-apps
  -> candidate /api/health readiness
  -> sudo webstack-deploy eduloop IMAGE

Internet -> Caddy HTTPS -> 127.0.0.1:10001 -> EduLoop container
EduLoop container -> 172.30.0.1:5432 -> native PostgreSQL
```

The workflow never deploys a second PostgreSQL server and never uses a database administrator credential. `webstack-create-app` creates a random, non-superuser role and a dedicated database, stores the credentials only in `/data/apps/eduloop/app.env`, and preserves every other webapp.

## GitHub configuration

The `VM_SSH_PRIVATE_KEY` repository secret can be populated directly from `webstack.pem`; never commit the PEM. The repository already ignores `*.pem`.

Create a protected GitHub Environment named `production`. Set these secrets:

| Name | Value |
| --- | --- |
| `VM_HOST` | `PUBLIC_IP` from `terraform output -json deployment` |
| `VM_USER` | `SSH_USER` from the same output, normally `azadmin` |
| `VM_SSH_PRIVATE_KEY` | Complete contents of `webstack.pem` |
| `VM_KNOWN_HOSTS` | Verified host-key line for the VM and SSH port |
| `VM_APP_ENV` | EduLoop application secrets, excluding database and fixed runtime values |

Obtain the host key from the VM/provider console or another trusted channel and compare its fingerprint before saving it. Do not disable `StrictHostKeyChecking`.

```bash
ssh-keyscan -p 22222 -H VM_PUBLIC_IP > vm_known_hosts
ssh-keygen -lf vm_known_hosts
```

Set repository variables:

| Name | Default | Purpose |
| --- | --- | --- |
| `VM_DEPLOY_ENABLED` | unset | Must be exactly `true` before deployment runs |
| `VM_SSH_PORT` | `22222` | Webstack SSH port |
| `VM_DEPLOY_PATH` | `.eduloop` | Temporary deployment directory in the SSH user's home |
| `VM_APP_NAME` | `eduloop` | Webstack app identifier |
| `VM_APP_DOMAIN` | required | Lowercase public DNS hostname whose A record points to the VM |
| `VM_APP_PORT` | `10001` | Unique loopback port allocated to EduLoop |

`VM_APP_ENV` contains only application-level production settings. Do not include `DATABASE_URL`, `PG*`, `APP_VERSION`, `PORT`, `NODE_ENV`, or `EDULOOP_DATABASE_PROVIDER`; the VM deployment script derives and protects those values.

```dotenv
AUTH_SECRET=generated-with-npx-auth-secret
AUTH_URL=https://learn.example.com
TRUSTED_PROXY_HOPS=1
RESEND_API_KEY=re_...
AUTH_EMAIL_FROM=EduLoop <accounts@example.com>
LEGAL_ENTITY_NAME=Your legal entity
LEGAL_CONTACT_EMAIL=privacy@example.com
LEGAL_JURISDICTION=Your governing law and venue
```

Add complete OAuth provider pairs only when enabled. `AUTH_URL` must equal `https://VM_APP_DOMAIN`.

For an operator-managed private deployment with pre-created accounts, set
`EDULOOP_PRIVATE_DEPLOYMENT=true`. This disables public registration and permits
the email-provider and public legal-identity settings above to be omitted. Create
the initial account from the operations image with `BOOTSTRAP_USER_EMAIL`,
`BOOTSTRAP_USER_PASSWORD`, and `npm run users:bootstrap`; the command creates a
verified administrator once and never prints or resets its password.

## One-time infrastructure checks

The Webstack VM must already pass its own deployment checks:

```bash
ssh -p 22222 azadmin@VM_PUBLIC_IP
sudo systemctl is-active docker caddy postgresql
sudo docker network inspect webstack-apps
sudo test -x /usr/local/sbin/webstack-create-app
sudo test -x /usr/local/sbin/webstack-deploy
```

PostgreSQL on Ubuntu enables TLS and Webstack listens on `172.30.0.1` for the fixed Docker subnet. EduLoop rewrites its generated connection URL with `sslmode=require`, an eight-connection pool, and bounded pool/connect timeouts. Confirm total pools for every hosted application plus migration/operator reserve remain below Webstack's PostgreSQL `max_connections`.

Choose a unique `VM_APP_PORT`; Webstack rejects ports or domains already assigned in `/data/apps`. Point the selected domain's A record at the VM before the first deployment so Caddy can obtain its certificate.

## Deployment behavior

`.github/workflows/deploy-vm.yml` runs automatically after a successful `CI` push to `main`, or manually for a selected ref. It remains skipped until `VM_DEPLOY_ENABLED=true`.

On the first run, `scripts/deploy-vm.sh` calls `webstack-create-app`, which creates:

```text
/data/apps/eduloop/
├── app.env
├── app.json
├── compose.yml
└── image.env
```

The script preserves the generated database credentials, adds the production EduLoop environment, and writes a hardened Compose service with a 1 GiB memory limit, dropped capabilities, `no-new-privileges`, a 30-second stop grace period, bounded logs, loopback-only publication, and `/api/health` readiness.

Each deployment:

1. takes Webstack's per-app deployment lock;
2. pulls commit-addressed app and operations images;
3. validates the complete production environment;
4. applies only EduLoop's PostgreSQL migrations;
5. optionally synchronizes the idempotent bundled catalog;
6. starts an unpublished candidate on `webstack-apps` and requires readiness;
7. calls `webstack-deploy`, which performs the Compose update and rollback;
8. restores the prior EduLoop environment and image if the update fails.

The current release stays online during image pulls, migrations, seed synchronization, and candidate preflight. The final single-replica Compose update is not zero-downtime. Database migrations are not reversed by a container rollback, so take a verified Webstack Blob backup and review migration backward compatibility before release.

The active app/database environment remains root-only at `/data/apps/eduloop/app.env`. The workflow removes its temporary uploaded environment and logs out the root Docker client from GHCR after each attempt.

## First deployment and verification

Configure the domain, secrets, and variables while leaving `VM_DEPLOY_ENABLED` unset. Run the repository validation suite, set the variable to `true`, and manually start **Deploy VM**. After Caddy serves the release, verify externally:

```bash
npm run smoke:deployment -- https://learn.example.com
```

Complete email, OAuth, backup/restore, capacity, monitoring, and launch-evidence gates in `docs/production-readiness.md`. Subsequent successful `main` CI runs deploy automatically.
