#!/usr/bin/env bash
# verify-linux-portable.sh — Full structural and integrity verification of the Linux portable.
# Fails with exit 1 on ANY issue. Does NOT skip on missing artifact.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
TAR="$REPO_ROOT/dist/linux/Anclora-FileStudio-Linux-x64.tar.zst"
SHA_FILE="$TAR.sha256"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
PASS=0; FAIL=0; WARN_COUNT=0

check() {
  local desc="$1"; shift
  if "$@" >/dev/null 2>&1; then
    echo -e "${GREEN}[PASS]${NC} $desc"
    (( PASS++ )) || true
  else
    echo -e "${RED}[FAIL]${NC} $desc"
    (( FAIL++ )) || true
  fi
}

warn_check() {
  local desc="$1"; shift
  if "$@" >/dev/null 2>&1; then
    echo -e "${GREEN}[PASS]${NC} $desc"
    (( PASS++ )) || true
  else
    echo -e "${YELLOW}[WARN]${NC} $desc"
    (( WARN_COUNT++ )) || true
  fi
}

require() {
  local desc="$1" val="$2"
  if [[ -n "$val" ]]; then
    echo -e "${GREEN}[PASS]${NC} $desc: $val"
    (( PASS++ )) || true
  else
    echo -e "${RED}[FAIL]${NC} $desc: empty or missing"
    (( FAIL++ )) || true
  fi
}

echo ""
echo "=== Anclora FileStudio — Linux Portable Verification ==="
echo "Target: $TAR"
echo ""

# ── 1. Artifact existence ─────────────────────────────────────────────────────
echo "--- 1. Artifact existence ---"
[[ -f "$TAR" ]]      || { echo -e "${RED}[FAIL]${NC} Package not found: $TAR"; exit 1; }
[[ -f "$SHA_FILE" ]] || { echo -e "${RED}[FAIL]${NC} SHA256 file not found: $SHA_FILE"; exit 1; }
echo -e "${GREEN}[PASS]${NC} tar.zst exists: $(du -sh "$TAR" | awk '{print $1}')"
echo -e "${GREEN}[PASS]${NC} sha256 file exists"
(( PASS+=2 )) || true

# ── 2. Checksum ───────────────────────────────────────────────────────────────
echo ""
echo "--- 2. Checksum ---"
cd "$(dirname "$TAR")"
if sha256sum -c "$(basename "$SHA_FILE")" >/dev/null 2>&1; then
  echo -e "${GREEN}[PASS]${NC} SHA-256 OK: $(cat "$SHA_FILE" | awk '{print $1}')"
  (( PASS++ )) || true
else
  echo -e "${RED}[FAIL]${NC} SHA-256 MISMATCH"
  (( FAIL++ )) || true
fi

# ── 3. Extract and inspect ────────────────────────────────────────────────────
echo ""
echo "--- 3. Structure ---"

# zstd path
for p in "$HOME/.local/bin/zstd" "/usr/local/bin/zstd" "zstd"; do
  command -v "$p" >/dev/null 2>&1 && { export PATH="$(dirname "$(which "$p" 2>/dev/null || echo "$p")")":$PATH; break; } 2>/dev/null || true
done

TMP_VERIFY="$(mktemp -d)"
trap "rm -rf '$TMP_VERIFY'" EXIT

tar -C "$TMP_VERIFY" -I zstd -xf "$TAR"
PKG="$TMP_VERIFY/Anclora-FileStudio-Linux-x64"

[[ -d "$PKG" ]] || { echo -e "${RED}[FAIL]${NC} Root directory Anclora-FileStudio-Linux-x64 missing"; (( FAIL++ )) || true; }

# Required files
for f in \
  "start-anclora-filestudio.sh" \
  "stop-anclora-filestudio.sh" \
  "diagnose-anclora-filestudio.sh" \
  "manifest.json" \
  "VERSION.txt" \
  "LEEME.txt" \
  "THIRD_PARTY_NOTICES.txt" \
  "SBOM.cdx.json" \
  "app/server.js" \
  "app/.next/static"; do
  if [[ -e "$PKG/$f" ]]; then
    echo -e "${GREEN}[PASS]${NC} $f"
    (( PASS++ )) || true
  else
    echo -e "${RED}[FAIL]${NC} Missing: $f"
    (( FAIL++ )) || true
  fi
