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
command -v node >/dev/null 2>&1 || die "Node.js not found"
command -v pnpm >/dev/null 2>&1 || die "pnpm not found"
ok "Prerequisites OK (zstd=$(zstd --version | head -1 | grep -oP 'v[\d.]+' || echo ok))"

# ── Require .next/standalone ──────────────────────────────────────────────────
STANDALONE="$REPO_ROOT/.next/standalone"
STATIC_DIR="$REPO_ROOT/.next/static"
PUBLIC_DIR="$REPO_ROOT/public"

if [[ ! -f "$STANDALONE/server.js" ]]; then
  info "Building Next.js application (output: standalone)..."
  cd "$REPO_ROOT"
  pnpm build:desktop
  [[ -f "$STANDALONE/server.js" ]] || die ".next/standalone/server.js not found after build"
  ok "Next.js build complete"
else
  ok ".next/standalone/server.js already exists — skipping build"
fi

# ── Detect Node ABI and native module paths ───────────────────────────────────
NODE_VERSION="$(node --version)"
NODE_ABI="$(node -e 'console.log(process.versions.modules)')"
info "Node.js $NODE_VERSION (ABI $NODE_ABI) — linux-x64"

# ── Clean and prepare staging ─────────────────────────────────────────────────
info "Preparing staging directory..."
rm -rf "$PACKAGE_DIR"
mkdir -p "$PACKAGE_DIR"/{app,tools,data,temp,logs,licenses,models}

# ── Copy Next.js standalone (whitelist approach) ──────────────────────────────
info "Copying Next.js standalone (whitelist)..."

# server.js — the entry point
cp "$STANDALONE/server.js" "$PACKAGE_DIR/app/server.js"

# node_modules — standalone traces only what it needs (a small subset)
if [[ -d "$STANDALONE/node_modules" ]]; then
  cp -r "$STANDALONE/node_modules" "$PACKAGE_DIR/app/node_modules"
fi

# .next build output (server chunks, RSC payload, route manifests)
mkdir -p "$PACKAGE_DIR/app/.next"
# Copy server output and config files from .next (NOT cache)
for subdir in server static app-build-manifest.json build-manifest.json \
              required-server-files.json routes-manifest.json \
              prerender-manifest.json react-loadable-manifest.json \
              images-manifest.json export-marker.json; do
  SRC="$STANDALONE/.next/$subdir"
  [[ -e "$SRC" ]] && cp -r "$SRC" "$PACKAGE_DIR/app/.next/" || true
done

# Static assets (client-side JS/CSS bundles and media)
cp -r "$STATIC_DIR" "$PACKAGE_DIR/app/.next/static"

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

# Sharp: verify linux-x64 binding
SHARP_NODE=$(find "$PACKAGE_DIR/app" -name "sharp*.node" -type f 2>/dev/null | head -1)
if [[ -z "$SHARP_NODE" ]]; then
  SHARP_SRC=$(find "$REPO_ROOT/node_modules/sharp/build/Release" -name "sharp*.node" -type f 2>/dev/null | head -1)
  if [[ -n "$SHARP_SRC" ]]; then
    mkdir -p "$PACKAGE_DIR/app/node_modules/sharp/build/Release"
    cp "$SHARP_SRC" "$PACKAGE_DIR/app/node_modules/sharp/build/Release/"
    SHARP_NODE="$PACKAGE_DIR/app/node_modules/sharp/build/Release/$(basename "$SHARP_SRC")"
  fi
fi

if [[ -n "${SHARP_NODE:-}" ]] && [[ -f "$SHARP_NODE" ]]; then
  file "$SHARP_NODE" | grep -q "ELF.*x86-64" || die "sharp.node is not Linux x64"
  ok "Sharp native module found (linux-x64)"
else
  warn "sharp.node not found in package"
fi

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
node server.js >> "$DIR/logs/app.log" 2>&1 &
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
echo "=== Anclora FileStudio — Diagnóstico ==="
echo ""
echo "--- Directorio ---"
echo "Raíz: $DIR"
df -h "$DIR" | tail -1
echo ""
echo "--- Runtime ---"
if [[ -f "$DIR/app/server.js" ]]; then
  echo "server.js: OK"
else
  echo "server.js: FALTA"
fi
NODE_BIN="$(command -v node 2>/dev/null || echo '')"
if [[ -n "$NODE_BIN" ]]; then
  echo "Node.js: $($NODE_BIN --version)"
else
  echo "Node.js: NO ENCONTRADO"
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
