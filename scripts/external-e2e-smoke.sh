#!/usr/bin/env bash
# external-e2e-smoke.sh — Smoke E2E externo opt-in. NUNCA se activa en CI normal.
#
# Uso:
#   ANCLORA_FILESTUDIO_RUN_EXTERNAL_E2E=1 \
#   ANCLORA_FILESTUDIO_EXTERNAL_VIDEO_URL="<URL_AUTORIZADA>" \
#   [ANCLORA_FILESTUDIO_EXTERNAL_EXPECTED_MIN_HEIGHT=2160] \
#   [ANCLORA_FILESTUDIO_EXTERNAL_DOWNLOAD=1] \
#   bash scripts/external-e2e-smoke.sh
#
# Variables de entorno:
#   ANCLORA_FILESTUDIO_RUN_EXTERNAL_E2E          Must be "1" to enable
#   ANCLORA_FILESTUDIO_EXTERNAL_VIDEO_URL         URL autorizada del video a analizar
#   ANCLORA_FILESTUDIO_EXTERNAL_EXPECTED_MIN_HEIGHT  Altura mínima en píxeles (default: 2160)
#   ANCLORA_FILESTUDIO_EXTERNAL_DOWNLOAD         Set "1" para descargar y validar con ffprobe
set -euo pipefail

# ── Colors ────────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
info()    { echo -e "${CYAN}[E2E-SMOKE]${NC} $*"; }
ok()      { echo -e "${GREEN}[PASS]${NC} $*"; }
skipped() { echo -e "${YELLOW}[SKIPPED]${NC} $*"; }
blocked() { echo -e "${RED}[BLOCKED]${NC} $*" >&2; }
fail()    { echo -e "${RED}[FAIL]${NC} $*" >&2; }

# ── Gate: opt-in required ─────────────────────────────────────────────────────
if [[ "${ANCLORA_FILESTUDIO_RUN_EXTERNAL_E2E:-}" != "1" ]]; then
  skipped "set ANCLORA_FILESTUDIO_RUN_EXTERNAL_E2E=1 to run"
  exit 0
fi

# ── Gate: URL required ────────────────────────────────────────────────────────
if [[ -z "${ANCLORA_FILESTUDIO_EXTERNAL_VIDEO_URL:-}" ]]; then
  blocked "ANCLORA_FILESTUDIO_EXTERNAL_VIDEO_URL is required"
  exit 1
fi

VIDEO_URL="${ANCLORA_FILESTUDIO_EXTERNAL_VIDEO_URL}"
MIN_HEIGHT="${ANCLORA_FILESTUDIO_EXTERNAL_EXPECTED_MIN_HEIGHT:-2160}"
DO_DOWNLOAD="${ANCLORA_FILESTUDIO_EXTERNAL_DOWNLOAD:-0}"

# ── Tool checks ───────────────────────────────────────────────────────────────
if ! command -v yt-dlp &>/dev/null; then
  fail "yt-dlp is not available in PATH"
  exit 1
fi

# ── Temp dir + cleanup trap ───────────────────────────────────────────────────
WORK_DIR="$(mktemp -d)"
trap 'info "Cleaning up temp dir $WORK_DIR ..."; rm -rf "$WORK_DIR"' EXIT

echo ""
echo "════════════════════════════════════════════════"
info "External E2E Smoke Test"
echo "════════════════════════════════════════════════"
info "URL           : $VIDEO_URL"
info "Min height    : ${MIN_HEIGHT}px"
info "Download mode : $DO_DOWNLOAD"
echo ""

# ── Step 1: Metadata analysis (always) ───────────────────────────────────────
info "Step 1: Fetching video metadata (--skip-download) ..."

META_FILE="$WORK_DIR/meta.json"
if ! yt-dlp \
    --dump-single-json \
    --skip-download \
    --no-playlist \
    "$VIDEO_URL" > "$META_FILE" 2>/dev/null; then
  fail "yt-dlp metadata fetch failed for: $VIDEO_URL"
  exit 1
fi

# Extract best available height from formats
BEST_HEIGHT="$(python3 - <<PYEOF
import json, sys
with open("$META_FILE") as f:
    meta = json.load(f)
formats = meta.get("formats", [])
heights = [fmt.get("height") or 0 for fmt in formats if fmt.get("height")]
print(max(heights) if heights else 0)
PYEOF
)"

info "Best available height in metadata: ${BEST_HEIGHT}px"

if [[ "$BEST_HEIGHT" -lt "$MIN_HEIGHT" ]]; then
  fail "Quality check FAILED: best height ${BEST_HEIGHT}px < required ${MIN_HEIGHT}px"
  exit 1
fi
ok "Metadata quality check PASS: ${BEST_HEIGHT}px >= ${MIN_HEIGHT}px"

# ── Step 2: Download + ffprobe validation (opt-in) ───────────────────────────
if [[ "$DO_DOWNLOAD" == "1" ]]; then
  if ! command -v ffprobe &>/dev/null; then
    fail "ffprobe is not available in PATH (required for download mode)"
    exit 1
  fi

  info "Step 2: Downloading video for ffprobe validation ..."
  DOWNLOAD_PATH="$WORK_DIR/video.%(ext)s"

  if ! yt-dlp \
      --format "bestvideo[height>=${MIN_HEIGHT}]+bestaudio/best[height>=${MIN_HEIGHT}]/best" \
      --no-playlist \
      --output "$DOWNLOAD_PATH" \
      "$VIDEO_URL"; then
    fail "yt-dlp download failed"
    exit 1
  fi

  # Find downloaded file
  DOWNLOADED_FILE="$(find "$WORK_DIR" -maxdepth 1 -type f ! -name "meta.json" | head -1)"
  if [[ -z "$DOWNLOADED_FILE" ]]; then
    fail "Download produced no file in $WORK_DIR"
    exit 1
  fi
  info "Downloaded: $DOWNLOADED_FILE"

  # ffprobe to verify actual height
  ACTUAL_HEIGHT="$(ffprobe -v error \
    -select_streams v:0 \
    -show_entries stream=height \
    -of csv=p=0 \
    "$DOWNLOADED_FILE" 2>/dev/null || echo "0")"

  info "ffprobe reported height: ${ACTUAL_HEIGHT}px"

  if [[ "${ACTUAL_HEIGHT:-0}" -lt "$MIN_HEIGHT" ]]; then
    fail "Download quality FAIL: ffprobe height ${ACTUAL_HEIGHT}px < required ${MIN_HEIGHT}px"
    exit 1
  fi
  ok "Download quality PASS: ffprobe height ${ACTUAL_HEIGHT}px >= ${MIN_HEIGHT}px"
else
  info "Step 2: Skipped (set ANCLORA_FILESTUDIO_EXTERNAL_DOWNLOAD=1 to enable)"
fi

# ── Result ────────────────────────────────────────────────────────────────────
echo ""
echo "════════════════════════════════════════════════"
ok "External E2E Smoke Test: PASS"
echo "════════════════════════════════════════════════"
echo ""
exit 0
