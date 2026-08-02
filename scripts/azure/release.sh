#!/bin/sh
set -eu

: "${DATABASE_URL:?DATABASE_URL is required}"
: "${POSTGRES_ADMIN_URL:?POSTGRES_ADMIN_URL is required}"
: "${POSTGRES_APP_USER:?POSTGRES_APP_USER is required}"
: "${POSTGRES_APP_PASSWORD:?POSTGRES_APP_PASSWORD is required}"
: "${POSTGRES_DATABASE:?POSTGRES_DATABASE is required}"

provision_role() {
  psql "$POSTGRES_ADMIN_URL" \
    --set=app_user="$POSTGRES_APP_USER" \
    --set=app_password="$POSTGRES_APP_PASSWORD" \
    --set=database_name="$POSTGRES_DATABASE" \
    --file=scripts/azure/provision-app-role.sql
}

provision_role
npm run db:deploy:postgres

if [ "${AZURE_SEED_CATALOG:-1}" = "1" ]; then
  npm run db:seed
fi

# Reapply grants for objects created by a migration or seed in this release.
provision_role
