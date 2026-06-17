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
  "app/.next/static" \
  "runtime/node"; do
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

# ── 6b. Bundled Node.js runtime ───────────────────────────────────────────────
echo ""
echo "--- 6b. Bundled Node.js runtime ---"
NODE_BIN="$PKG/runtime/node"
if [[ -f "$NODE_BIN" ]] && [[ -x "$NODE_BIN" ]]; then
  if file "$NODE_BIN" | grep -q "ELF.*x86-64"; then
    NODE_VER="$("$NODE_BIN" --version 2>/dev/null || echo unknown)"
    echo -e "${GREEN}[PASS]${NC} runtime/node: ELF x86-64 — $NODE_VER"
    (( PASS++ )) || true
    # Check launcher uses bundled node
    if grep -q '"$NODE" server.js\|runtime/node' "$PKG/start-anclora-filestudio.sh" 2>/dev/null; then
      echo -e "${GREEN}[PASS]${NC} Launcher uses bundled node"
      (( PASS++ )) || true
    else
      echo -e "${RED}[FAIL]${NC} Launcher does NOT reference bundled runtime/node"
      (( FAIL++ )) || true
    fi
  else
    echo -e "${RED}[FAIL]${NC} runtime/node is NOT ELF x86-64"
    (( FAIL++ )) || true
  fi
else
  echo -e "${RED}[FAIL]${NC} runtime/node missing or not executable"
  (( FAIL++ )) || true
fi

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

SHARP_NODE="$(find "$PKG/app" -name "sharp-linux-x64-0.35.1.node" -type f 2>/dev/null | head -1 || true)"
if [[ -n "$SHARP_NODE" ]]; then
  if file "$SHARP_NODE" | grep -q "ELF.*x86-64"; then
    echo -e "${GREEN}[PASS]${NC} sharp-linux-x64-0.35.1.node is ELF x86-64"
    (( PASS++ )) || true
  else
    echo -e "${RED}[FAIL]${NC} sharp-linux-x64-0.35.1.node is NOT ELF x86-64"
    (( FAIL++ )) || true
  fi
else
  echo -e "${RED}[FAIL]${NC} sharp-linux-x64-0.35.1.node not found (Sharp not packaged)"
  (( FAIL++ )) || true
fi

# ── 7b. Sharp libvips runtime completeness ────────────────────────────────────
echo ""
echo "--- 7b. Sharp libvips 8.18.3 runtime ---"

LIBVIPS_PKG_DIR="$PKG/app/node_modules/.pnpm/@img+sharp-libvips-linux-x64@1.3.0/node_modules/@img/sharp-libvips-linux-x64"

# Check directory exists
if [[ -d "$LIBVIPS_PKG_DIR" ]]; then
  echo -e "${GREEN}[PASS]${NC} @img/sharp-libvips-linux-x64@1.3.0 directory exists"
  (( PASS++ )) || true
else
  echo -e "${RED}[FAIL]${NC} @img/sharp-libvips-linux-x64@1.3.0 directory missing"
  (( FAIL++ )) || true
fi

# Check libvips-cpp.so.8.18.3 physically present
LIBVIPS_SO="$LIBVIPS_PKG_DIR/lib/libvips-cpp.so.8.18.3"
if [[ -f "$LIBVIPS_SO" ]] && [[ ! -L "$LIBVIPS_SO" ]]; then
  echo -e "${GREEN}[PASS]${NC} libvips-cpp.so.8.18.3 is a real file (not symlink)"
  (( PASS++ )) || true
  # Validate it is ELF x86-64
  if file "$LIBVIPS_SO" | grep -q "ELF.*x86-64"; then
    echo -e "${GREEN}[PASS]${NC} libvips-cpp.so.8.18.3 is ELF x86-64"
    (( PASS++ )) || true
  else
    echo -e "${RED}[FAIL]${NC} libvips-cpp.so.8.18.3 is NOT ELF x86-64 ($(file "$LIBVIPS_SO" 2>/dev/null | head -1))"
    (( FAIL++ )) || true
  fi
  # Check size > 1MB (the real .so is ~17MB; a stub would be tiny)
  SO_SIZE="$(stat -c%s "$LIBVIPS_SO" 2>/dev/null || echo 0)"
  if [[ "$SO_SIZE" -gt 1000000 ]]; then
    echo -e "${GREEN}[PASS]${NC} libvips-cpp.so.8.18.3 size OK ($(( SO_SIZE / 1024 / 1024 ))MB)"
    (( PASS++ )) || true
  else
    echo -e "${RED}[FAIL]${NC} libvips-cpp.so.8.18.3 too small (${SO_SIZE} bytes) — likely a stub"
    (( FAIL++ )) || true
  fi
elif [[ -L "$LIBVIPS_SO" ]]; then
  echo -e "${RED}[FAIL]${NC} libvips-cpp.so.8.18.3 is a symlink — must be a real file in the package"
  (( FAIL++ )) || true
else
  echo -e "${RED}[FAIL]${NC} libvips-cpp.so.8.18.3 MISSING from package"
  (( FAIL++ )) || true
fi

# No broken symlinks in the Sharp pnpm tree
BROKEN_SYMLINKS="$(find "$PKG/app/node_modules/.pnpm/sharp@0.35.1" -xtype l 2>/dev/null || true)"
if [[ -z "$BROKEN_SYMLINKS" ]]; then
  echo -e "${GREEN}[PASS]${NC} No broken symlinks in sharp@0.35.1 pnpm tree"
  (( PASS++ )) || true
else
  echo -e "${RED}[FAIL]${NC} Broken symlinks in sharp pnpm tree:"
  echo "$BROKEN_SYMLINKS" | head -5
  (( FAIL++ )) || true
fi

# ldd check on the .node file
if [[ -n "$SHARP_NODE" ]] && command -v ldd >/dev/null 2>&1; then
  LDD_OUT="$(ldd "$SHARP_NODE" 2>&1 || true)"
  if echo "$LDD_OUT" | grep -q "not found"; then
    echo -e "${RED}[FAIL]${NC} sharp .node has unresolved dynamic deps:"
    echo "$LDD_OUT" | grep "not found"
    (( FAIL++ )) || true
  else
    echo -e "${GREEN}[PASS]${NC} sharp .node dynamic deps OK (ldd)"
    (( PASS++ )) || true
  fi
fi

# Real Sharp load test using bundled node
# require('sharp') works because node_modules/sharp symlinks to .pnpm/sharp@0.35.1
NODE_BIN_VERIFY="${PKG}/runtime/node"
if [[ -x "$NODE_BIN_VERIFY" ]] && [[ -n "$SHARP_NODE" ]]; then
  SHARP_LOAD_RESULT="$(cd "$PKG/app" && "$NODE_BIN_VERIFY" -e "
const s = require('sharp');
const v = s.versions;
if (!v || !v.sharp || !v.vips) { console.error('versions missing'); process.exit(1); }
console.log('sharp=' + v.sharp + ' vips=' + v.vips);
" 2>&1 || echo "FAILED")"
  if echo "$SHARP_LOAD_RESULT" | grep -q "sharp=0.35.1.*vips=8.18.3"; then
    echo -e "${GREEN}[PASS]${NC} Sharp loads with bundled node: $SHARP_LOAD_RESULT"
    (( PASS++ )) || true
  else
    echo -e "${RED}[FAIL]${NC} Sharp load test with bundled node failed: $SHARP_LOAD_RESULT"
    (( FAIL++ )) || true
  fi
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
