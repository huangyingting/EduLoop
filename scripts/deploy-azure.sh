#!/usr/bin/env bash
set -Eeuo pipefail
IFS=$'\n\t'

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${AZURE_DEPLOY_ENV_FILE:-$ROOT_DIR/.env.azure.local}"

if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

PLAN_ONLY=0
SEED_CATALOG="${AZURE_SEED_CATALOG:-1}"

usage() {
  cat <<'EOF'
Usage: npm run deploy:azure -- [--plan] [--skip-seed]

Creates or updates EduLoop on Azure Container Apps with Azure Database for
PostgreSQL Flexible Server B1ms in Southeast Asia by default.

Options:
  --plan       Show resolved resource names without changing Azure.
  --skip-seed  Apply migrations but skip the question-catalog seed.
  --help       Show this help.

Configuration is loaded from .env.azure.local by default. Set
AZURE_DEPLOY_ENV_FILE to use another shell-compatible Azure configuration file.
EOF
}

while (($# > 0)); do
  case "$1" in
    --plan)
      PLAN_ONLY=1
      ;;
    --skip-seed)
      SEED_CATALOG=0
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      printf 'Unknown option: %s\n' "$1" >&2
      usage >&2
      exit 2
      ;;
  esac
  shift
done

log() {
  printf '[azure-deploy] %s\n' "$*" >&2
}

warn() {
  printf '[azure-deploy] WARNING: %s\n' "$*" >&2
}

die() {
  printf '[azure-deploy] ERROR: %s\n' "$*" >&2
  exit 1
}

on_error() {
  local exit_code=$?
  local line_number=$1
  trap - ERR
  printf '[azure-deploy] ERROR: deployment stopped near line %s (exit %s). No secret values were printed.\n' \
    "$line_number" "$exit_code" >&2
  exit "$exit_code"
}
trap 'on_error "$LINENO"' ERR

require_command() {
  command -v "$1" >/dev/null 2>&1 || die "Required command '$1' is not installed."
}

is_placeholder() {
  local value="${1:-}"
  local lowered="${value,,}"
  [[ -z "$value" \
    || "$lowered" == *"replace"* \
    || "$lowered" == *"placeholder"* \
    || "$lowered" == *"example.com"* \
    || "$lowered" == *"your legal"* \
    || "$lowered" == *"your governing"* ]]
}

require_deployment_value() {
  local name=$1
  local value="${2:-}"
  is_placeholder "$value" && die "$name must be set to a real production value in $ENV_FILE."
}

valid_resend_key() {
  [[ "${1:-}" =~ ^re_[A-Za-z0-9_-]{8,}$ ]] && ! is_placeholder "$1"
}

valid_auth_secret() {
  AUTH_SECRET_CANDIDATE="${1:-}" node -e '
    const value = process.env.AUTH_SECRET_CANDIDATE ?? "";
    process.exit(value.length >= 43 && value.length <= 512 && !/\s/.test(value) && new Set(value).size >= 16 ? 0 : 1);
  '
}

generate_password() {
  printf 'Aa1_%s' "$(openssl rand -hex 24)"
}

generate_auth_secret() {
  openssl rand -base64 64 | tr -d '\n' | tr '+/' '-_'
}

urlencode() {
  URLENCODE_VALUE="$1" node -e 'process.stdout.write(encodeURIComponent(process.env.URLENCODE_VALUE ?? ""));'
}

resource_exists() {
  "$@" >/dev/null 2>&1
}

key_vault_secret_exists() {
  az keyvault secret show --vault-name "$KEY_VAULT_NAME" --name "$1" \
    --only-show-errors --output none >/dev/null 2>&1
}

resolve_secret() {
  local secret_name=$1
  local candidate="${2:-}"
  local kind=$3
  local preserve_required=$4
  local value

  if key_vault_secret_exists "$secret_name"; then
    az keyvault secret show --vault-name "$KEY_VAULT_NAME" --name "$secret_name" \
      --query value --output tsv --only-show-errors
    return
  fi

  case "$kind" in
    password)
      if [[ "$preserve_required" = "1" && -z "$candidate" ]]; then
        die "Key Vault is missing $secret_name for an existing resource; provide the matching value in $ENV_FILE."
      fi
      value="${candidate:-$(generate_password)}"
      ;;
    auth)
      if [[ -n "$candidate" ]] && valid_auth_secret "$candidate"; then
        value="$candidate"
      elif [[ "$preserve_required" = "1" ]]; then
        die "Key Vault is missing $secret_name for the existing app; provide its current AUTH_SECRET in $ENV_FILE."
      else
        value="$(generate_auth_secret)"
      fi
      ;;
    resend)
      valid_resend_key "$candidate" || die "RESEND_API_KEY must be provided before the first deployment."
      value="$candidate"
      ;;
    *)
      die "Unknown secret kind: $kind"
      ;;
  esac

  az keyvault secret set --vault-name "$KEY_VAULT_NAME" --name "$secret_name" \
    --value "$value" --only-show-errors --output none
  printf '%s' "$value"
}