done

# Required directories
for d in app data temp logs; do
  check "dir: $d" test -d "$PKG/$d"
done

# ── 4. Executable permissions ─────────────────────────────────────────────────
echo ""
echo "--- 4. Executable permissions ---"
for sh in start-anclora-filestudio.sh stop-anclora-filestudio.sh diagnose-anclora-filestudio.sh; do
  check "executable: $sh" test -x "$PKG/$sh"
done

# ── 5. JSON validity ──────────────────────────────────────────────────────────
echo ""
echo "--- 5. JSON files ---"
for jf in manifest.json SBOM.cdx.json; do
  if python3 -m json.tool "$PKG/$jf" >/dev/null 2>&1; then
    echo -e "${GREEN}[PASS]${NC} Valid JSON: $jf"
    (( PASS++ )) || true
  else
    echo -e "${RED}[FAIL]${NC} Invalid JSON: $jf"
    (( FAIL++ )) || true
  fi
done

# ── 6. Manifest fields ────────────────────────────────────────────────────────
echo ""
echo "--- 6. Manifest fields ---"
MANIFEST="$PKG/manifest.json"
for field in name version buildId buildDate commit platform arch capabilities; do
  VAL="$(python3 -c "import json; d=json.load(open('$MANIFEST')); print(d.get('$field',''))" 2>/dev/null || echo '')"
  require "manifest.$field" "$VAL"
done

PLATFORM="$(python3 -c "import json; print(json.load(open('$MANIFEST'))['platform'])" 2>/dev/null || echo '')"
[[ "$PLATFORM" == "linux" ]] && { echo -e "${GREEN}[PASS]${NC} platform=linux"; (( PASS++ )) || true; } || { echo -e "${RED}[FAIL]${NC} platform != linux (got: $PLATFORM)"; (( FAIL++ )) || true; }

ARCH="$(python3 -c "import json; print(json.load(open('$MANIFEST'))['arch'])" 2>/dev/null || echo '')"
[[ "$ARCH" == "x64" ]] && { echo -e "${GREEN}[PASS]${NC} arch=x64"; (( PASS++ )) || true; } || { echo -e "${RED}[FAIL]${NC} arch != x64 (got: $ARCH)"; (( FAIL++ )) || true; }

# ── 7. Native modules — Linux ELF x86-64 ─────────────────────────────────────
echo ""
echo "--- 7. Native modules (ELF x86-64) ---"

BS3_NODE="$(find "$PKG/app" -name "better_sqlite3.node" -type f 2>/dev/null | head -1 || true)"
if [[ -n "$BS3_NODE" ]]; then
  if file "$BS3_NODE" | grep -q "ELF.*x86-64"; then
    echo -e "${GREEN}[PASS]${NC} better_sqlite3.node is ELF x86-64"
    (( PASS++ )) || true
    # Dynamic linking check
    if command -v ldd >/dev/null 2>&1; then
      if ldd "$BS3_NODE" 2>/dev/null | grep -q "not found"; then
        echo -e "${YELLOW}[WARN]${NC} better_sqlite3.node has unresolved dynamic deps"
        (( WARN_COUNT++ )) || true
      else
        echo -e "${GREEN}[PASS]${NC} better_sqlite3.node dynamic deps OK"
        (( PASS++ )) || true
      fi
    fi
  else
    echo -e "${RED}[FAIL]${NC} better_sqlite3.node is NOT ELF x86-64 ($(file "$BS3_NODE"))"
    (( FAIL++ )) || true
  fi
else
  echo -e "${YELLOW}[WARN]${NC} better_sqlite3.node not found"
  (( WARN_COUNT++ )) || true
fi

SHARP_NODE="$(find "$PKG/app" -name "sharp*.node" -type f 2>/dev/null | head -1 || true)"
if [[ -n "$SHARP_NODE" ]]; then
  if file "$SHARP_NODE" | grep -q "ELF.*x86-64"; then
    echo -e "${GREEN}[PASS]${NC} sharp.node is ELF x86-64"
    (( PASS++ )) || true
  else
    echo -e "${RED}[FAIL]${NC} sharp.node is NOT ELF x86-64"
    (( FAIL++ )) || true
  fi
