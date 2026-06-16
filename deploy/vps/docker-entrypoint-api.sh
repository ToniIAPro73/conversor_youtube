#!/bin/sh
set -eu

echo "[entrypoint] Running database migrations..."
node apps/api/dist/db/migrate.js || {
  echo "[entrypoint] Migration failed, aborting startup."
  exit 1
}

echo "[entrypoint] Starting API server..."
exec node apps/api/dist/server.js