wait_for_job_execution() {
  local job_name=$1
  local execution_name=$2
  local timeout_seconds=$3
  local deadline=$((SECONDS + timeout_seconds))
  local status

  while ((SECONDS < deadline)); do
    status="$(az containerapp job execution show \
      --name "$job_name" \
      --resource-group "$RESOURCE_GROUP" \
      --job-execution-name "$execution_name" \
      --query properties.status \
      --output tsv \
      --only-show-errors 2>/dev/null || true)"

    case "${status,,}" in
      succeeded)
        log "Job $job_name execution $execution_name succeeded."
        return 0
        ;;
      failed|stopped|degraded)
        warn "Job $job_name execution $execution_name ended with status ${status:-unknown}."
        az containerapp job execution show \
          --name "$job_name" \
          --resource-group "$RESOURCE_GROUP" \
          --job-execution-name "$execution_name" \
          --output table \
          --only-show-errors >&2 || true
        return 1
        ;;
    esac
    sleep 10
  done

  warn "Timed out waiting for job $job_name execution $execution_name."
  return 1
}

start_and_wait_for_job() {
  local job_name=$1
  local timeout_seconds=$2
  local execution_name

  execution_name="$(az containerapp job start \
    --name "$job_name" \
    --resource-group "$RESOURCE_GROUP" \
    --query name \
    --output tsv \
    --only-show-errors)"
  [[ -n "$execution_name" ]] || die "Azure did not return an execution name for job $job_name."
  log "Started job $job_name execution $execution_name."
  wait_for_job_execution "$job_name" "$execution_name" "$timeout_seconds"
}

configure_health_probes() {
  local template_file
  local patch_file
  local app_resource_id
  local probe_count
  local readiness_path

  template_file="$(mktemp)"
  patch_file="$(mktemp)"
  az containerapp show \
    --name "$APP_NAME" \
    --resource-group "$RESOURCE_GROUP" \
    --query properties.template \
    --output json \
    --only-show-errors >"$template_file"

  PROBE_TEMPLATE_FILE="$template_file" PROBE_PATCH_FILE="$patch_file" node <<'NODE'
const { readFileSync, writeFileSync } = require("node:fs");

const template = JSON.parse(readFileSync(process.env.PROBE_TEMPLATE_FILE, "utf8"));
if (!Array.isArray(template.containers) || !template.containers[0]) {
  throw new Error("Container App template has no main container.");
}

template.containers[0].probes = [
  {
    type: "Startup",
    httpGet: { path: "/api/live", port: 3000, scheme: "HTTP" },
    initialDelaySeconds: 1,
    periodSeconds: 1,
    timeoutSeconds: 3,
    failureThreshold: 240,
    successThreshold: 1,
  },
  {
    type: "Liveness",
    httpGet: { path: "/api/live", port: 3000, scheme: "HTTP" },
    initialDelaySeconds: 10,
    periodSeconds: 10,
    timeoutSeconds: 3,
    failureThreshold: 3,
    successThreshold: 1,
  },
  {
    type: "Readiness",
    httpGet: { path: "/api/health", port: 3000, scheme: "HTTP" },
    initialDelaySeconds: 10,
    periodSeconds: 15,
    timeoutSeconds: 10,
    failureThreshold: 2,
    successThreshold: 1,
  },
];

writeFileSync(
  process.env.PROBE_PATCH_FILE,
  JSON.stringify({ properties: { template } }),
  { mode: 0o600 },
);
NODE

  app_resource_id="$(az containerapp show \
    --name "$APP_NAME" \
    --resource-group "$RESOURCE_GROUP" \
    --query id \
    --output tsv \
    --only-show-errors)"
  az rest \
    --method patch \
    --url "https://management.azure.com${app_resource_id}?api-version=2025-07-01" \
    --headers Content-Type=application/json \
    --body "$(cat "$patch_file")" \
    --only-show-errors \
    --output none
  rm -f "$template_file" "$patch_file"

  for _ in {1..30}; do
    probe_count="$(az containerapp show \
      --name "$APP_NAME" \
      --resource-group "$RESOURCE_GROUP" \
      --query 'length(properties.template.containers[0].probes)' \
      --output tsv \
      --only-show-errors)"
    readiness_path="$(az containerapp show \
      --name "$APP_NAME" \
      --resource-group "$RESOURCE_GROUP" \
      --query "properties.template.containers[0].probes[?type == 'Readiness'].httpGet.path | [0]" \
      --output tsv \
      --only-show-errors)"
    if [[ "$probe_count" = "3" && "$readiness_path" = "/api/health" ]]; then
      return 0
    fi
    sleep 2
  done
  die "Azure did not persist the expected health probes."
}

