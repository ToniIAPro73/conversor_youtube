#!/usr/bin/env bash
# validate-release-manifest.sh — Download and verify artifacts listed in release-manifest.json.
#
# Usage:
#   bash scripts/validate-release-manifest.sh
#
# Optional env vars:
#   ANCLORA_RELEASE_BASE_URL  — Override the base domain in downloadUrl.
#                               Example: https://preview.anclora.dev
#                               Replaces scheme+host of each URL, keeps path.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
MANIFEST="$REPO_ROOT/release-manifest.json"

# ── Colors ────────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
info()  { echo -e "${CYAN}[VALIDATE]${NC} $*"; }
ok()    { echo -e "${GREEN}[PASS]${NC} $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $*"; }
fail()  { echo -e "${RED}[FAIL]${NC} $*" >&2; }

# ── Pre-flight ────────────────────────────────────────────────────────────────
if [[ ! -f "$MANIFEST" ]]; then
  fail "release-manifest.json not found at $MANIFEST"
  exit 1
fi
if ! command -v curl &>/dev/null; then
  fail "curl is required but not installed"
  exit 1
fi
if ! command -v python3 &>/dev/null; then
  fail "python3 is required but not installed"
  exit 1
fi

# ── Temp dir ─────────────────────────────────────────────────────────────────
TMPDIR_WORK="$(mktemp -d)"
trap 'rm -rf "$TMPDIR_WORK"' EXIT

PASS_COUNT=0
FAIL_COUNT=0
SKIP_COUNT=0

# ── SHA-256 helper ────────────────────────────────────────────────────────────
sha256_of() {
  local file="$1"
  if command -v sha256sum &>/dev/null; then
    sha256sum "$file" | awk '{print $1}'
  elif command -v shasum &>/dev/null; then
    shasum -a 256 "$file" | awk '{print $1}'
  else
    fail "Neither sha256sum nor shasum available"
    return 1
  fi
}

# ── URL rebase helper ─────────────────────────────────────────────────────────
rebase_url() {
  local original_url="$1"
  local base_url="${ANCLORA_RELEASE_BASE_URL:-}"
  if [[ -z "$base_url" ]]; then
    echo "$original_url"
    return
  fi
  # Strip trailing slash from base
  base_url="${base_url%/}"
  # Extract path from original URL (everything after scheme+host)
  local path_part
  path_part="$(python3 -c "from urllib.parse import urlparse; u=urlparse('$original_url'); print(u.path + ('?' + u.query if u.query else '') + ('#' + u.fragment if u.fragment else ''))")"
  echo "${base_url}${path_part}"
}

# ── Read platforms from manifest ──────────────────────────────────────────────
echo ""
echo "════════════════════════════════════════════════"
info "Validating release artifacts"
echo "════════════════════════════════════════════════"
echo ""

PLATFORMS="$(python3 -c "
import json, sys
with open('$MANIFEST') as f:
    m = json.load(f)
for name, plat in m.get('platforms', {}).items():
    url = plat.get('downloadUrl') or ''
    sha = plat.get('sha256') or ''
    size = plat.get('bytes') or ''
    fname = plat.get('filename') or ''
    print(f'{name}|{url}|{sha}|{size}|{fname}')
")"

while IFS='|' read -r platform download_url expected_sha expected_bytes filename; do
  echo "── Platform: $platform ──────────────────────────"

  if [[ -z "$download_url" || "$download_url" == "None" ]]; then
    warn "$platform: downloadUrl is null — skipping"
    SKIP_COUNT=$(( SKIP_COUNT + 1 ))
    echo ""
    continue
  fi

  # Rebase URL if override is set
  effective_url="$(rebase_url "$download_url")"
  info "Downloading: $effective_url"

  dest="$TMPDIR_WORK/$filename"
  if ! curl --fail --silent --show-error --location -o "$dest" "$effective_url"; then
    fail "$platform: download failed from $effective_url"
    FAIL_COUNT=$(( FAIL_COUNT + 1 ))
    echo ""
    continue
  fi

  # Check bytes
  actual_bytes="$(wc -c < "$dest" | tr -d ' ')"
  if [[ "$actual_bytes" != "$expected_bytes" ]]; then
    fail "$platform: byte mismatch — expected $expected_bytes, got $actual_bytes"
    FAIL_COUNT=$(( FAIL_COUNT + 1 ))
    echo ""
    continue
  fi
  info "Bytes OK: $actual_bytes"

  # Check SHA-256
  actual_sha="$(sha256_of "$dest")"
  if [[ "$actual_sha" != "$expected_sha" ]]; then
    fail "$platform: SHA-256 mismatch"
    fail "  expected: $expected_sha"
    fail "  got:      $actual_sha"
    FAIL_COUNT=$(( FAIL_COUNT + 1 ))
    echo ""
    continue
  fi
  info "SHA-256 OK: $actual_sha"

  ok "$platform: PASS"
  PASS_COUNT=$(( PASS_COUNT + 1 ))
  echo ""

done <<< "$PLATFORMS"

# ── Final report ─────────────────────────────────────────────────────────────
echo "════════════════════════════════════════════════"
echo " Validation Summary"
echo "════════════════════════════════════════════════"
echo ""
echo -e "  ${GREEN}PASS${NC}   : $PASS_COUNT"
echo -e "  ${RED}FAIL${NC}   : $FAIL_COUNT"
echo -e "  ${YELLOW}SKIP${NC}   : $SKIP_COUNT"
echo ""

if [[ "$FAIL_COUNT" -gt 0 ]]; then
  fail "Validation FAILED ($FAIL_COUNT failures)"
  exit 1
fi
ok "All validated artifacts PASS"
exit 0
