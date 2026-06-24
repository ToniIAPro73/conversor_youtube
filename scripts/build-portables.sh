#!/usr/bin/env bash
# build-portables.sh — Orchestrator for all Anclora FileStudio portable builds.
# Does NOT modify Git state. Does NOT push. Does NOT create commits.
#
# Usage:
#   bash scripts/build-portables.sh --linux
#   bash scripts/build-portables.sh --windows
#   bash scripts/build-portables.sh --all
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
info()  { echo -e "${CYAN}[PORTABLES]${NC} $*"; }
ok()    { echo -e "${GREEN}[PORTABLES]${NC} $*"; }
warn()  { echo -e "${YELLOW}[PORTABLES]${NC} $*"; }
error() { echo -e "${RED}[PORTABLES]${NC} $*" >&2; }

usage() {
  echo "Usage: bash scripts/build-portables.sh [--linux | --windows | --all]"
  echo ""
  echo "Options:"
  echo "  --linux    Build Linux x64 portable (tar.zst)"
  echo "  --windows  Build Windows x64 Core portable (ZIP)"
  echo "  --all      Build both"
  echo ""
  echo "Prerequisites:"
  echo "  - pnpm build:desktop must complete before running this script"
  echo "  - .next/standalone/server.js must exist"
  exit 1
}

# ── Argument parsing ──────────────────────────────────────────────────────────
BUILD_LINUX=0
BUILD_WINDOWS=0

case "${1:-}" in
  --linux)   BUILD_LINUX=1 ;;
  --windows) BUILD_WINDOWS=1 ;;
  --all)     BUILD_LINUX=1; BUILD_WINDOWS=1 ;;
  --help|-h) usage ;;
  "")        usage ;;
  *)         error "Unknown option: $1"; usage ;;
esac

echo ""
echo "════════════════════════════════════════════════"
echo " Anclora FileStudio — Portable Build Orchestrator"
echo "════════════════════════════════════════════════"
echo ""

# ── Pre-flight: standalone must exist ────────────────────────────────────────
STANDALONE="$REPO_ROOT/.next/standalone/server.js"
if [[ ! -f "$STANDALONE" ]]; then
  error ".next/standalone/server.js not found."
  error "Run 'pnpm build:desktop' (or 'pnpm build') first, then retry."
  exit 1
fi
ok "Standalone build present: $STANDALONE"

START=$(date +%s)
LINUX_STATUS="SKIPPED"
WINDOWS_STATUS="SKIPPED"

# ── Linux build ───────────────────────────────────────────────────────────────
if [[ "$BUILD_LINUX" -eq 1 ]]; then
  echo ""
  echo "── Linux portable ──────────────────────────────"
  if bash "$SCRIPT_DIR/build-linux-portable.sh"; then
    LINUX_STATUS="OK"
    ok "Linux build complete → dist/linux/Anclora-FileStudio-Linux-x64.tar.zst"
    # Update release manifest with artifact metadata
    LINUX_ARTIFACT="$REPO_ROOT/dist/linux/Anclora-FileStudio-Linux-x64.tar.zst"
    if [[ -f "$LINUX_ARTIFACT" ]]; then
      bash "$SCRIPT_DIR/update-release-manifest.sh" \
        --platform linux-x64 \
        --file "$LINUX_ARTIFACT" || warn "Could not update release-manifest.json for linux-x64 (non-fatal)"
    else
      warn "Linux artifact not found at expected path, skipping manifest update: $LINUX_ARTIFACT"
    fi
  else
    LINUX_STATUS="FAILED"
    error "Linux build failed"
  fi
fi

# ── Windows build ─────────────────────────────────────────────────────────────
if [[ "$BUILD_WINDOWS" -eq 1 ]]; then
  echo ""
  echo "── Windows portable ────────────────────────────"
  if bash "$SCRIPT_DIR/build-windows-portable.sh"; then
    WINDOWS_STATUS="OK"
    ok "Windows build complete → dist/windows/Anclora-FileStudio-Windows-x64-Core.zip"
    # Update release manifest with artifact metadata
    WINDOWS_ARTIFACT="$REPO_ROOT/dist/windows/Anclora-FileStudio-Windows-x64-Core.zip"
    if [[ -f "$WINDOWS_ARTIFACT" ]]; then
      bash "$SCRIPT_DIR/update-release-manifest.sh" \
        --platform windows-x64 \
        --file "$WINDOWS_ARTIFACT" || warn "Could not update release-manifest.json for windows-x64 (non-fatal)"
    else
      warn "Windows artifact not found at expected path, skipping manifest update: $WINDOWS_ARTIFACT"
    fi
  else
    WINDOWS_STATUS="FAILED"
    error "Windows build failed"
  fi
fi

# ── Summary ───────────────────────────────────────────────────────────────────
END=$(date +%s)
ELAPSED=$(( END - START ))

echo ""
echo "════════════════════════════════════════════════"
echo " Build Summary (${ELAPSED}s)"
echo "════════════════════════════════════════════════"
echo ""

if [[ "$BUILD_LINUX" -eq 1 ]]; then
  if [[ "$LINUX_STATUS" == "OK" ]]; then
    echo -e " ${GREEN}Linux:${NC}   $LINUX_STATUS"
  else
    echo -e " ${RED}Linux:${NC}   $LINUX_STATUS"
  fi
fi
if [[ "$BUILD_WINDOWS" -eq 1 ]]; then
  if [[ "$WINDOWS_STATUS" == "OK" ]]; then
    echo -e " ${GREEN}Windows:${NC} $WINDOWS_STATUS"
  else
    echo -e " ${RED}Windows:${NC} $WINDOWS_STATUS"
  fi
fi
echo ""

if [[ "$LINUX_STATUS" == "FAILED" ]] || [[ "$WINDOWS_STATUS" == "FAILED" ]]; then
  exit 1
fi