require_command az
require_command curl
require_command mktemp
require_command node
require_command openssl
require_command sha256sum

az account show --only-show-errors >/dev/null 2>&1 \
  || die "Azure CLI is not logged in. Run 'az login' first."

if [[ -n "${AZURE_SUBSCRIPTION_ID:-}" ]]; then
  az account set --subscription "$AZURE_SUBSCRIPTION_ID" --only-show-errors
fi
SUBSCRIPTION_ID="$(az account show --query id --output tsv --only-show-errors)"

LOCATION="${AZURE_LOCATION:-southeastasia}"
RESOURCE_GROUP="${AZURE_RESOURCE_GROUP:-eduloop-prod-sea}"
APP_NAME="${AZURE_CONTAINER_APP_NAME:-eduloop}"
CONTAINER_ENV_NAME="${AZURE_CONTAINER_ENV_NAME:-eduloop-sea}"
RELEASE_JOB_NAME="${AZURE_RELEASE_JOB_NAME:-eduloop-release}"
CLEANUP_JOB_NAME="${AZURE_CLEANUP_JOB_NAME:-eduloop-cleanup}"
IDENTITY_NAME="${AZURE_IDENTITY_NAME:-eduloop-containers}"
POSTGRES_ADMIN_USER="${AZURE_POSTGRES_ADMIN_USER:-eduloopadmin}"
POSTGRES_APP_USER="${AZURE_POSTGRES_APP_USER:-eduloop_app}"
POSTGRES_DATABASE="${AZURE_POSTGRES_DATABASE:-eduloop}"
POSTGRES_VERSION="${AZURE_POSTGRES_VERSION:-16}"
APP_MIN_REPLICAS="${AZURE_MIN_REPLICAS:-0}"
APP_MAX_REPLICAS="${AZURE_MAX_REPLICAS:-2}"
APP_CPU="${AZURE_APP_CPU:-0.5}"
APP_MEMORY="${AZURE_APP_MEMORY:-1.0Gi}"
LOGS_DESTINATION="${AZURE_LOGS_DESTINATION:-none}"
DEPLOY_AUTH_SECRET="${AZURE_AUTH_SECRET:-${AUTH_SECRET:-}}"
DEPLOY_RESEND_API_KEY="${AZURE_RESEND_API_KEY:-${RESEND_API_KEY:-}}"
DEPLOY_AUTH_EMAIL_FROM="${AZURE_AUTH_EMAIL_FROM:-${AUTH_EMAIL_FROM:-}}"
DEPLOY_LEGAL_ENTITY_NAME="${AZURE_LEGAL_ENTITY_NAME:-${LEGAL_ENTITY_NAME:-}}"
DEPLOY_LEGAL_CONTACT_EMAIL="${AZURE_LEGAL_CONTACT_EMAIL:-${LEGAL_CONTACT_EMAIL:-}}"
DEPLOY_LEGAL_JURISDICTION="${AZURE_LEGAL_JURISDICTION:-${LEGAL_JURISDICTION:-}}"

if [[ -n "${AZURE_NAME_SUFFIX:-}" ]]; then
  NAME_SUFFIX="${AZURE_NAME_SUFFIX,,}"
else
  NAME_SUFFIX="$(printf '%s' "$SUBSCRIPTION_ID/$RESOURCE_GROUP" | sha256sum | cut -c1-8)"
fi

ACR_NAME="${AZURE_ACR_NAME:-eduloop${NAME_SUFFIX}}"
POSTGRES_SERVER_NAME="${AZURE_POSTGRES_SERVER_NAME:-eduloop-pg-${NAME_SUFFIX}}"
KEY_VAULT_NAME="${AZURE_KEY_VAULT_NAME:-eduloop-kv-${NAME_SUFFIX}}"

if [[ -n "${AZURE_APP_VERSION:-}" ]]; then
  APP_VERSION="$AZURE_APP_VERSION"
else
  GIT_SHA="local"
  if command -v git >/dev/null 2>&1 && git -C "$ROOT_DIR" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    GIT_SHA="$(git -C "$ROOT_DIR" rev-parse --short=12 HEAD)"
  fi
  APP_VERSION="$(date -u +%Y%m%d%H%M%S)-${GIT_SHA}"
fi

