#!/usr/bin/env bash
# update-release-manifest.sh — Update release-manifest.json with artifact metadata.
#
# Usage:
#   bash scripts/update-release-manifest.sh \
#     --platform <windows-x64|linux-x64> \
#     --file <path-to-artifact> \
#     [--download-url <url>]
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
MANIFEST="$REPO_ROOT/release-manifest.json"

# ── Colors ────────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
info()  { echo -e "${CYAN}[MANIFEST]${NC} $*"; }
ok()    { echo -e "${GREEN}[MANIFEST]${NC} $*"; }
warn()  { echo -e "${YELLOW}[MANIFEST]${NC} $*"; }
error() { echo -e "${RED}[MANIFEST]${NC} $*" >&2; }

# ── Argument parsing ──────────────────────────────────────────────────────────
PLATFORM=""
ARTIFACT_FILE=""
DOWNLOAD_URL=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --platform)     PLATFORM="$2";      shift 2 ;;
    --file)         ARTIFACT_FILE="$2"; shift 2 ;;
    --download-url) DOWNLOAD_URL="$2";  shift 2 ;;
    --help|-h)
      echo "Usage: $0 --platform <windows-x64|linux-x64> --file <path> [--download-url <url>]"
      exit 0
      ;;
    *) error "Unknown argument: $1"; exit 1 ;;
  esac
done

# ── Validation ────────────────────────────────────────────────────────────────
if [[ -z "$PLATFORM" ]]; then
  error "--platform is required (windows-x64 or linux-x64)"
  exit 1
fi
if [[ "$PLATFORM" != "windows-x64" && "$PLATFORM" != "linux-x64" ]]; then
  error "Unknown platform: $PLATFORM. Must be windows-x64 or linux-x64"
  exit 1
fi
if [[ -z "$ARTIFACT_FILE" ]]; then
  error "--file is required"
  exit 1
fi
if [[ ! -f "$ARTIFACT_FILE" ]]; then
  error "Artifact not found: $ARTIFACT_FILE"
  exit 1
fi
if [[ ! -f "$MANIFEST" ]]; then
  error "release-manifest.json not found at $MANIFEST"
  exit 1
fi

# ── SHA-256 calculation ───────────────────────────────────────────────────────
info "Calculating SHA-256 for $ARTIFACT_FILE ..."
SHA256=""
if command -v sha256sum &>/dev/null; then
  SHA256="$(sha256sum "$ARTIFACT_FILE" | awk '{print $1}')"
elif command -v shasum &>/dev/null; then
  SHA256="$(shasum -a 256 "$ARTIFACT_FILE" | awk '{print $1}')"
else
  error "Neither sha256sum nor shasum is available. Cannot compute checksum."
  exit 1
fi

# ── Byte size calculation ─────────────────────────────────────────────────────
BYTES=""
if command -v stat &>/dev/null; then
  # GNU stat
  if stat --version &>/dev/null 2>&1; then
    BYTES="$(stat -c%s "$ARTIFACT_FILE")"
  else
    # BSD/macOS stat
    BYTES="$(stat -f%z "$ARTIFACT_FILE")"
  fi
else
  BYTES="$(wc -c < "$ARTIFACT_FILE" | tr -d ' ')"
fi

# ── Read version from package.json ────────────────────────────────────────────
PKG_VERSION=""
PKG_JSON="$REPO_ROOT/package.json"
if [[ -f "$PKG_JSON" ]]; then
  if command -v jq &>/dev/null; then
    PKG_VERSION="$(jq -r '.version' "$PKG_JSON")"
  else
    PKG_VERSION="$(python3 -c "import json,sys; print(json.load(open('$PKG_JSON'))['version'])" 2>/dev/null || true)"
  fi
fi

# ── Git commit ────────────────────────────────────────────────────────────────
GIT_COMMIT=""
if command -v git &>/dev/null && git -C "$REPO_ROOT" rev-parse --git-dir &>/dev/null 2>&1; then
  GIT_COMMIT="$(git -C "$REPO_ROOT" rev-parse --short HEAD 2>/dev/null || true)"
fi

# ── Build date (UTC ISO) ──────────────────────────────────────────────────────
BUILD_DATE="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"

# ── Update manifest with Python3 (avoids jq requirement) ─────────────────────
info "Updating release-manifest.json ..."

DOWNLOAD_URL_ESCAPED="${DOWNLOAD_URL:-null}"

python3 - <<PYEOF
import json, sys

manifest_path = "$MANIFEST"
platform = "$PLATFORM"
sha256 = "$SHA256"
bytes_val = int("$BYTES")
download_url = "$DOWNLOAD_URL_ESCAPED" if "$DOWNLOAD_URL_ESCAPED" != "null" else None
pkg_version = "$PKG_VERSION"
git_commit = "$GIT_COMMIT"
build_date = "$BUILD_DATE"

with open(manifest_path, "r") as f:
    manifest = json.load(f)

# Update top-level fields if still PENDING
if manifest.get("version") == "PENDING" and pkg_version:
    manifest["version"] = pkg_version
if manifest.get("commit") == "PENDING" and git_commit:
    manifest["commit"] = git_commit
if manifest.get("buildDate") == "PENDING":
    manifest["buildDate"] = build_date
if manifest.get("status") == "pending":
    manifest["status"] = "draft"

# Update platform entry
if platform not in manifest.get("platforms", {}):
    print(f"ERROR: platform '{platform}' not found in manifest", file=sys.stderr)
    sys.exit(1)

p = manifest["platforms"][platform]
p["bytes"] = bytes_val
p["sha256"] = sha256
if download_url is not None:
    p["downloadUrl"] = download_url

with open(manifest_path, "w") as f:
    json.dump(manifest, f, indent=2, ensure_ascii=False)
    f.write("\n")

print(f"Manifest updated successfully.")
PYEOF

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo "════════════════════════════════════════════════"
ok "Release manifest updated"
echo "════════════════════════════════════════════════"
echo ""
echo "  Platform : $PLATFORM"
echo "  File     : $ARTIFACT_FILE"
echo "  Bytes    : $BYTES"
echo "  SHA-256  : $SHA256"
if [[ -n "$DOWNLOAD_URL" ]]; then
  echo "  URL      : $DOWNLOAD_URL"
fi
echo ""
