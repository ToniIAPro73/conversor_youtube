#!/usr/bin/env bash
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TAR="$REPO_ROOT/dist/linux/Anclora-FileStudio-Linux-x64.tar.zst"
SHA_FILE="$TAR.sha256"

[[ -f "$TAR" ]] || { echo "ERROR: Package not found: $TAR"; exit 1; }
[[ -f "$SHA_FILE" ]] || { echo "ERROR: SHA256 file not found"; exit 1; }

echo "Verifying SHA256..."
cd "$(dirname "$TAR")"
sha256sum -c "$SHA_FILE"
echo "Verification OK"