[[ "$NAME_SUFFIX" =~ ^[a-z0-9]{4,16}$ ]] || die "AZURE_NAME_SUFFIX must be 4-16 lowercase letters or numbers."
[[ "$ACR_NAME" =~ ^[a-z0-9]{5,50}$ ]] || die "AZURE_ACR_NAME must be 5-50 lowercase letters or numbers."
[[ "$POSTGRES_SERVER_NAME" =~ ^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$ ]] || die "Invalid PostgreSQL server name."
[[ "$KEY_VAULT_NAME" =~ ^[a-zA-Z][a-zA-Z0-9-]{1,22}[a-zA-Z0-9]$ ]] || die "Invalid Key Vault name."
[[ "$APP_NAME" =~ ^[a-z][a-z0-9-]{0,29}[a-z0-9]$ ]] || die "Invalid Container App name."
[[ "$RELEASE_JOB_NAME" =~ ^[a-z][a-z0-9-]{0,29}[a-z0-9]$ ]] || die "Invalid release job name."
[[ "$CLEANUP_JOB_NAME" =~ ^[a-z][a-z0-9-]{0,29}[a-z0-9]$ ]] || die "Invalid cleanup job name."
[[ "$POSTGRES_ADMIN_USER" =~ ^[A-Za-z][A-Za-z0-9]{0,62}$ ]] || die "AZURE_POSTGRES_ADMIN_USER must contain only letters and numbers."
[[ "$POSTGRES_APP_USER" =~ ^[a-z_][a-z0-9_]{0,62}$ ]] || die "AZURE_POSTGRES_APP_USER must be a safe PostgreSQL identifier."
[[ "$POSTGRES_DATABASE" =~ ^[a-z_][a-z0-9_]{0,62}$ ]] || die "AZURE_POSTGRES_DATABASE must be a safe PostgreSQL identifier."
[[ "$APP_VERSION" =~ ^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$ ]] || die "AZURE_APP_VERSION is not a safe release identifier."
[[ "$SEED_CATALOG" = "0" || "$SEED_CATALOG" = "1" ]] || die "AZURE_SEED_CATALOG must be 0 or 1."
[[ "$APP_MIN_REPLICAS" =~ ^[0-9]+$ && "$APP_MAX_REPLICAS" =~ ^[0-9]+$ ]] || die "Replica counts must be integers."
((APP_MIN_REPLICAS <= APP_MAX_REPLICAS)) || die "AZURE_MIN_REPLICAS cannot exceed AZURE_MAX_REPLICAS."
case "$LOGS_DESTINATION" in
  none|log-analytics|azure-monitor) ;;
  *) die "AZURE_LOGS_DESTINATION must be none, log-analytics, or azure-monitor." ;;
esac

APP_IMAGE_REPOSITORY="eduloop-app"
OPS_IMAGE_REPOSITORY="eduloop-ops"
APP_IMAGE="$ACR_NAME.azurecr.io/$APP_IMAGE_REPOSITORY:$APP_VERSION"
OPS_IMAGE="$ACR_NAME.azurecr.io/$OPS_IMAGE_REPOSITORY:$APP_VERSION"

cat >&2 <<EOF
[azure-deploy] Deployment plan
  subscription:       $SUBSCRIPTION_ID
  region:             $LOCATION
  resource group:     $RESOURCE_GROUP
  PostgreSQL:         $POSTGRES_SERVER_NAME (Standard_B1ms, 32 GiB)
  Container Apps env: $CONTAINER_ENV_NAME
  app:                $APP_NAME ($APP_MIN_REPLICAS-$APP_MAX_REPLICAS replicas)
  registry:           $ACR_NAME (Basic)
  Key Vault:          $KEY_VAULT_NAME
  release:            $APP_VERSION
  seed catalog:       $SEED_CATALOG
  logs destination:   $LOGS_DESTINATION
EOF

if [[ "$PLAN_ONLY" = "1" ]]; then
  exit 0
fi

require_deployment_value AZURE_AUTH_EMAIL_FROM "$DEPLOY_AUTH_EMAIL_FROM"
require_deployment_value AZURE_LEGAL_ENTITY_NAME "$DEPLOY_LEGAL_ENTITY_NAME"
require_deployment_value AZURE_LEGAL_CONTACT_EMAIL "$DEPLOY_LEGAL_CONTACT_EMAIL"
require_deployment_value AZURE_LEGAL_JURISDICTION "$DEPLOY_LEGAL_JURISDICTION"

log "Installing or updating the Azure Container Apps CLI extension."
az extension add --name containerapp --upgrade --yes --only-show-errors --output none

for provider in \
  Microsoft.App \
  Microsoft.ContainerRegistry \
  Microsoft.DBforPostgreSQL \
  Microsoft.KeyVault \
  Microsoft.ManagedIdentity; do
  log "Registering resource provider $provider."
  az provider register --namespace "$provider" --wait --only-show-errors --output none
done

log "Creating resource group and Key Vault when absent."
az group create --name "$RESOURCE_GROUP" --location "$LOCATION" \
  --tags application=EduLoop environment=production managed-by=deploy-azure \
  --only-show-errors --output none

