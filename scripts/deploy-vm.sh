#!/usr/bin/env bash
set -Eeuo pipefail

umask 077

app_image="${1:-}"
ops_image="${2:-}"
release="${3:-}"
incoming_env="${4:-}"
app_name="${5:-}"
app_domain="${6:-}"
host_port="${7:-}"
seed_database="${8:-true}"

die() {
  echo "Webstack deployment failed: $*" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || die "$1 is required on the VM."
}

valid_image_reference() {
  [[ "$1" =~ ^ghcr\.io/[a-z0-9._/-]+:[A-Fa-f0-9]{40}$ ]]
}

wait_for_readiness() {
  local name="$1"
  local attempts="${2:-60}"
  local state
  for ((attempt = 1; attempt <= attempts; attempt += 1)); do
    state="$(docker inspect --format "{{.State.Status}}" "$name" 2>/dev/null || true)"
    if [[ "$state" = "exited" || "$state" = "dead" ]]; then
      docker logs --tail 80 "$name" >&2 || true
      return 1
    fi
    if docker exec "$name" wget -q -O /dev/null http://127.0.0.1:3000/api/health; then
      return 0
    fi
    sleep 2
  done
  docker logs --tail 80 "$name" >&2 || true
  return 1
}

[[ "$EUID" -eq 0 ]] || die "Run through sudo on the Webstack VM."
require_command docker
require_command flock
require_command python3
require_command webstack-create-app
require_command webstack-deploy

valid_image_reference "$app_image" || die "The application image reference is invalid."
valid_image_reference "$ops_image" || die "The operations image reference is invalid."
[[ "$release" =~ ^[A-Fa-f0-9]{40}$ ]] || die "Release must be a full Git commit SHA."
[[ "$app_name" =~ ^[a-z][a-z0-9_]{0,39}$ ]] || die "Application name is invalid."
[[ "$app_domain" =~ ^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]([a-z0-9-]{0,61}[a-z0-9])?$ ]] \
  || die "Application domain is invalid."
if [[ ! "$host_port" =~ ^[0-9]+$ ]] || ((host_port < 1024 || host_port > 65535)); then
  die "Host port must be from 1024 through 65535."
fi
[[ "$seed_database" = "true" || "$seed_database" = "false" ]] || die "Seed flag must be true or false."
[[ -f "$incoming_env" && -s "$incoming_env" ]] || die "The incoming application environment is missing or empty."
[[ -d /data/apps && -d /etc/caddy/sites ]] || die "The VM is not configured by Webstack."
docker network inspect webstack-apps >/dev/null 2>&1 || die "The webstack-apps Docker network is missing."

deploy_directory="$(cd "$(dirname "$incoming_env")" && pwd)"
incoming_env="$deploy_directory/$(basename "$incoming_env")"
app_directory="/data/apps/$app_name"
app_env="$app_directory/app.env"
next_env="$app_directory/app.env.next"
previous_env="$app_directory/app.env.previous"
compose_file="$app_directory/compose.yml"
candidate_name="${app_name}-candidate"
lock_file="/run/lock/eduloop-release-$app_name.lock"

# shellcheck disable=SC2317  # Invoked indirectly by the EXIT trap.
cleanup() {
  rm -f "$incoming_env" "$next_env"
  docker rm --force "$candidate_name" >/dev/null 2>&1 || true
}
trap cleanup EXIT

exec 9>"$lock_file"
flock -w 600 9 || die "Another deployment for $app_name is already running."

if [[ ! -d "$app_directory" ]]; then
  echo "Creating the isolated Webstack application and PostgreSQL database."
  webstack-create-app "$app_name" "$app_domain" \
    --container-port 3000 \
    --host-port "$host_port"
fi
[[ -f "$app_env" ]] || die "Webstack did not create $app_env."

python3 - "$app_env" "$incoming_env" "$next_env" "$release" <<'PY'
from pathlib import Path
import re
import sys
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

current_path, incoming_path, output_path = map(Path, sys.argv[1:4])
release = sys.argv[4]
reserved = {
    "APP_VERSION", "DATABASE_URL", "EDULOOP_DATABASE_PROVIDER",
    "NODE_ENV", "PGDATABASE", "PGHOST", "PGPASSWORD", "PGPORT",
    "PGUSER", "PORT",
}

def values(path):
    result = {}
    for raw in path.read_text().splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        key, separator, value = line.partition("=")
        if not separator or not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", key):
            raise SystemExit(f"Invalid environment line in {path.name}")
        result[key] = value
    return result

