#!/usr/bin/env bash
# build-linux-portable.sh — Builds Anclora FileStudio Linux x64 portable package.
# Produces: dist/linux/Anclora-FileStudio-Linux-x64.tar.zst + .sha256
# Does NOT modify Git state. Does NOT push. Does NOT create commits.
# Does NOT require sudo. Does NOT copy host libraries.

set -euo pipefail

# ── Root detection (no hardcoded paths) ───────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# ── Outputs ───────────────────────────────────────────────────────────────────
DIST_DIR="$REPO_ROOT/dist/linux"
PACKAGE_NAME="Anclora-FileStudio-Linux-x64"
STAGING_BASE="$SCRIPT_DIR/.staging/linux"
PACKAGE_DIR="$STAGING_BASE/$PACKAGE_NAME"
TAR_FILE="$DIST_DIR/${PACKAGE_NAME}.tar.zst"
SHA_FILE="$TAR_FILE.sha256"

# ── Build metadata ─────────────────────────────────────────────────────────────
VERSION="$(node -p "require('$REPO_ROOT/package.json').version" 2>/dev/null || echo "0.1.0")"
BUILD_ID="$(git -C "$REPO_ROOT" rev-parse --short HEAD 2>/dev/null || echo "dev")"
BUILD_DATE="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
GIT_COMMIT="$(git -C "$REPO_ROOT" rev-parse HEAD 2>/dev/null || echo "unknown")"