if ! resource_exists az keyvault show --name "$KEY_VAULT_NAME" --resource-group "$RESOURCE_GROUP" --only-show-errors; then
  az keyvault create \
    --name "$KEY_VAULT_NAME" \
    --resource-group "$RESOURCE_GROUP" \
    --location "$LOCATION" \
    --enable-rbac-authorization false \
    --retention-days 7 \
    --only-show-errors \
    --output none
fi

POSTGRES_EXISTS=0
APP_EXISTS=0
resource_exists az postgres flexible-server show --name "$POSTGRES_SERVER_NAME" --resource-group "$RESOURCE_GROUP" --only-show-errors \
  && POSTGRES_EXISTS=1
resource_exists az containerapp show --name "$APP_NAME" --resource-group "$RESOURCE_GROUP" --only-show-errors \
  && APP_EXISTS=1

log "Resolving deployment secrets from Key Vault."
POSTGRES_ADMIN_PASSWORD="$(resolve_secret postgres-admin-password "${AZURE_POSTGRES_ADMIN_PASSWORD:-}" password "$POSTGRES_EXISTS")"
POSTGRES_APP_PASSWORD="$(resolve_secret postgres-app-password "${AZURE_POSTGRES_APP_PASSWORD:-}" password "$APP_EXISTS")"
AUTH_SECRET_VALUE="$(resolve_secret auth-secret "$DEPLOY_AUTH_SECRET" auth "$APP_EXISTS")"
RESEND_API_KEY_VALUE="$(resolve_secret resend-api-key "$DEPLOY_RESEND_API_KEY" resend "$APP_EXISTS")"

log "Creating Azure Container Registry and pull identity when absent."
if ! resource_exists az acr show --name "$ACR_NAME" --resource-group "$RESOURCE_GROUP" --only-show-errors; then
  az acr create \
    --name "$ACR_NAME" \
    --resource-group "$RESOURCE_GROUP" \
    --location "$LOCATION" \
    --sku Basic \
    --admin-enabled false \
    --only-show-errors \
    --output none
fi
ACR_ID="$(az acr show --name "$ACR_NAME" --resource-group "$RESOURCE_GROUP" --query id --output tsv --only-show-errors)"
ACR_LOGIN_SERVER="$(az acr show --name "$ACR_NAME" --resource-group "$RESOURCE_GROUP" --query loginServer --output tsv --only-show-errors)"

if ! resource_exists az identity show --name "$IDENTITY_NAME" --resource-group "$RESOURCE_GROUP" --only-show-errors; then
  az identity create \
    --name "$IDENTITY_NAME" \
    --resource-group "$RESOURCE_GROUP" \
    --location "$LOCATION" \
    --only-show-errors \
    --output none
fi
IDENTITY_ID="$(az identity show --name "$IDENTITY_NAME" --resource-group "$RESOURCE_GROUP" --query id --output tsv --only-show-errors)"
IDENTITY_PRINCIPAL_ID="$(az identity show --name "$IDENTITY_NAME" --resource-group "$RESOURCE_GROUP" --query principalId --output tsv --only-show-errors)"

ACR_PULL_ASSIGNMENTS="$(az role assignment list \
  --assignee-object-id "$IDENTITY_PRINCIPAL_ID" \
  --scope "$ACR_ID" \
  --role AcrPull \
  --query 'length(@)' \
  --output tsv \
  --only-show-errors)"
if [[ "$ACR_PULL_ASSIGNMENTS" = "0" ]]; then
  az role assignment create \
    --assignee-object-id "$IDENTITY_PRINCIPAL_ID" \
    --assignee-principal-type ServicePrincipal \
    --role AcrPull \
    --scope "$ACR_ID" \
    --only-show-errors \
    --output none
fi

log "Building application and operations images in ACR."
az acr build \
  --registry "$ACR_NAME" \
  --image "$APP_IMAGE_REPOSITORY:$APP_VERSION" \
  --file Dockerfile \
  --platform linux/amd64 \
  "$ROOT_DIR" \
  --only-show-errors \
  --output none
az acr build \
  --registry "$ACR_NAME" \
  --image "$OPS_IMAGE_REPOSITORY:$APP_VERSION" \
  --file Dockerfile.azure-ops \
  --platform linux/amd64 \
  "$ROOT_DIR" \
  --only-show-errors \
  --output none

log "Creating the Container Apps consumption environment when absent."
if ! resource_exists az containerapp env show --name "$CONTAINER_ENV_NAME" --resource-group "$RESOURCE_GROUP" --only-show-errors; then
  az containerapp env create \
    --name "$CONTAINER_ENV_NAME" \
    --resource-group "$RESOURCE_GROUP" \
    --location "$LOCATION" \
    --enable-workload-profiles false \
    --logs-destination "$LOGS_DESTINATION" \
    --tags application=EduLoop environment=production \
    --only-show-errors \
    --output none
