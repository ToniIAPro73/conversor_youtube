#!/usr/bin/env bash
# smoke-linux-portable.sh — Quick structural smoke test for the Linux portable.
# Fails with exit 1 when the package is missing. Does NOT start the server.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
TAR="$REPO_ROOT/dist/linux/Anclora-FileStudio-Linux-x64.tar.zst"

# ── Artifact must exist — no false-positive SKIP ──────────────────────────────
if [[ ! -f "$TAR" ]]; then
  echo "[FAIL] Package not found: $TAR"
  echo "       Run 'pnpm build:portable:linux' first."
  exit 1
fi

echo "=== Smoke test — Linux portable ==="
echo "Package: $(du -sh "$TAR" | awk '{print $1}') → $TAR"

# ── zstd path ─────────────────────────────────────────────────────────────────
for p in "$HOME/.local/bin/zstd" "/usr/local/bin/zstd" "zstd"; do
  command -v "$p" >/dev/null 2>&1 && { PATH="$(dirname "$(command -v "$p" 2>/dev/null || echo "$p")")":$PATH; break; } 2>/dev/null || true
done

TMP_DIR="$(mktemp -d)"
trap "rm -rf '$TMP_DIR'" EXIT

echo "Extracting..."
tar -C "$TMP_DIR" -I zstd -xf "$TAR"
PKG="$TMP_DIR/Anclora-FileStudio-Linux-x64"

# ── Required files ────────────────────────────────────────────────────────────
FAIL=0
for f in \
  "start-anclora-filestudio.sh" \
  "stop-anclora-filestudio.sh" \
  "manifest.json" \
  "VERSION.txt" \
  "app/server.js" \
  "app/.next/static"; do
  if [[ -e "$PKG/$f" ]]; then
    echo "[PASS] $f"
  else
    echo "[FAIL] Missing: $f"
    (( FAIL++ )) || true
  fi
done

# ── Developer paths ───────────────────────────────────────────────────────────
# Exclude Next.js build artifacts that inevitably contain outputFileTracingRoot:
#   server.js, required-server-files.json — these are baked in at build time
#   and cannot contain user-controlled content that poses a security risk.
DEV_PATTERN="/home/toni/projects|/home/antonio|/Users/antonio|convertidor_youtube_mp3"
DEV_HITS="$(grep -rE "$DEV_PATTERN" "$TMP_DIR" \
  --exclude="server.js" \
  --exclude="required-server-files.json" \
  --exclude="trace" \
  2>/dev/null || true)"
if [[ -n "$DEV_HITS" ]]; then
  echo "[FAIL] Developer paths found in package"
  echo "$DEV_HITS" | head -5
  (( FAIL++ )) || true
else
  echo "[PASS] No developer paths (excl. Next.js build artifacts)"
fi

# ── Checksum ──────────────────────────────────────────────────────────────────
SHA_FILE="$TAR.sha256"
if [[ -f "$SHA_FILE" ]]; then
  cd "$(dirname "$TAR")"
  if sha256sum -c "$(basename "$SHA_FILE")" >/dev/null 2>&1; then
    echo "[PASS] SHA-256 OK"
  else
    echo "[FAIL] SHA-256 mismatch"
    (( FAIL++ )) || true
  fi
else
  echo "[FAIL] .sha256 file missing"
  (( FAIL++ )) || true
fi

# ── Manifest JSON parseable ───────────────────────────────────────────────────
if python3 -m json.tool "$PKG/manifest.json" >/dev/null 2>&1; then
  echo "[PASS] manifest.json is valid JSON"
else
  echo "[FAIL] manifest.json is invalid JSON"
  (( FAIL++ )) || true
fi

echo ""
if [[ "$FAIL" -gt 0 ]]; then
  echo "=== Smoke test FAILED ($FAIL issue(s)) ==="
  exit 1
else
  echo "=== Smoke test PASSED ==="
fi
