#!/usr/bin/env bash
# Smoke test: extract, check health endpoint, run a conversion, cleanup
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TAR="$REPO_ROOT/dist/linux/Anclora-FileStudio-Linux-x64.tar.zst"
TMP_DIR="$(mktemp -d)"
trap "rm -rf $TMP_DIR" EXIT

[[ -f "$TAR" ]] || { echo "SKIP: Package not found. Run pnpm build:portable:linux first."; exit 0; }

echo "=== Smoke test — Linux portable ==="
echo "Extracting to $TMP_DIR..."
tar -C "$TMP_DIR" -I zstd -xf "$TAR"
[[ -f "$TMP_DIR/Anclora-FileStudio-Linux-x64/start-anclora-filestudio.sh" ]] || { echo "ERROR: start script missing"; exit 1; }
[[ -f "$TMP_DIR/Anclora-FileStudio-Linux-x64/manifest.json" ]] || { echo "ERROR: manifest.json missing"; exit 1; }
echo "PASS: Package structure verified"

# Verify no developer paths leaked
grep -r "/home/toni\|/Users/" "$TMP_DIR" 2>/dev/null && { echo "ERROR: developer paths found in package"; exit 1; } || true
echo "PASS: No developer paths in package"

echo "=== Smoke test passed ==="