fi
DEFAULT_DOMAIN="$(az containerapp env show \
  --name "$CONTAINER_ENV_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --query properties.defaultDomain \
  --output tsv \
  --only-show-errors)"
PUBLIC_ORIGIN="${AZURE_PUBLIC_ORIGIN:-https://$APP_NAME.$DEFAULT_DOMAIN}"
[[ "$PUBLIC_ORIGIN" =~ ^https://[^/]+$ ]] || die "AZURE_PUBLIC_ORIGIN must be one HTTPS origin without a path or trailing slash."

log "Creating PostgreSQL Flexible Server B1ms and database when absent."
if [[ "$POSTGRES_EXISTS" = "0" ]]; then
  az postgres flexible-server create \
    --name "$POSTGRES_SERVER_NAME" \
    --resource-group "$RESOURCE_GROUP" \
    --location "$LOCATION" \
    --admin-user "$POSTGRES_ADMIN_USER" \
    --admin-password "$POSTGRES_ADMIN_PASSWORD" \
    --sku-name Standard_B1ms \
    --tier Burstable \
    --version "$POSTGRES_VERSION" \
    --storage-size 32 \
    --storage-type Premium_LRS \
    --storage-auto-grow Disabled \
    --backup-retention 7 \
    --geo-redundant-backup Disabled \
    --zonal-resiliency Disabled \
    --public-access 0.0.0.0 \
    --tags application=EduLoop environment=production \
    --yes \
    --only-show-errors \
    --output none
fi

if ! resource_exists az postgres flexible-server db show \
  --server-name "$POSTGRES_SERVER_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --name "$POSTGRES_DATABASE" \
  --only-show-errors; then
  az postgres flexible-server db create \
    --server-name "$POSTGRES_SERVER_NAME" \
    --resource-group "$RESOURCE_GROUP" \
    --name "$POSTGRES_DATABASE" \
    --charset UTF8 \
    --only-show-errors \
    --output none
fi
POSTGRES_HOST="$(az postgres flexible-server show \
  --name "$POSTGRES_SERVER_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --query fullyQualifiedDomainName \
  --output tsv \
  --only-show-errors)"

ENCODED_ADMIN_PASSWORD="$(urlencode "$POSTGRES_ADMIN_PASSWORD")"
ENCODED_APP_PASSWORD="$(urlencode "$POSTGRES_APP_PASSWORD")"
POSTGRES_ADMIN_URL="postgresql://$POSTGRES_ADMIN_USER:$ENCODED_ADMIN_PASSWORD@$POSTGRES_HOST:5432/$POSTGRES_DATABASE?sslmode=require&connect_timeout=5"
ADMIN_DATABASE_URL="$POSTGRES_ADMIN_URL&schema=public&connection_limit=2&pool_timeout=10"
APP_DATABASE_URL="postgresql://$POSTGRES_APP_USER:$ENCODED_APP_PASSWORD@$POSTGRES_HOST:5432/$POSTGRES_DATABASE?schema=public&sslmode=require&connection_limit=4&pool_timeout=10&connect_timeout=5"

log "Validating the exact production environment before touching the schema."
NODE_ENV=production \
DATABASE_URL="$APP_DATABASE_URL" \
EDULOOP_DATABASE_PROVIDER=postgresql \
APP_VERSION="$APP_VERSION" \
AUTH_SECRET="$AUTH_SECRET_VALUE" \
AUTH_URL="$PUBLIC_ORIGIN" \
RESEND_API_KEY="$RESEND_API_KEY_VALUE" \
AUTH_EMAIL_FROM="$DEPLOY_AUTH_EMAIL_FROM" \
LEGAL_ENTITY_NAME="$DEPLOY_LEGAL_ENTITY_NAME" \
LEGAL_CONTACT_EMAIL="$DEPLOY_LEGAL_CONTACT_EMAIL" \
LEGAL_JURISDICTION="$DEPLOY_LEGAL_JURISDICTION" \
node "$ROOT_DIR/scripts/validate-environment.mjs"

RELEASE_ENV_VARS=(
  "NODE_ENV=production"
  "EDULOOP_DATABASE_PROVIDER=postgresql"
  "DATABASE_URL=secretref:database-url"
  "POSTGRES_ADMIN_URL=secretref:postgres-admin-url"
  "POSTGRES_APP_PASSWORD=secretref:postgres-app-password"
  "POSTGRES_APP_USER=$POSTGRES_APP_USER"
  "POSTGRES_DATABASE=$POSTGRES_DATABASE"
  "AZURE_SEED_CATALOG=$SEED_CATALOG"
  "APP_VERSION=$APP_VERSION"
)

log "Creating or updating the release migration job."
if resource_exists az containerapp job show --name "$RELEASE_JOB_NAME" --resource-group "$RESOURCE_GROUP" --only-show-errors; then
  az containerapp job secret set \
    --name "$RELEASE_JOB_NAME" \
    --resource-group "$RESOURCE_GROUP" \
    --secrets \
      "database-url=$ADMIN_DATABASE_URL" \
      "postgres-admin-url=$POSTGRES_ADMIN_URL" \
      "postgres-app-password=$POSTGRES_APP_PASSWORD" \
    --only-show-errors \
    --output none
  az containerapp job update \
    --name "$RELEASE_JOB_NAME" \
    --resource-group "$RESOURCE_GROUP" \
    --image "$OPS_IMAGE" \
    --cpu 0.5 \
    --memory 1.0Gi \
    --replica-timeout 1800 \
    --replica-retry-limit 0 \
    --parallelism 1 \
    --replica-completion-count 1 \
    --command /bin/sh \
    --args scripts/azure/release.sh \
    --replace-env-vars "${RELEASE_ENV_VARS[@]}" \
    --only-show-errors \
    --output none
else
  az containerapp job create \
    --name "$RELEASE_JOB_NAME" \
    --resource-group "$RESOURCE_GROUP" \
    --environment "$CONTAINER_ENV_NAME" \
    --trigger-type Manual \
    --image "$OPS_IMAGE" \
    --cpu 0.5 \
    --memory 1.0Gi \
    --replica-timeout 1800 \
    --replica-retry-limit 0 \
    --parallelism 1 \
    --replica-completion-count 1 \
    --command /bin/sh \
    --args scripts/azure/release.sh \
    --mi-user-assigned "$IDENTITY_ID" \
    --registry-server "$ACR_LOGIN_SERVER" \
    --registry-identity "$IDENTITY_ID" \
    --secrets \
      "database-url=$ADMIN_DATABASE_URL" \
      "postgres-admin-url=$POSTGRES_ADMIN_URL" \
      "postgres-app-password=$POSTGRES_APP_PASSWORD" \
    --env-vars "${RELEASE_ENV_VARS[@]}" \
    --tags application=EduLoop environment=production \
    --only-show-errors \
    --output none
fi
start_and_wait_for_job "$RELEASE_JOB_NAME" 2100

APP_ENV_VARS=(
  "NODE_ENV=production"
  "EDULOOP_DATABASE_PROVIDER=postgresql"
  "DATABASE_URL=secretref:database-url"
  "APP_VERSION=$APP_VERSION"
  "AUTH_SECRET=secretref:auth-secret"
  "AUTH_URL=$PUBLIC_ORIGIN"
  "RESEND_API_KEY=secretref:resend-api-key"
  "AUTH_EMAIL_FROM=$DEPLOY_AUTH_EMAIL_FROM"
  "LEGAL_ENTITY_NAME=$DEPLOY_LEGAL_ENTITY_NAME"
  "LEGAL_CONTACT_EMAIL=$DEPLOY_LEGAL_CONTACT_EMAIL"
  "LEGAL_JURISDICTION=$DEPLOY_LEGAL_JURISDICTION"
  "TRUSTED_PROXY_HOPS=1"
  "PORT=3000"
)

log "Creating or updating the public Container App."
if [[ "$APP_EXISTS" = "1" ]]; then
  az containerapp secret set \
    --name "$APP_NAME" \
    --resource-group "$RESOURCE_GROUP" \
    --secrets \
      "database-url=$APP_DATABASE_URL" \
      "auth-secret=$AUTH_SECRET_VALUE" \
      "resend-api-key=$RESEND_API_KEY_VALUE" \
    --only-show-errors \
    --output none
  az containerapp update \
    --name "$APP_NAME" \
    --resource-group "$RESOURCE_GROUP" \
    --image "$APP_IMAGE" \
    --cpu "$APP_CPU" \
    --memory "$APP_MEMORY" \
    --min-replicas "$APP_MIN_REPLICAS" \
    --max-replicas "$APP_MAX_REPLICAS" \
    --termination-grace-period 30 \
    --replace-env-vars "${APP_ENV_VARS[@]}" \
    --only-show-errors \
    --output none
else
  az containerapp create \
    --name "$APP_NAME" \
    --resource-group "$RESOURCE_GROUP" \
    --environment "$CONTAINER_ENV_NAME" \
    --image "$APP_IMAGE" \
    --cpu "$APP_CPU" \
    --memory "$APP_MEMORY" \
    --min-replicas "$APP_MIN_REPLICAS" \
    --max-replicas "$APP_MAX_REPLICAS" \
    --ingress external \
    --target-port 3000 \
    --transport auto \
    --allow-insecure false \
    --revisions-mode single \
    --termination-grace-period 30 \
    --user-assigned "$IDENTITY_ID" \
    --registry-server "$ACR_LOGIN_SERVER" \
    --registry-identity "$IDENTITY_ID" \
    --secrets \
      "database-url=$APP_DATABASE_URL" \
      "auth-secret=$AUTH_SECRET_VALUE" \
      "resend-api-key=$RESEND_API_KEY_VALUE" \
    --env-vars "${APP_ENV_VARS[@]}" \
    --tags application=EduLoop environment=production \
    --only-show-errors \
    --output none
fi

log "Configuring process and database-aware HTTP health probes."
configure_health_probes

CLEANUP_ENV_VARS=(
  "NODE_ENV=production"
  "EDULOOP_DATABASE_PROVIDER=postgresql"
  "DATABASE_URL=secretref:database-url"
  "APP_VERSION=$APP_VERSION"
)

log "Creating or updating the hourly cleanup job (UTC)."
if resource_exists az containerapp job show --name "$CLEANUP_JOB_NAME" --resource-group "$RESOURCE_GROUP" --only-show-errors; then
  az containerapp job secret set \
    --name "$CLEANUP_JOB_NAME" \
    --resource-group "$RESOURCE_GROUP" \
    --secrets "database-url=$APP_DATABASE_URL" \
    --only-show-errors \
    --output none
  az containerapp job update \
    --name "$CLEANUP_JOB_NAME" \
    --resource-group "$RESOURCE_GROUP" \
    --image "$OPS_IMAGE" \
    --cpu 0.25 \
    --memory 0.5Gi \
    --cron-expression "0 * * * *" \
    --replica-timeout 600 \
    --replica-retry-limit 1 \
    --parallelism 1 \
    --replica-completion-count 1 \
    --command /bin/sh \
    --args scripts/azure/cleanup.sh \
    --replace-env-vars "${CLEANUP_ENV_VARS[@]}" \
    --only-show-errors \
    --output none
else
  az containerapp job create \
    --name "$CLEANUP_JOB_NAME" \
    --resource-group "$RESOURCE_GROUP" \
    --environment "$CONTAINER_ENV_NAME" \
    --trigger-type Schedule \
    --cron-expression "0 * * * *" \
    --image "$OPS_IMAGE" \
    --cpu 0.25 \
    --memory 0.5Gi \
    --replica-timeout 600 \
    --replica-retry-limit 1 \
    --parallelism 1 \
    --replica-completion-count 1 \
    --command /bin/sh \
    --args scripts/azure/cleanup.sh \
    --mi-user-assigned "$IDENTITY_ID" \
    --registry-server "$ACR_LOGIN_SERVER" \
    --registry-identity "$IDENTITY_ID" \
    --secrets "database-url=$APP_DATABASE_URL" \
    --env-vars "${CLEANUP_ENV_VARS[@]}" \
    --tags application=EduLoop environment=production \
    --only-show-errors \
    --output none
fi
start_and_wait_for_job "$CLEANUP_JOB_NAME" 900

ACTUAL_FQDN="$(az containerapp show \
  --name "$APP_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --query properties.configuration.ingress.fqdn \
  --output tsv \
  --only-show-errors)"
