#!/usr/bin/env bash
# Smoke test: verify Windows ZIP structure
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ZIP="$REPO_ROOT/dist/windows/Anclora-FileStudio-Windows-x64-Core.zip"

[[ -f "$ZIP" ]] || { echo "SKIP: Windows package not found. Run pnpm build:portable:windows first."; exit 0; }

echo "=== Smoke test — Windows portable ==="
TMP_DIR="$(mktemp -d)"
trap "rm -rf $TMP_DIR" EXIT

7z x "$ZIP" -o"$TMP_DIR" -y >/dev/null
[[ -f "$TMP_DIR/Anclora-FileStudio/INICIAR_ANCLORA_FILESTUDIO.bat" ]] || { echo "ERROR: start script missing"; exit 1; }
[[ -f "$TMP_DIR/Anclora-FileStudio/manifest.json" ]] || { echo "ERROR: manifest.json missing"; exit 1; }

grep -r "/home/toni\|\\\\toni\\\\" "$TMP_DIR" 2>/dev/null && { echo "ERROR: developer paths found"; exit 1; } || true
echo "PASS: Windows package structure OK"