else
  echo -e "${YELLOW}[WARN]${NC} sharp.node not found"
  (( WARN_COUNT++ )) || true
fi

# No .dll files in Linux package
DLL_COUNT="$(find "$PKG" -name "*.dll" 2>/dev/null | wc -l)"
if [[ "$DLL_COUNT" -eq 0 ]]; then
  echo -e "${GREEN}[PASS]${NC} No .dll files (Windows artifacts absent)"
  (( PASS++ )) || true
else
  echo -e "${RED}[FAIL]${NC} $DLL_COUNT .dll file(s) found in Linux package"
  (( FAIL++ )) || true
fi

# ── 8. Security: no secrets, no .git, no dev paths ───────────────────────────
echo ""
echo "--- 8. Security ---"

SECRET_PATTERNS='BEGIN (RSA|OPENSSH|EC|PRIVATE) KEY|api[_-]?key\s*=\s*["\x27][^"]+|client[_-]?secret\s*='
if grep -rqiE "$SECRET_PATTERNS" "$PKG" --include="*.json" --include="*.env" --include="*.txt" 2>/dev/null; then
  echo -e "${RED}[FAIL]${NC} Potential secret found in package"
  (( FAIL++ )) || true
else
  echo -e "${GREEN}[PASS]${NC} No secrets detected"
  (( PASS++ )) || true
fi

if [[ -d "$PKG/.git" ]] || find "$PKG" -name ".git" -type d 2>/dev/null | grep -q .; then
  echo -e "${RED}[FAIL]${NC} .git directory found in package"
  (( FAIL++ )) || true
else
  echo -e "${GREEN}[PASS]${NC} No .git in package"
  (( PASS++ )) || true
fi

DEV_PATHS_FOUND=0
for launcher in "$PKG"/*.sh; do
  if grep -qE "convertidor_youtube_mp3|/home/toni/projects|/home/antonio" "$launcher" 2>/dev/null; then
    echo -e "${RED}[FAIL]${NC} Developer path in launcher: $(basename "$launcher")"
    DEV_PATHS_FOUND=1
    (( FAIL++ )) || true
  fi
done
[[ "$DEV_PATHS_FOUND" -eq 0 ]] && { echo -e "${GREEN}[PASS]${NC} No developer paths in launchers"; (( PASS++ )) || true; }

# ── 9. Launchers: no network ports, 127.0.0.1 binding ────────────────────────
echo ""
echo "--- 9. Launcher security ---"

if grep -q "127.0.0.1" "$PKG/start-anclora-filestudio.sh" 2>/dev/null; then
  echo -e "${GREEN}[PASS]${NC} Launcher binds to 127.0.0.1"
  (( PASS++ )) || true
else
  echo -e "${RED}[FAIL]${NC} Launcher does not explicitly bind to 127.0.0.1"
  (( FAIL++ )) || true
fi

if grep -qE "0\.0\.0\.0" "$PKG/start-anclora-filestudio.sh" 2>/dev/null; then
  echo -e "${RED}[FAIL]${NC} Launcher binds to 0.0.0.0 (INSECURE)"
  (( FAIL++ )) || true
else
  echo -e "${GREEN}[PASS]${NC} Launcher does not bind to 0.0.0.0"
  (( PASS++ )) || true
fi

# ── 10. Licenses ──────────────────────────────────────────────────────────────
echo ""
echo "--- 10. Licenses ---"
check "THIRD_PARTY_NOTICES.txt present" test -f "$PKG/THIRD_PARTY_NOTICES.txt"
check "SBOM.cdx.json present" test -f "$PKG/SBOM.cdx.json"

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo "=============================="
echo " Verification Summary"
echo "=============================="
echo -e " ${GREEN}PASS${NC}: $PASS"
echo -e " ${YELLOW}WARN${NC}: $WARN_COUNT"
echo -e " ${RED}FAIL${NC}: $FAIL"
echo ""

if [[ "$FAIL" -gt 0 ]]; then
  echo -e "${RED}VERIFICATION FAILED${NC} — $FAIL check(s) failed"
  exit 1
else
  echo -e "${GREEN}VERIFICATION PASSED${NC} — Linux portable is valid"
  exit 0
fi