# ── Colors ────────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
info()  { echo -e "${CYAN}[INFO]${NC}  $*"; }
ok()    { echo -e "${GREEN}[OK]${NC}    $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
die()   { echo -e "${RED}[ERROR]${NC} $*" >&2; exit 1; }

echo "=== Anclora FileStudio — Linux x64 Portable Build ==="
info "Version: $VERSION | Build: $BUILD_ID | Date: $BUILD_DATE"
echo ""

# ── Read toolchain.lock.json ──────────────────────────────────────────────────
LOCKFILE="$SCRIPT_DIR/toolchain.lock.json"
[[ -f "$LOCKFILE" ]] || die "toolchain.lock.json not found at $LOCKFILE"

NODE_LINUX_VERSION="$(python3 -c "import json; d=json.load(open('$LOCKFILE')); print(d['runtimes']['linux-x64']['version'])")"
NODE_LINUX_SHA256="$(python3 -c "import json; d=json.load(open('$LOCKFILE')); print(d['runtimes']['linux-x64']['sha256'])")"
NODE_LINUX_URL="$(python3 -c "import json; d=json.load(open('$LOCKFILE')); print(d['runtimes']['linux-x64']['sourceUrl'])")"
NODE_ABI_EXPECTED="$(python3 -c "import json; d=json.load(open('$LOCKFILE')); print(d['runtimes']['linux-x64']['abi'])")"
NODE_LINUX_TAR="node-v${NODE_LINUX_VERSION}-linux-x64.tar.gz"
NODE_CACHE_DIR="$SCRIPT_DIR/.cache/linux-portable"
NODE_CACHE="$NODE_CACHE_DIR/$NODE_LINUX_TAR"

info "Toolchain: Node.js v${NODE_LINUX_VERSION} (ABI ${NODE_ABI_EXPECTED})"

# ── Prerequisites ─────────────────────────────────────────────────────────────
info "Checking prerequisites..."

# zstd: accept user-local installation
if ! command -v zstd >/dev/null 2>&1; then
  # Try common user locations
  for p in "$HOME/.local/bin/zstd" "/usr/local/bin/zstd" "/opt/homebrew/bin/zstd"; do
    if [[ -x "$p" ]]; then export PATH="$(dirname "$p"):$PATH"; break; fi
  done
fi
command -v zstd >/dev/null 2>&1 || die "zstd not found. Install: sudo apt install zstd"
command -v node >/dev/null 2>&1 || die "Node.js not found (needed for build only)"
command -v pnpm >/dev/null 2>&1 || die "pnpm not found"
ok "Prerequisites OK (zstd=$(zstd --version | head -1 | grep -oP 'v[\d.]+' || echo ok))"

# ── Require .next/standalone ──────────────────────────────────────────────────
STANDALONE="$REPO_ROOT/.next/standalone"
STATIC_DIR="$REPO_ROOT/.next/static"
PUBLIC_DIR="$REPO_ROOT/public"

info "Building Next.js application for Desktop portable (output: standalone)..."
cd "$REPO_ROOT"
rm -rf "$REPO_ROOT/.next"
ANCLORA_FILESTUDIO_DEPLOYMENT_TARGET=desktop \
NEXT_PUBLIC_ANCLORA_FILESTUDIO_MODE=desktop \
NEXT_TELEMETRY_DISABLED=1 \
  pnpm build:desktop
[[ -f "$STANDALONE/server.js" ]] || die ".next/standalone/server.js not found after build"
ok "Next.js Desktop build complete"

# ── Download Node.js runtime into cache (before staging wipe) ────────────────
info "Preparing Node.js v${NODE_LINUX_VERSION} runtime cache..."
mkdir -p "$NODE_CACHE_DIR"

if [[ ! -f "$NODE_CACHE" ]]; then
  info "Downloading $NODE_LINUX_TAR from nodejs.org..."
  curl --fail --location --retry 3 --progress-bar \
    -o "$NODE_CACHE" "$NODE_LINUX_URL" \
    || { rm -f "$NODE_CACHE"; die "Failed to download Node.js Linux tarball"; }
fi

# Verify SHA-256
ACTUAL_SHA="$(sha256sum "$NODE_CACHE" | awk '{print $1}')"
if [[ "$ACTUAL_SHA" != "$NODE_LINUX_SHA256" ]]; then
  die "Node.js tarball SHA-256 mismatch! Expected: $NODE_LINUX_SHA256 Got: $ACTUAL_SHA"
fi
ok "Node.js v${NODE_LINUX_VERSION} tarball verified (SHA-256 OK)"

# ── Clean and prepare staging ─────────────────────────────────────────────────
info "Preparing staging directory..."
rm -rf "$PACKAGE_DIR"
mkdir -p "$PACKAGE_DIR"/{app,runtime,tools,data,temp,logs,licenses,models}

# ── Embed Node.js binary into runtime/ ───────────────────────────────────────
info "Extracting node binary into runtime/..."
TMP_NODE_EXTRACT="$(mktemp -d)"
tar -C "$TMP_NODE_EXTRACT" -xzf "$NODE_CACHE" "node-v${NODE_LINUX_VERSION}-linux-x64/bin/node" 2>/dev/null \
  || die "Failed to extract node binary from tarball"
cp "$TMP_NODE_EXTRACT/node-v${NODE_LINUX_VERSION}-linux-x64/bin/node" "$PACKAGE_DIR/runtime/node"
rm -rf "$TMP_NODE_EXTRACT"
chmod +x "$PACKAGE_DIR/runtime/node"
file "$PACKAGE_DIR/runtime/node" | grep -q "ELF.*x86-64" || die "runtime/node is not ELF x86-64"
ok "runtime/node — ELF x86-64 — Node.js v${NODE_LINUX_VERSION}"

# ── Detect ABI using bundled node ─────────────────────────────────────────────
NODE_VERSION="$("$PACKAGE_DIR/runtime/node" --version)"
NODE_ABI="$("$PACKAGE_DIR/runtime/node" -e 'console.log(process.versions.modules)')"
[[ "$NODE_ABI" == "$NODE_ABI_EXPECTED" ]] || warn "ABI mismatch: expected $NODE_ABI_EXPECTED got $NODE_ABI"
info "Bundled Node.js $NODE_VERSION (ABI $NODE_ABI)"

# ── Copy Next.js standalone (whitelist approach) ──────────────────────────────
info "Copying Next.js standalone (whitelist)..."

# server.js — the entry point
cp "$STANDALONE/server.js" "$PACKAGE_DIR/app/server.js"

# node_modules — standalone traces only what it needs (a small subset)
if [[ -d "$STANDALONE/node_modules" ]]; then
  cp -r "$STANDALONE/node_modules" "$PACKAGE_DIR/app/node_modules"
fi

# .next build output: copy all of standalone's .next except build cache.
# IMPORTANT: Do NOT exclude node_modules here — Turbopack places external module
# stubs in .next/node_modules/ (e.g. better-sqlite3-<hash>, sharp-<hash>) which
# are required by the server at runtime. This is distinct from the top-level
# standalone/node_modules/ already copied above.
mkdir -p "$PACKAGE_DIR/app/.next"
if [[ -d "$STANDALONE/.next" ]]; then
  find "$STANDALONE/.next" -mindepth 1 -maxdepth 1 \
    ! -name "cache" | while read -r item; do
    cp -r "$item" "$PACKAGE_DIR/app/.next/"
  done
fi

# Static assets (client-side JS/CSS bundles) — from the repo's .next/static
# The standalone .next/static may be absent; the repo's .next/static is authoritative
if [[ -d "$STATIC_DIR" ]]; then
  rm -rf "$PACKAGE_DIR/app/.next/static"
  cp -r "$STATIC_DIR" "$PACKAGE_DIR/app/.next/static"
fi

# Public directory (robots.txt, icons, etc.)
if [[ -d "$PUBLIC_DIR" ]]; then
  cp -r "$PUBLIC_DIR" "$PACKAGE_DIR/app/public"
else
  mkdir -p "$PACKAGE_DIR/app/public"
fi

# Minimal package.json for the standalone runtime
node -e "
const pkg = require('$REPO_ROOT/package.json');
const min = { name: pkg.name, version: pkg.version, private: true };
require('fs').writeFileSync('$PACKAGE_DIR/app/package.json', JSON.stringify(min, null, 2));
"

# ── Copy native modules for linux-x64 ────────────────────────────────────────
info "Validating native modules (linux-x64)..."

# better-sqlite3: verify .node file is correct ELF
BS3_NODE=$(find "$PACKAGE_DIR/app" -name "better_sqlite3.node" -type f 2>/dev/null | head -1)
if [[ -z "$BS3_NODE" ]]; then
  # Not in standalone node_modules — copy from project
  BS3_SRC=$(find "$REPO_ROOT/node_modules/better-sqlite3" -name "better_sqlite3.node" -type f 2>/dev/null | head -1)
  if [[ -n "$BS3_SRC" ]]; then
    BS3_DEST_DIR="$PACKAGE_DIR/app/node_modules/better-sqlite3/build/Release"
    mkdir -p "$BS3_DEST_DIR"
    cp "$BS3_SRC" "$BS3_DEST_DIR/"
    BS3_NODE="$BS3_DEST_DIR/better_sqlite3.node"
    info "Copied better-sqlite3 native module"
  fi
fi

if [[ -n "${BS3_NODE:-}" ]] && [[ -f "$BS3_NODE" ]]; then
  file "$BS3_NODE" | grep -q "ELF.*x86-64" || die "better_sqlite3.node is not a Linux x64 ELF binary"
  # Verify it loads with the current Node
  node -e "require('$BS3_NODE')" 2>/dev/null && ok "better-sqlite3 loads OK" || warn "better-sqlite3 load check failed (may still work in runtime)"
else
  warn "better_sqlite3.node not found in package — SQLite persistence disabled"
fi

# ── Sharp 0.35.1 + libvips 8.18.3: mandatory packaging from pnpm store ────────
# Root cause: Next.js standalone output trace copies .next/standalone/node_modules/
# but does NOT follow .so files. The @img+sharp-libvips-linux-x64@1.3.0/lib/
# directory in standalone only contains index.js — libvips-cpp.so.8.18.3 (17MB)
# is missing. We must supplement the package with the complete lib/ from pnpm.
info "Packaging Sharp 0.35.1 + libvips 8.18.3 from pnpm store (mandatory)..."

PNPM_STORE="$REPO_ROOT/node_modules/.pnpm"
LIBVIPS_SRC="$PNPM_STORE/@img+sharp-libvips-linux-x64@1.3.0/node_modules/@img/sharp-libvips-linux-x64"
SHARP_X64_SRC="$PNPM_STORE/@img+sharp-linux-x64@0.35.1/node_modules/@img/sharp-linux-x64"

SHARP_NODE_SRC="$SHARP_X64_SRC/lib/sharp-linux-x64-0.35.1.node"
LIBVIPS_SO_SRC="$LIBVIPS_SRC/lib/libvips-cpp.so.8.18.3"

# Hard fail if sources are missing — do not silently degrade
[[ -f "$SHARP_NODE_SRC" ]] || die "MISSING: $SHARP_NODE_SRC — run 'pnpm install --frozen-lockfile'"
[[ -f "$LIBVIPS_SO_SRC" ]] || die "MISSING: $LIBVIPS_SO_SRC — run 'pnpm install --frozen-lockfile'"

# Validate source files are ELF x86-64 before copying
file "$SHARP_NODE_SRC" | grep -q "ELF.*x86-64" || die "sharp-linux-x64-0.35.1.node source is not ELF x86-64"
file "$LIBVIPS_SO_SRC" | grep -q "ELF.*x86-64" || die "libvips-cpp.so.8.18.3 source is not ELF x86-64"

# Destination: mirror pnpm structure already present from standalone copy
LIBVIPS_PKG="$PACKAGE_DIR/app/node_modules/.pnpm/@img+sharp-libvips-linux-x64@1.3.0/node_modules/@img/sharp-libvips-linux-x64"
mkdir -p "$LIBVIPS_PKG/lib"

# Overwrite the incomplete lib/ (which only has index.js from standalone trace)
# with the complete version from pnpm — this physically places the .so in the package.
# Do NOT use symlinks here: the .so must be a real file, not a pointer outside the package.
cp -a "$LIBVIPS_SRC/lib/." "$LIBVIPS_PKG/lib/"

# The standalone output does NOT copy the pnpm intra-package symlink:
#   @img+sharp-linux-x64@0.35.1/node_modules/@img/sharp-libvips-linux-x64
#     -> ../../../@img+sharp-libvips-linux-x64@1.3.0/node_modules/@img/sharp-libvips-linux-x64
# This symlink is in the RPATH of sharp-linux-x64-0.35.1.node ($ORIGIN/../../sharp-libvips-linux-x64/lib/).
# Without it the dynamic linker cannot find libvips-cpp.so.8.18.3 at runtime.
# We recreate the same relative symlink that pnpm uses.
SHARP_X64_IMG_DIR="$PACKAGE_DIR/app/node_modules/.pnpm/@img+sharp-linux-x64@0.35.1/node_modules/@img"
mkdir -p "$SHARP_X64_IMG_DIR"
LIBVIPS_SYMLINK="$SHARP_X64_IMG_DIR/sharp-libvips-linux-x64"
if [[ ! -e "$LIBVIPS_SYMLINK" ]] && [[ ! -L "$LIBVIPS_SYMLINK" ]]; then
  ln -s "../../../@img+sharp-libvips-linux-x64@1.3.0/node_modules/@img/sharp-libvips-linux-x64" "$LIBVIPS_SYMLINK"
  info "Created sharp-libvips-linux-x64 symlink in @img+sharp-linux-x64@0.35.1"
fi

# Mandatory post-copy validation
LIBVIPS_SO_PKG="$LIBVIPS_PKG/lib/libvips-cpp.so.8.18.3"
[[ -f "$LIBVIPS_SO_PKG" ]] || die "libvips-cpp.so.8.18.3 still missing after copy — check pnpm store"
[[ -L "$LIBVIPS_SO_PKG" ]] && die "libvips-cpp.so.8.18.3 is a symlink — must be a real file in the package"
file "$LIBVIPS_SO_PKG" | grep -q "ELF.*x86-64" || die "libvips-cpp.so.8.18.3 in package is not ELF x86-64"

# Validate sharp .node is present (was traced by standalone into .pnpm tree)
SHARP_NODE="$(find "$PACKAGE_DIR/app" -name "sharp-linux-x64-0.35.1.node" -type f 2>/dev/null | head -1 || true)"
[[ -n "$SHARP_NODE" ]] || die "sharp-linux-x64-0.35.1.node not found in package after standalone copy"
file "$SHARP_NODE" | grep -q "ELF.*x86-64" || die "sharp-linux-x64-0.35.1.node in package is not ELF x86-64"

# ldd check: RPATH in the .node uses $ORIGIN/../../sharp-libvips-linux-x64/lib/
# After our copy the symlink resolves to the package's libvips lib/ where .so now lives.
if command -v ldd >/dev/null 2>&1; then
  LDD_OUT="$(ldd "$SHARP_NODE" 2>&1 || true)"
  if echo "$LDD_OUT" | grep -q "not found"; then
    UNRESOLVED="$(echo "$LDD_OUT" | grep "not found")"
    die "sharp .node has unresolved dynamic dependencies:\n$UNRESOLVED"
  else
    ok "sharp .node dynamic deps OK (ldd — no 'not found')"
  fi
fi

ok "Sharp 0.35.1 + libvips 8.18.3 packaged (libvips-cpp.so.8.18.3 is real file, ELF x86-64)"

# Verify: no .dll files in Linux package (Windows artifacts)
DLL_COUNT=$(find "$PACKAGE_DIR" -name "*.dll" | wc -l)
if [[ "$DLL_COUNT" -gt 0 ]]; then
  die "Windows .dll files found in Linux package (count: $DLL_COUNT)"
fi
ok "No .dll files in package (OK)"

# ── Detect available system tools ─────────────────────────────────────────────
info "Detecting system tools..."

declare -A TOOL_VERSIONS=()
declare -A TOOLS_BUNDLED=()

detect_tool() {
  local name="$1" bin="$2"
  if command -v "$bin" >/dev/null 2>&1; then
    TOOL_VERSIONS["$name"]="$("$bin" --version 2>&1 | head -1 | sed 's/\x1b\[[0-9;]*m//g' || echo 'detected')"
    TOOLS_BUNDLED["$name"]="system"
  else
    TOOL_VERSIONS["$name"]="not-found"
    TOOLS_BUNDLED["$name"]="absent"
  fi
}

detect_tool "ffmpeg"    "ffmpeg"
detect_tool "ffprobe"   "ffprobe"
detect_tool "yt-dlp"   "yt-dlp"
detect_tool "qpdf"      "qpdf"
detect_tool "7z"        "7zz"
[[ "${TOOLS_BUNDLED["7z"]}" == "absent" ]] && detect_tool "7z" "7z"
detect_tool "pandoc"    "pandoc"
detect_tool "tesseract" "tesseract"
detect_tool "pdftoppm"  "pdftoppm"
detect_tool "calibre"   "calibredb"

for t in ffmpeg ffprobe yt-dlp qpdf 7z; do
  if [[ "${TOOLS_BUNDLED[$t]}" == "absent" ]]; then
    warn "Tool '$t' not available on this system — capability will be disabled"
  else
    ok "$t: ${TOOL_VERSIONS[$t]}"
  fi
done

# ── Compute capabilities from actually available tools ────────────────────────
CAPABILITIES="[]"
CAPS=()
# Data Engine is always available (pure Node)
CAPS+=("\"data\"")
# Sharp always bundled
[[ -n "${SHARP_NODE:-}" ]] && CAPS+=("\"image\"")
# SQLite always bundled
[[ -n "${BS3_NODE:-}" ]] && CAPS+=("\"history\"")
[[ "${TOOLS_BUNDLED["ffmpeg"]}" == "system" ]] && CAPS+=("\"audio\"" "\"video\"" "\"thumbnail\"")
[[ "${TOOLS_BUNDLED["yt-dlp"]}" == "system" ]] && CAPS+=("\"youtube\"")
[[ "${TOOLS_BUNDLED["qpdf"]}" == "system" ]] && CAPS+=("\"pdf\"")
[[ "${TOOLS_BUNDLED["7z"]}" == "system" ]] && CAPS+=("\"archive\"")
[[ "${TOOLS_BUNDLED["pandoc"]}" == "system" ]] && CAPS+=("\"document\"")
[[ "${TOOLS_BUNDLED["tesseract"]}" == "system" ]] && CAPS+=("\"ocr\"")
[[ "${TOOLS_BUNDLED["calibre"]}" == "system" ]] && CAPS+=("\"ebook\"")
CAPABILITIES="[$(IFS=,; echo "${CAPS[*]}")]"

# ── Tools manifest (only what's actually present) ─────────────────────────────
# Write tool entries to a temp JSON file to avoid shell quoting issues with version strings
TOOLS_JSON_FILE="$(mktemp /tmp/anclora-tools-XXXXXX.json)"
trap "rm -f '$TOOLS_JSON_FILE'" EXIT
python3 - "$TOOLS_JSON_FILE" << 'PYTOOLS'
import sys, json, subprocess, shutil

tools = [
  ("ffmpeg",     "ffmpeg"),
  ("ffprobe",    "ffprobe"),
  ("yt-dlp",     "yt-dlp"),
  ("qpdf",       "qpdf"),
  ("7z",         "7zz"),
  ("7z",         "7z"),
  ("pandoc",     "pandoc"),
  ("tesseract",  "tesseract"),
  ("pdftoppm",   "pdftoppm"),
  ("calibre",    "calibredb"),
]

seen = set()
out = []
for tool_id, binary in tools:
  if tool_id in seen:
    continue
  path = shutil.which(binary)
  if path:
    try:
      ver = subprocess.run([binary, "--version"], capture_output=True, text=True, timeout=5)
      version_line = (ver.stdout or ver.stderr or "").splitlines()[0].strip()
    except Exception:
      version_line = "detected"
    out.append({"id": tool_id, "source": "system", "version": version_line})
    seen.add(tool_id)

json.dump(out, open(sys.argv[1], "w"), ensure_ascii=False)
print(f"Tool manifest: {len(out)} tools")
PYTOOLS

TOOLS_JSON="$(cat "$TOOLS_JSON_FILE")"

# ── Launchers ─────────────────────────────────────────────────────────────────
info "Creating launchers..."

cat > "$PACKAGE_DIR/start-anclora-filestudio.sh" << 'LAUNCH'
#!/usr/bin/env bash
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NODE="$DIR/runtime/node"

# Self-contained: use the bundled Node.js runtime
if [[ ! -x "$NODE" ]]; then
  echo "[ERROR] runtime/node not found at $NODE"
  echo "        Re-extract the package from the original archive."
  exit 1
fi

export ANCLORA_FILESTUDIO_DATA_DIR="$DIR/data"
export ANCLORA_FILESTUDIO_TEMP_DIR="$DIR/temp"
export ANCLORA_FILESTUDIO_LOG_DIR="$DIR/logs"
export ANCLORA_FILESTUDIO_TOOLS_DIR="$DIR/tools"
export NODE_ENV="production"

# Port selection: use env or find a free port in range 3847-3857
if [[ -z "${ANCLORA_FILESTUDIO_PORT:-}" ]]; then
  for p in 3847 3848 3849 3850 3851 3852 3853 3854 3855 3856 3857; do
    if ! ss -ltn 2>/dev/null | grep -q ":$p " && \
       ! netstat -ltn 2>/dev/null | grep -q ":$p "; then
      ANCLORA_FILESTUDIO_PORT="$p"
      break
    fi
  done
  : "${ANCLORA_FILESTUDIO_PORT:=3847}"
fi
export PORT="$ANCLORA_FILESTUDIO_PORT"
export HOSTNAME="127.0.0.1"

mkdir -p "$DIR/data" "$DIR/temp" "$DIR/logs"

PID_FILE="$DIR/anclora-filestudio.pid"

if [[ -f "$PID_FILE" ]]; then
  OLD_PID="$(cat "$PID_FILE")"
  if kill -0 "$OLD_PID" 2>/dev/null; then
    echo "Anclora FileStudio ya está corriendo (PID $OLD_PID)"
    echo "Usa ./stop-anclora-filestudio.sh primero."
    exit 1
  else
    rm -f "$PID_FILE"
  fi
fi

cd "$DIR/app"
echo "Iniciando Anclora FileStudio en http://127.0.0.1:$PORT ..."
"$NODE" server.js >> "$DIR/logs/app.log" 2>&1 &
APP_PID="$!"
echo "$APP_PID" > "$PID_FILE"

# Wait for health endpoint
for i in $(seq 1 30); do
  if curl -sf "http://127.0.0.1:$PORT/api/health" >/dev/null 2>&1; then
    echo "Listo en http://127.0.0.1:$PORT (PID $APP_PID)"
    xdg-open "http://127.0.0.1:$PORT" 2>/dev/null || true
    exit 0
  fi
  sleep 1
done

echo "La app tardó demasiado en responder. Revisa logs/app.log"
exit 1
LAUNCH

cat > "$PACKAGE_DIR/stop-anclora-filestudio.sh" << 'STOP'
#!/usr/bin/env bash
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PID_FILE="$DIR/anclora-filestudio.pid"
if [[ -f "$PID_FILE" ]]; then
  PID="$(cat "$PID_FILE")"
  if kill -0 "$PID" 2>/dev/null; then
    # Kill only this specific process tree, not all node processes
    kill -- "-$(ps -o pgid= -p "$PID" 2>/dev/null | tr -d ' ')" 2>/dev/null || kill "$PID" 2>/dev/null || true
    echo "Anclora FileStudio detenido (PID $PID)"
  else
    echo "El proceso $PID ya no está corriendo"
  fi
  rm -f "$PID_FILE"
else
  echo "No se encontró PID file — la app puede no estar corriendo"
fi
STOP

cat > "$PACKAGE_DIR/diagnose-anclora-filestudio.sh" << 'DIAG'
#!/usr/bin/env bash
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NODE="$DIR/runtime/node"
echo "=== Anclora FileStudio — Diagnóstico ==="
echo ""
echo "--- Directorio ---"
echo "Raíz: $DIR"
df -h "$DIR" | tail -1
echo ""
echo "--- Runtime (bundled) ---"
if [[ -f "$DIR/app/server.js" ]]; then
  echo "server.js: OK"
else
  echo "server.js: FALTA"
fi
if [[ -x "$NODE" ]]; then
  echo "Node.js (bundled): $("$NODE" --version)"
else
  echo "Node.js (bundled): NO ENCONTRADO (runtime/node)"
fi
echo ""
echo "--- Módulos nativos ---"
BS3="$(find "$DIR/app" -name 'better_sqlite3.node' 2>/dev/null | head -1)"
[[ -n "$BS3" ]] && echo "better-sqlite3: OK ($BS3)" || echo "better-sqlite3: NO ENCONTRADO"
SHARP="$(find "$DIR/app" -name 'sharp*.node' 2>/dev/null | head -1)"
[[ -n "$SHARP" ]] && echo "sharp: OK" || echo "sharp: NO ENCONTRADO"
echo ""
echo "--- Herramientas del sistema ---"
for cmd in ffmpeg ffprobe yt-dlp qpdf 7zz 7z pandoc tesseract pdftoppm calibredb; do
  if command -v "$cmd" >/dev/null 2>&1; then
    VER="$("$cmd" --version 2>&1 | head -1)"
    echo "$cmd: $VER"
  else
    echo "$cmd: NO INSTALADO"
  fi
done
echo ""
echo "--- Estado ---"
PID_FILE="$DIR/anclora-filestudio.pid"
if [[ -f "$PID_FILE" ]] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null; then
  echo "Proceso: CORRIENDO (PID $(cat "$PID_FILE"))"
else
  echo "Proceso: NO CORRIENDO"
fi
echo ""
echo "--- Manifest ---"
[[ -f "$DIR/manifest.json" ]] && cat "$DIR/manifest.json" | python3 -m json.tool 2>/dev/null || cat "$DIR/manifest.json"
DIAG

chmod +x "$PACKAGE_DIR/start-anclora-filestudio.sh" \
         "$PACKAGE_DIR/stop-anclora-filestudio.sh" \
         "$PACKAGE_DIR/diagnose-anclora-filestudio.sh"

ok "Launchers created"

# ── VERSION.txt ───────────────────────────────────────────────────────────────
printf "Anclora FileStudio %s\nBuild: %s\nDate: %s\nCommit: %s\nPlatform: linux-x64\n" \
  "$VERSION" "$BUILD_ID" "$BUILD_DATE" "$GIT_COMMIT" > "$PACKAGE_DIR/VERSION.txt"

# ── LEEME.txt ─────────────────────────────────────────────────────────────────
cat > "$PACKAGE_DIR/LEEME.txt" << README
Anclora FileStudio ${VERSION} — Linux x64 Portable
===================================================

INICIO:
  ./start-anclora-filestudio.sh

PARADA:
  ./stop-anclora-filestudio.sh

DIAGNÓSTICO:
  ./diagnose-anclora-filestudio.sh

REQUISITOS DEL SISTEMA:
  - Node.js 20+ (ya incluido en el standalone de la app)
  - glibc 2.31+ (Ubuntu 20.04+, Debian 11+, cualquier distribución moderna)

HERRAMIENTAS OPCIONALES (instalar con apt o el gestor de paquetes del sistema):
  sudo apt install ffmpeg yt-dlp qpdf p7zip-full
  sudo apt install pandoc tesseract-ocr tesseract-ocr-spa tesseract-ocr-eng poppler-utils

DATOS:
  Los datos se guardan en ./data/ — no borres esta carpeta al actualizar.
  Los logs se escriben en ./logs/

PUERTOS:
  La aplicación escucha solo en 127.0.0.1 (loopback).
  Puerto por defecto: 3847 (configurable con ANCLORA_FILESTUDIO_PORT).

SOPORTE: https://github.com/ToniIAPro73/Anclora-FileStudio
README

# ── manifest.json ─────────────────────────────────────────────────────────────
info "Generating manifest.json..."

python3 << PYEOF
import json, os

tools_json = json.load(open("$TOOLS_JSON_FILE"))
caps = json.loads('$CAPABILITIES')

bs3_node = "$BS3_NODE"
sharp_node = "$SHARP_NODE"

manifest = {
  "name": "Anclora FileStudio",
  "version": "$VERSION",
  "buildId": "$BUILD_ID",
  "buildDate": "$BUILD_DATE",
  "commit": "$GIT_COMMIT",
  "platform": "linux",
  "arch": "x64",
  "packageName": "$PACKAGE_NAME",
  "toolchainId": "anclora-filestudio-linux-x64-v1",
  "runtime": {
    "engine": "node",
    "version": "$NODE_VERSION",
    "abi": "$NODE_ABI",
    "source": "system"
  },
  "components": {
    "nextStandalone": True,
    "dataEngine": True,
    "betterSqlite3": bool(bs3_node and os.path.exists(bs3_node)),
    "sharp": bool(sharp_node and os.path.exists(sharp_node))
  },
  "tools": tools_json,
  "capabilities": caps,
  "licenses": [
    {"id": "MIT", "component": "Anclora FileStudio"},
    {"id": "MIT", "component": "Node.js"},
    {"id": "MIT", "component": "Next.js"},
    {"id": "MIT", "component": "better-sqlite3"},
    {"id": "Apache-2.0", "component": "sharp"}
  ],
  "distribution": "Core",
  "notes": "External tools (ffmpeg, yt-dlp, qpdf, etc.) must be installed separately on Linux."
}

with open("$PACKAGE_DIR/manifest.json", "w") as f:
    json.dump(manifest, f, indent=2)

print(f"manifest.json: {len(caps)} capabilities, {len(tools_json)} tools")
PYEOF

ok "manifest.json generated"

# ── THIRD_PARTY_NOTICES.txt ───────────────────────────────────────────────────
cp "$REPO_ROOT/THIRD_PARTY_NOTICES.txt" "$PACKAGE_DIR/THIRD_PARTY_NOTICES.txt" 2>/dev/null || \
  echo "Anclora FileStudio includes open source software. See licenses/ directory." \
    > "$PACKAGE_DIR/THIRD_PARTY_NOTICES.txt"

# Copy license files if present
cp -r "$REPO_ROOT/licenses" "$PACKAGE_DIR/licenses/" 2>/dev/null || true

# ── SBOM (minimal CycloneDX) ──────────────────────────────────────────────────
cat > "$PACKAGE_DIR/SBOM.cdx.json" << SBOM
{
  "bomFormat": "CycloneDX",
  "specVersion": "1.4",
  "version": 1,
  "metadata": {
    "timestamp": "$BUILD_DATE",
    "component": {
      "type": "application",
      "name": "Anclora FileStudio",
      "version": "$VERSION"
    }
  },
  "components": [
    {"type":"library","name":"next","version":"$(node -p "require('$REPO_ROOT/node_modules/next/package.json').version" 2>/dev/null || echo 'unknown')","licenses":[{"license":{"id":"MIT"}}]},
    {"type":"library","name":"react","version":"$(node -p "require('$REPO_ROOT/node_modules/react/package.json').version" 2>/dev/null || echo 'unknown')","licenses":[{"license":{"id":"MIT"}}]},
    {"type":"library","name":"better-sqlite3","version":"$(node -p "require('$REPO_ROOT/node_modules/better-sqlite3/package.json').version" 2>/dev/null || echo 'unknown')","licenses":[{"license":{"id":"MIT"}}]},
    {"type":"library","name":"sharp","version":"$(node -p "require('$REPO_ROOT/node_modules/sharp/package.json').version" 2>/dev/null || echo 'unknown')","licenses":[{"license":{"id":"Apache-2.0"}}]}
  ]
}
SBOM

# ── Verify no developer paths leaked ─────────────────────────────────────────
info "Checking for developer path leakage..."

# server.js embeds next config including outputFileTracingRoot — this is expected
# but we must ensure launcher scripts don't have hardcoded paths
DEV_PATHS_IN_LAUNCHERS=0
for f in "$PACKAGE_DIR"/*.sh; do
  if grep -qE "/home/[a-z]+/projects|convertidor_youtube|anclora-fileStudio" "$f" 2>/dev/null; then
    warn "Developer path found in launcher: $f"
    DEV_PATHS_IN_LAUNCHERS=1
  fi
done
[[ "$DEV_PATHS_IN_LAUNCHERS" -eq 0 ]] && ok "No developer paths in launchers"

# ── Check: no .env.local or secrets ──────────────────────────────────────────
find "$PACKAGE_DIR" \( -name ".env.local" -o -name ".env" -o -name "*.pem" -o -name "*.key" \) -type f 2>/dev/null | while read -r f; do
  die "Secret file found in package: $f"
done
ok "No secrets found in package"

# ── Check: no .git directory ─────────────────────────────────────────────────
[[ -d "$PACKAGE_DIR/.git" ]] && die ".git directory found in package"
find "$PACKAGE_DIR" -name ".git" -type d 2>/dev/null | head -1 | grep -q . && die ".git found in package" || ok "No .git in package"

# ── Fix executable permissions ────────────────────────────────────────────────
chmod +x "$PACKAGE_DIR"/*.sh

# ── Package ────────────────────────────────────────────────────────────────────
info "Creating tar.zst package..."
mkdir -p "$DIST_DIR"
rm -f "$TAR_FILE" "$SHA_FILE"

# Reproducible tar (sorted, no atime, SOURCE_DATE_EPOCH for timestamps)
export SOURCE_DATE_EPOCH="$(git -C "$REPO_ROOT" log -1 --format=%ct 2>/dev/null || date +%s)"
tar -C "$STAGING_BASE" \
  --sort=name \
  --mtime="@${SOURCE_DATE_EPOCH}" \
  --owner=0 \
  --group=0 \
  --numeric-owner \
  -cf - "$PACKAGE_NAME/" | zstd -T0 -19 -o "$TAR_FILE"

SHA="$(sha256sum "$TAR_FILE" | awk '{print $1}')"
echo "$SHA  ${PACKAGE_NAME}.tar.zst" > "$SHA_FILE"

SIZE="$(du -sh "$TAR_FILE" | awk '{print $1}')"

ok ""
ok "=== Build complete ==="
ok "Package : $TAR_FILE"
ok "Size    : $SIZE"
ok "SHA-256 : $SHA"
ok "Verify  : sha256sum -c $SHA_FILE"