database = values(current_path)
required = {"PGHOST", "PGPORT", "PGDATABASE", "PGUSER", "PGPASSWORD", "DATABASE_URL"}
missing = sorted(required - database.keys())
if missing:
    raise SystemExit("Webstack database environment is incomplete: " + ", ".join(missing))

parts = urlsplit(database["DATABASE_URL"])
query = dict(parse_qsl(parts.query, keep_blank_values=True))
query.update({
    "schema": "public",
    "sslmode": "require",
    "connection_limit": "8",
    "pool_timeout": "10",
    "connect_timeout": "5",
})
database_url = urlunsplit((parts.scheme, parts.netloc, parts.path, urlencode(query), parts.fragment))

application_lines = []
for raw in incoming_path.read_text().splitlines():
    line = raw.strip()
    if not line or line.startswith("#"):
        continue
    key, separator, _ = line.partition("=")
    if not separator or not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", key):
        raise SystemExit("Invalid line in VM_APP_ENV")
    if key in reserved:
        raise SystemExit(f"VM_APP_ENV must not define reserved variable {key}")
    application_lines.append(line)

fixed = [
    f"PGHOST={database['PGHOST']}",
    f"PGPORT={database['PGPORT']}",
    f"PGDATABASE={database['PGDATABASE']}",
    f"PGUSER={database['PGUSER']}",
    f"PGPASSWORD={database['PGPASSWORD']}",
    f"DATABASE_URL={database_url}",
    "EDULOOP_DATABASE_PROVIDER=postgresql",
    f"APP_VERSION={release}",
    "PORT=3000",
]
Path(output_path).write_text("\n".join(fixed + application_lines) + "\n")
PY
chmod 600 "$next_env"

cat >"$compose_file" <<EOF
services:
  web:
    image: \${APP_IMAGE:?Run webstack-deploy with an immutable image tag}
    restart: unless-stopped
    init: true
    env_file:
      - app.env
    ports:
      - "127.0.0.1:${host_port}:3000"
    networks:
      - apps
    mem_limit: 1g
    stop_grace_period: 30s
    security_opt:
      - no-new-privileges:true
    cap_drop:
      - ALL
    healthcheck:
      test: ["CMD", "wget", "-q", "-O", "/dev/null", "http://127.0.0.1:3000/api/health"]
      interval: 10s
      timeout: 5s
      retries: 12
      start_period: 30s
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"
networks:
  apps:
    external: true
    name: webstack-apps
EOF
chmod 600 "$compose_file"

echo "Pulling immutable release images."
docker pull "$app_image"
docker pull "$ops_image"

echo "Validating the EduLoop production environment."
docker run --rm \
  --network webstack-apps \
  --env-file "$next_env" \
  "$app_image" \
  node scripts/validate-environment.mjs

echo "Applying EduLoop PostgreSQL migrations."
docker run --rm \
  --network webstack-apps \
  --env-file "$next_env" \
  "$ops_image" \
  npm run db:deploy:postgres

if [[ "$seed_database" = "true" ]]; then
  echo "Synchronizing the bundled EduLoop question catalog."
  docker run --rm \
    --network webstack-apps \
    --env-file "$next_env" \
    "$ops_image" \
    npm run db:seed
fi

docker rm --force "$candidate_name" >/dev/null 2>&1 || true
echo "Preflighting the new application release."
docker run --detach \
  --name "$candidate_name" \
  --network webstack-apps \
  --env-file "$next_env" \
  --label "com.eduloop.service=candidate" \
  "$app_image" >/dev/null
wait_for_readiness "$candidate_name" || die "The candidate release did not become ready; the current app remains online."
docker rm --force "$candidate_name" >/dev/null

old_image=""
if [[ -f "$app_directory/image.env" ]]; then
  old_image="$(sed -n 's/^APP_IMAGE=//p' "$app_directory/image.env")"
fi
cp "$app_env" "$previous_env"
mv "$next_env" "$app_env"

echo "Deploying release $release through Webstack."
if webstack-deploy "$app_name" "$app_image"; then
  rm -f "$previous_env"
  echo "EduLoop Webstack deployment completed for release $release."
  exit 0
fi

echo "Restoring the previous EduLoop environment after deployment failure." >&2
mv "$previous_env" "$app_env"
if [[ -n "$old_image" ]]; then
  webstack-deploy "$app_name" "$old_image" \
    || die "Deployment and explicit rollback both failed; inspect $app_name immediately."
fi
die "The new release failed and the previous release was restored when available."
