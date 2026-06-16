#!/usr/bin/env bash
# smoke-windows-portable.sh — Structural smoke test for the Windows portable (WSL).
# Fails with exit 1 when the package is missing. Does NOT launch the app.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ZIP="$REPO_ROOT/dist/windows/Anclora-FileStudio-Windows-x64-Core.zip"

# ── Artifact must exist — no false-positive SKIP ──────────────────────────────
if [[ ! -f "$ZIP" ]]; then
  echo "[FAIL] Package not found: $ZIP"
  echo "       Run 'pnpm build:portable:windows' first."
  exit 1
fi

echo "=== Smoke test — Windows portable ==="
echo "Package: $(du -sh "$ZIP" | awk '{print $1}') → $ZIP"

# ── 7z required ───────────────────────────────────────────────────────────────
SEVENZIP=""
for c in 7zz 7z; do
  command -v "$c" >/dev/null 2>&1 && { SEVENZIP="$c"; break; } || true
done
if [[ -z "$SEVENZIP" ]]; then
  echo "[SKIP] 7z/7zz not available in WSL — cannot extract ZIP for inspection"
  echo "       Install with: sudo apt install p7zip-full"
  echo "       Structural smoke skipped; SHA-256 check still runs."
fi

FAIL=0

# ── Checksum ──────────────────────────────────────────────────────────────────
SHA_FILE="$ZIP.sha256"
if [[ -f "$SHA_FILE" ]]; then
  cd "$(dirname "$ZIP")"
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

# ── ZIP extraction (only if 7z available) ────────────────────────────────────
if [[ -n "$SEVENZIP" ]]; then
  TMP_DIR="$(mktemp -d)"
  trap "rm -rf '$TMP_DIR'" EXIT

  echo "Extracting with $SEVENZIP..."
  "$SEVENZIP" x "$ZIP" -o"$TMP_DIR" -y >/dev/null 2>&1

  PKG="$TMP_DIR/Anclora-FileStudio-Windows-x64-Core"

  for f in \
    "INICIAR_ANCLORA_FILESTUDIO.bat" \
    "CERRAR_ANCLORA_FILESTUDIO.bat" \
    "manifest.json" \
    "app/node.exe" \
    "app/server.js"; do
    if [[ -e "$PKG/$f" ]]; then
      echo "[PASS] $f"
    else
      echo "[FAIL] Missing: $f"
      (( FAIL++ )) || true
    fi
  done

  # Developer paths
  DEV_PATTERN="/home/toni|/home/antonio|convertidor_youtube_mp3"
  if grep -rqE "$DEV_PATTERN" "$TMP_DIR" --include="*.bat" --include="*.ps1" --include="*.json" 2>/dev/null; then
    echo "[FAIL] Developer paths found in package"
    grep -rE "$DEV_PATTERN" "$TMP_DIR" --include="*.bat" --include="*.ps1" --include="*.json" 2>/dev/null | head -5
    (( FAIL++ )) || true
  else
    echo "[PASS] No developer paths"
  fi

  # platform check in manifest
  PLATFORM="$(python3 -c "import json; print(json.load(open('$PKG/manifest.json'))['platform'])" 2>/dev/null || echo '')"
  if [[ "$PLATFORM" == "windows" ]]; then
    echo "[PASS] manifest.platform=windows"
  else
    echo "[FAIL] manifest.platform != windows (got: '$PLATFORM')"
    (( FAIL++ )) || true
  fi
fi

echo ""
if [[ "$FAIL" -gt 0 ]]; then
  echo "=== Smoke test FAILED ($FAIL issue(s)) ==="
  exit 1
else
  echo "=== Smoke test PASSED ==="
fi