ACTUAL_ORIGIN="https://$ACTUAL_FQDN"
if [[ "$PUBLIC_ORIGIN" != "$ACTUAL_ORIGIN" ]]; then
  warn "AUTH_URL is $PUBLIC_ORIGIN but the Azure-generated hostname is $ACTUAL_ORIGIN. Ensure the custom domain is already bound."
fi

log "Waiting for database readiness."
READY=0
for _ in {1..36}; do
  if curl --fail --silent --show-error --max-time 10 "$PUBLIC_ORIGIN/api/health" >/dev/null 2>&1; then
    READY=1
    break
  fi
  sleep 10
done
[[ "$READY" = "1" ]] || die "The app did not become ready at $PUBLIC_ORIGIN/api/health."

log "Running the external deployment smoke test."
node "$ROOT_DIR/scripts/smoke-deployment.mjs" "$PUBLIC_ORIGIN"

cat <<EOF

Azure deployment completed.
  App:              $PUBLIC_ORIGIN
  Resource group:   $RESOURCE_GROUP
  PostgreSQL:       $POSTGRES_SERVER_NAME
  Container App:    $APP_NAME
  Release job:      $RELEASE_JOB_NAME
  Cleanup job:      $CLEANUP_JOB_NAME
  Registry:         $ACR_LOGIN_SERVER
  Key Vault:        $KEY_VAULT_NAME
  Release:          $APP_VERSION

Secret values are stored in Key Vault and Container Apps; none were printed.
EOF
