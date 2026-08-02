# Azure deployment

This deployment path runs EduLoop on Azure Container Apps and Azure Database for PostgreSQL Flexible Server. It defaults to the `southeastasia` region, a `Standard_B1ms` Burstable database with 32 GiB of storage, and a Container Apps consumption-only environment.

## What the script creates

- one resource group in Southeast Asia;
- one Basic Azure Container Registry;
- one Key Vault for generated PostgreSQL and Auth.js secrets plus the Resend API key;
- one user-assigned identity with `AcrPull` only;
- one PostgreSQL Flexible Server B1ms instance, the `eduloop` database, and a restricted application role;
- one manual Container Apps release job for migrations and optional catalog seeding;
- one public Container App that scales from zero to two replicas by default;
- one scheduled Container Apps job that runs expired-security-artifact cleanup every hour in UTC.

The script builds immutable application and operations images in ACR. It waits for migrations, seeding, application-role grants, and a first cleanup execution before deploying and smoke-testing the public release. A failed release job stops the deployment before application traffic moves to the new image. Explicit HTTP probes use `/api/live` for startup and liveness, and `/api/health` for readiness, so a database outage removes a replica from traffic without turning dependency failure into a restart loop.

## Configure

Install Azure CLI, Node.js 24, npm 11, OpenSSL, and curl. Sign in to the intended Azure tenant and select the intended subscription. The deploying identity needs permission to create resources and role assignments in the target resource group or subscription.

Create the ignored local override, then replace its placeholders:

```bash
cp .env.azure.example .env.azure.local
```

- `AZURE_RESEND_API_KEY` with a real Resend API key;
- `AZURE_AUTH_EMAIL_FROM` with a sender on a verified domain;
- `AZURE_LEGAL_ENTITY_NAME`;
- `AZURE_LEGAL_CONTACT_EMAIL`;
- `AZURE_LEGAL_JURISDICTION`.

Set `AZURE_SUBSCRIPTION_ID` when the current Azure CLI subscription is not the intended target. The default resource names include a deterministic hash of the subscription and resource group, so rerunning the script targets the same resources.

The script generates the PostgreSQL administrator password, restricted application-role password, and Auth.js secret on the first run. It stores them in Key Vault and reuses them on subsequent runs. Do not copy them into the repository. If adopting an existing PostgreSQL server or Container App without the expected Key Vault secrets, provide the current value through the corresponding commented `AZURE_*` variable for one deployment.

## Preview and deploy

Preview the resolved names without creating resources:

```bash
npm run deploy:azure -- --plan
```

Deploy the initial release, including the bundled question catalog:

```bash
npm run deploy:azure
```

For an application-only update that does not change bundled content, skip the idempotent catalog seed:

```bash
npm run deploy:azure -- --skip-seed
```

A successful run prints the public HTTPS origin and resource names, but never secret values. The first deployment takes longer because it creates PostgreSQL and builds both container images remotely.

## Cost controls

The defaults deliberately minimize recurring cost:

- `Standard_B1ms`, 32 GiB storage, seven-day backup retention, no HA, no geo-redundant backup, and storage autogrow disabled;
- Container Apps `minReplicas=0`, `maxReplicas=2`;
- 0.5 vCPU/1 GiB for the web app and 0.25 vCPU/0.5 GiB for cleanup;
- Container Apps environment logs destination `none` to avoid automatically creating Log Analytics.

ACR Basic and PostgreSQL are recurring paid resources even when the app scales to zero. Set an Azure budget and alerts before deployment. Storage autogrow is disabled to prevent an unbounded bill; alert on database storage utilization and deliberately resize before it fills.

For retained production logs, set `AZURE_LOGS_DESTINATION="log-analytics"` before the environment is first created. Log ingestion and retention are separately billable. Changing this variable after the environment exists does not silently reconfigure the existing environment.

## Networking and security boundary

The cost-minimized default creates PostgreSQL with the Azure-services firewall rule (`0.0.0.0`). The database is not open to arbitrary internet addresses, but resources in other Azure tenants can reach its login endpoint. TLS, strong generated credentials, and the restricted application role remain mandatory controls. The application role has DML access to application tables but only read access to `_prisma_migrations`; migrations retain the administrator credential in the release job only.

For a stronger production boundary, place Container Apps and PostgreSQL in a VNet with private DNS instead of using the Azure-services firewall rule. That topology is intentionally not created by this low-cost script because subnet sizing, DNS ownership, private egress, and recovery access need deployment-specific decisions.

The default Container Apps hostname is used as `AUTH_URL`. Bind and verify a custom domain first, then set `AZURE_PUBLIC_ORIGIN` to its path-free HTTPS origin and rerun the deployment. Keep `TRUSTED_PROXY_HOPS=1` unless another trusted CDN is added in front of Azure ingress.

## Operations

Container Apps scheduled-job cron expressions use UTC. The cleanup job runs at minute zero of every hour. Configure a dead-man alert if no `expired_security_artifact_cleanup_completed` event is observed for two hours once retained logs are enabled.

Useful resource checks:

```bash
az containerapp show --resource-group eduloop-prod-sea --name eduloop --output table
az containerapp job execution list --resource-group eduloop-prod-sea --name eduloop-release --output table
az containerapp job execution list --resource-group eduloop-prod-sea --name eduloop-cleanup --output table
az postgres flexible-server show --resource-group eduloop-prod-sea --name POSTGRES_SERVER_NAME --output table
```

The script already runs `/api/health` and the repository deployment smoke journey. Before organizational launch, complete the email, OAuth (when enabled), capacity, backup-restore, monitoring, and launch-evidence procedures in [`operations.md`](./operations.md). B1ms is a Burstable development/MVP tier; monitor CPU credits and move to General Purpose before sustained production traffic.
