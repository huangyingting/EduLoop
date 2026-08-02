#!/bin/sh
set -eu

: "${DATABASE_URL:?DATABASE_URL is required}"
exec npm run data:cleanup
