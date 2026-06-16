#!/usr/bin/env bash
# build-linux-portable.sh — Builds Anclora FileStudio Linux x64 portable package.
# Produces: dist/linux/Anclora-FileStudio-Linux-x64.tar.zst + .sha256
# Does NOT modify Git state. Does NOT push. Does NOT create commits.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DIST_DIR="$REPO_ROOT/dist/linux"
PACKAGE_NAME="Anclora-FileStudio-Linux-x64"
PACKAGE_DIR="$DIST_DIR/$PACKAGE_NAME"

BUILD_ID="${ANCLORA_FILESTUDIO_BUILD_ID:-$(git -C "$REPO_ROOT" rev-parse --short HEAD 2>/dev/null || echo "dev")}"
VERSION="$(node -p "require('$REPO_ROOT/package.json').version" 2>/dev/null || echo "0.1.0")"
BUILD_DATE="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

echo "=== Anclora FileStudio — Linux Portable Build ==="
echo "Version: $VERSION | Build ID: $BUILD_ID | Date: $BUILD_DATE"

# ── Prerequisitos ─────────────────────────────────────────────────────────────
command -v zstd >/dev/null 2>&1 || { echo "ERROR: zstd is required. sudo apt install zstd"; exit 1; }
command -v node >/dev/null 2>&1 || { echo "ERROR: Node.js is required."; exit 1; }

# ── Preparar directorio de salida ─────────────────────────────────────────────
rm -rf "$PACKAGE_DIR"
mkdir -p "$PACKAGE_DIR"/{app,tools,data,logs,licenses,models}

# ── Build Next.js ─────────────────────────────────────────────────────────────
echo "Building Next.js application..."
cd "$REPO_ROOT"
pnpm build 2>&1 | tail -5
echo "Build OK"

# ── Copiar aplicación ─────────────────────────────────────────────────────────
cp -r "$REPO_ROOT/.next" "$PACKAGE_DIR/app/"
cp -r "$REPO_ROOT/public" "$PACKAGE_DIR/app/"
cp "$REPO_ROOT/package.json" "$PACKAGE_DIR/app/"
cp -r "$REPO_ROOT/node_modules" "$PACKAGE_DIR/app/" 2>/dev/null || true

# ── Copiar datos ──────────────────────────────────────────────────────────────
cp -r "$REPO_ROOT/data/." "$PACKAGE_DIR/data/" 2>/dev/null || true

# ── Scripts de inicio ─────────────────────────────────────────────────────────
cat > "$PACKAGE_DIR/start-anclora-filestudio.sh" << 'LAUNCH'
#!/usr/bin/env bash
set -euo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export ANCLORA_FILESTUDIO_DATA_DIR="$DIR/data"
export ANCLORA_FILESTUDIO_TEMP_DIR="$DIR/logs/tmp"
export PORT="${ANCLORA_FILESTUDIO_PORT:-3847}"
export HOSTNAME="127.0.0.1"
mkdir -p "$DIR/logs/tmp"
echo "Starting Anclora FileStudio on http://127.0.0.1:$PORT"
cd "$DIR/app"
node server.js &
APP_PID=$!
echo $APP_PID > "$DIR/anclora-filestudio.pid"
sleep 2
xdg-open "http://127.0.0.1:$PORT" 2>/dev/null || \
  echo "Open your browser at: http://127.0.0.1:$PORT"
wait $APP_PID
LAUNCH

cat > "$PACKAGE_DIR/stop-anclora-filestudio.sh" << 'STOP'
#!/usr/bin/env bash
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PID_FILE="$DIR/anclora-filestudio.pid"
if [[ -f "$PID_FILE" ]]; then
  kill "$(cat "$PID_FILE")" 2>/dev/null || true
  rm -f "$PID_FILE"
  echo "Anclora FileStudio stopped."
else
  echo "No PID file found."
fi
STOP

cat > "$PACKAGE_DIR/diagnose-anclora-filestudio.sh" << 'DIAG'
#!/usr/bin/env bash
echo "=== Anclora FileStudio — Diagnostics ==="
echo "Node.js: $(node --version 2>/dev/null || echo 'NOT FOUND')"
for cmd in ffmpeg ffprobe yt-dlp qpdf 7z pandoc tesseract pdftoppm; do
  VER="$($cmd --version 2>&1 | head -1 || echo 'NOT FOUND')"
  echo "$cmd: $VER"
done
echo ""
echo "Disk space: $(df -h . | tail -1)"
DIAG

chmod +x "$PACKAGE_DIR"/*.sh

# ── Manifest ──────────────────────────────────────────────────────────────────
cat > "$PACKAGE_DIR/manifest.json" << MANIFEST
{
  "name": "Anclora FileStudio",
  "version": "$VERSION",
  "buildId": "$BUILD_ID",
  "buildDate": "$BUILD_DATE",
  "platform": "linux",
  "arch": "x64",
  "packageName": "$PACKAGE_NAME",
  "capabilities": ["audio","video","image","pdf","document","ebook","archive","ocr","data"],
  "notes": "External tools (ffmpeg, tesseract, etc.) must be installed separately on Linux."
}
MANIFEST

# ── VERSION.txt ───────────────────────────────────────────────────────────────
printf "Anclora FileStudio %s\nBuild: %s\nDate: %s\n" "$VERSION" "$BUILD_ID" "$BUILD_DATE" > "$PACKAGE_DIR/VERSION.txt"

# ── LEEME ─────────────────────────────────────────────────────────────────────
cat > "$PACKAGE_DIR/LEEME.txt" << README
Anclora FileStudio $VERSION — Linux x64 Portable

INICIO:
  ./start-anclora-filestudio.sh

PARADA:
  ./stop-anclora-filestudio.sh

DIAGNÓSTICO:
  ./diagnose-anclora-filestudio.sh

DEPENDENCIAS DEL SISTEMA:
  sudo apt install ffmpeg yt-dlp qpdf p7zip-full pandoc \
    tesseract-ocr tesseract-ocr-spa tesseract-ocr-eng poppler-utils

NOTA: Los datos se guardan en ./data/ — no borres esta carpeta al actualizar.
README

# ── Empaquetado ───────────────────────────────────────────────────────────────
mkdir -p "$DIST_DIR"
TAR_FILE="$DIST_DIR/${PACKAGE_NAME}.tar.zst"
echo "Packaging..."
tar -C "$DIST_DIR" -I zstd -cf "$TAR_FILE" "$PACKAGE_NAME/"
SHA=$(sha256sum "$TAR_FILE" | awk '{print $1}')
echo "$SHA  ${PACKAGE_NAME}.tar.zst" > "$TAR_FILE.sha256"

echo ""
echo "=== Build complete ==="
echo "Package: $TAR_FILE"
echo "SHA256:  $SHA"
echo "Size:    $(du -sh "$TAR_FILE" | awk '{print $1}')"
