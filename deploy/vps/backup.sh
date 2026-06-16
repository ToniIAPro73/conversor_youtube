#!/bin/bash
# Backup Anclora FileStudio VPS — PostgreSQL dump + artifact volume snapshot
# Usage: ./backup.sh [backup-dir]
set -euo pipefail

BACKUP_DIR="${1:-/var/backups/anclora-filestudio}"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
DEST="${BACKUP_DIR}/${TIMESTAMP}"

mkdir -p "${DEST}"

echo "[backup] Starting backup to ${DEST}"

ENV_FILE="$(dirname "$0")/.env"
POSTGRES_PASSWORD="$(grep -E '^POSTGRES_PASSWORD=' "${ENV_FILE}" | cut -d= -f2-)"
export PGPASSWORD="${POSTGRES_PASSWORD}"

# PostgreSQL dump
echo "[backup] Dumping PostgreSQL..."
docker compose exec -T postgres \
  pg_dump -U filestudio filestudio \
  | gzip > "${DEST}/postgres.sql.gz"

# Artifact data volume
echo "[backup] Snapshotting artifact volume..."
docker run --rm \
  -v anclora-filestudio_filestudio_data:/source:ro \
  -v "${DEST}:/dest" \
  alpine \
  tar czf /dest/artifacts.tar.gz -C /source .

echo "[backup] Done. Files:"
ls -lh "${DEST}/"

# Prune backups older than 30 days
find "${BACKUP_DIR}" -maxdepth 1 -type d -mtime +30 -exec rm -rf {} +
echo "[backup] Pruned backups older than 30 days."
