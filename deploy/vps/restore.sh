#!/bin/bash
# Restore Anclora FileStudio VPS from backup
# Usage: ./restore.sh <backup-dir> (e.g. /var/backups/anclora-filestudio/20260101_120000)
set -euo pipefail

BACKUP="${1:-}"
if [[ -z "${BACKUP}" ]]; then
  echo "Usage: $0 <backup-directory>"
  exit 1
fi

if [[ ! -d "${BACKUP}" ]]; then
  echo "Error: backup directory not found: ${BACKUP}"
  exit 1
fi

# shellcheck disable=SC1091
source "$(dirname "$0")/.env"

echo "[restore] WARNING: This will STOP the API and OVERWRITE production data."
read -r -p "Type 'yes' to continue: " CONFIRM
[[ "${CONFIRM}" != "yes" ]] && { echo "Aborted."; exit 1; }

echo "[restore] Stopping services..."
docker compose stop api worker

echo "[restore] Restoring PostgreSQL..."
gunzip -c "${BACKUP}/postgres.sql.gz" | \
  docker compose exec -T postgres \
  psql -U filestudio filestudio

echo "[restore] Restoring artifact volume..."
docker run --rm \
  -v anclora-filestudio_filestudio_data:/dest \
  -v "${BACKUP}:/source:ro" \
  alpine \
  sh -c "rm -rf /dest/* && tar xzf /source/artifacts.tar.gz -C /dest"

echo "[restore] Restarting services..."
docker compose start api worker

echo "[restore] Done."
