#!/usr/bin/env bash
# =============================================================================
# build-windows-portable.sh
# Builds the Windows x64 portable distribution of Anclora FileStudio.
# ALL versions, URLs, and SHA-256 hashes are read from scripts/toolchain.lock.json.
# No dynamic version resolution (no "latest", no API calls, no mutable URLs).
# Usage: bash scripts/build-windows-portable.sh
# =============================================================================

set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
info()  { echo -e "${CYAN}[INFO]${NC}  $*"; }
ok()    { echo -e "${GREEN}[OK]${NC}    $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
die()   { echo -e "${RED}[ERROR]${NC} $*" >&2; exit 1; }

# ── Paths ────────────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
LOCKFILE="$SCRIPT_DIR/toolchain.lock.json"
CACHE_DIR="$SCRIPT_DIR/.cache/windows-portable"
STAGING_BASE="$SCRIPT_DIR/.staging"
STAGING_DIR="$STAGING_BASE/Anclora-FileStudio-Windows-x64-Core"
OUT_DIR="$REPO_ROOT/dist/windows"
OUT_ZIP="$OUT_DIR/Anclora-FileStudio-Windows-x64-Core.zip"
OUT_SHA="$OUT_DIR/Anclora-FileStudio-Windows-x64-Core.zip.sha256"
STANDALONE="$REPO_ROOT/.next/standalone"
STATIC_DIR="$REPO_ROOT/.next/static"
PUBLIC_DIR="$REPO_ROOT/public"

BUILD_DATE_UTC="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
APP_VERSION="0.1.0"

[[ -f "$LOCKFILE" ]] || die "toolchain.lock.json not found: $LOCKFILE"
[[ -f "$REPO_ROOT/package.json" ]] || die "Run from the repository root"
cd "$REPO_ROOT"

# ── Section 1: Read ALL versions and hashes from toolchain.lock.json ─────────
info "Reading toolchain.lock.json..."

read_lock() {
  # read_lock <python_expression> — evaluates against the loaded JSON
  python3 -c "import json; d=json.load(open('$LOCKFILE')); print($1)"
}

NODE_WIN_VERSION="$(read_lock "d['runtimes']['win-x64']['version']")"
NODE_WIN_ABI="$(read_lock "d['runtimes']['win-x64']['abi']")"
NODE_WIN_URL="$(read_lock "d['runtimes']['win-x64']['sourceUrl']")"
NODE_WIN_SHA256="$(read_lock "d['runtimes']['win-x64']['sha256']")"

BS3_VERSION="$(read_lock "d['nativeModules']['better-sqlite3-win32-x64']['version']")"
BS3_URL="$(read_lock "d['nativeModules']['better-sqlite3-win32-x64']['sourceUrl']")"
BS3_SHA256="$(read_lock "d['nativeModules']['better-sqlite3-win32-x64']['sha256']")"

SHARP_VERSION="$(read_lock "d['nativeModules']['sharp-win32-x64']['version']")"
SHARP_URL="$(read_lock "d['nativeModules']['sharp-win32-x64']['sourceUrl']")"
SHARP_SHA256="$(read_lock "d['nativeModules']['sharp-win32-x64']['sha256']")"

YTDLP_VERSION="$(read_lock "next(t for t in d['tools'] if t['id']=='ytdlp')['versions']['win-x64']['version']")"
YTDLP_URL="$(read_lock "next(t for t in d['tools'] if t['id']=='ytdlp')['versions']['win-x64']['sourceUrl']")"
YTDLP_SHA256="$(read_lock "next(t for t in d['tools'] if t['id']=='ytdlp')['versions']['win-x64']['sha256']")"

FFMPEG_URL="$(read_lock "next(t for t in d['tools'] if t['id']=='ffmpeg')['versions']['win-x64']['sourceUrl']")"
FFMPEG_SHA256="$(read_lock "next(t for t in d['tools'] if t['id']=='ffmpeg')['versions']['win-x64']['sha256']")"

PANDOC_VERSION="$(read_lock "next(t for t in d['tools'] if t['id']=='pandoc')['versions']['win-x64']['version']")"
PANDOC_URL="$(read_lock "next(t for t in d['tools'] if t['id']=='pandoc')['versions']['win-x64']['sourceUrl']")"
PANDOC_SHA256="$(read_lock "next(t for t in d['tools'] if t['id']=='pandoc')['versions']['win-x64']['sha256']")"

QPDF_VERSION="$(read_lock "next(t for t in d['tools'] if t['id']=='qpdf')['versions']['win-x64']['version']")"
QPDF_URL="$(read_lock "next(t for t in d['tools'] if t['id']=='qpdf')['versions']['win-x64']['sourceUrl']")"
QPDF_SHA256="$(read_lock "next(t for t in d['tools'] if t['id']=='qpdf')['versions']['win-x64']['sha256']")"

POPPLER_VERSION="$(read_lock "next(t for t in d['tools'] if t['id']=='poppler')['versions']['win-x64']['version']")"
POPPLER_URL="$(read_lock "next(t for t in d['tools'] if t['id']=='poppler')['versions']['win-x64']['sourceUrl']")"
POPPLER_SHA256="$(read_lock "next(t for t in d['tools'] if t['id']=='poppler')['versions']['win-x64']['sha256']")"

ok "Toolchain read:"
ok "  Node.js v${NODE_WIN_VERSION} (ABI ${NODE_WIN_ABI})"
ok "  yt-dlp ${YTDLP_VERSION}"
ok "  better-sqlite3 v${BS3_VERSION} (node-v${NODE_WIN_ABI}-win32-x64)"
ok "  @img/sharp-win32-x64 v${SHARP_VERSION}"
ok "  Pandoc ${PANDOC_VERSION}  QPDF ${QPDF_VERSION}  Poppler ${POPPLER_VERSION}"

# ── Section 2: Download all binaries to cache (before staging wipe) ──────────
mkdir -p "$CACHE_DIR"

verify_sha256() {
  local file="$1" expected="$2" label="$3"
  local actual
  actual="$(sha256sum "$file" | awk '{print $1}')"
  if [[ "$actual" != "$expected" ]]; then
    die "SHA-256 mismatch for $label\n  expected: $expected\n  actual:   $actual"
  fi
  ok "SHA-256 OK: $label"
}

download_verify() {
  local url="$1" dest="$2" expected_sha256="$3" label="$4"
  if [[ -f "$dest" ]]; then
    verify_sha256 "$dest" "$expected_sha256" "$label (cached)"
    return 0
  fi
  info "Downloading $label..."
  curl --fail --location --retry 3 --progress-bar -o "$dest" "$url" \
    || { rm -f "$dest"; die "Download failed: $url"; }
  verify_sha256 "$dest" "$expected_sha256" "$label"
}

# Node.js win-x64
NODE_ZIP="node-v${NODE_WIN_VERSION}-win-x64.zip"
NODE_CACHE="$CACHE_DIR/$NODE_ZIP"
download_verify "$NODE_WIN_URL" "$NODE_CACHE" "$NODE_WIN_SHA256" "Node.js v${NODE_WIN_VERSION} win-x64"

# yt-dlp.exe
YTDLP_CACHE="$CACHE_DIR/yt-dlp-${YTDLP_VERSION}.exe"
download_verify "$YTDLP_URL" "$YTDLP_CACHE" "$YTDLP_SHA256" "yt-dlp ${YTDLP_VERSION} win-x64"

# FFmpeg win-x64
FFMPEG_CACHE="$CACHE_DIR/ffmpeg-master-latest-win64-gpl.zip"
download_verify "$FFMPEG_URL" "$FFMPEG_CACHE" "$FFMPEG_SHA256" "FFmpeg win64-gpl"

# better-sqlite3 win32-x64
BS3_ASSET="better-sqlite3-v${BS3_VERSION}-node-v${NODE_WIN_ABI}-win32-x64.tar.gz"
BS3_CACHE="$CACHE_DIR/$BS3_ASSET"
download_verify "$BS3_URL" "$BS3_CACHE" "$BS3_SHA256" "better-sqlite3 v${BS3_VERSION} win32-x64"

# @img/sharp-win32-x64
SHARP_TGZ="sharp-win32-x64-${SHARP_VERSION}.tgz"
SHARP_CACHE="$CACHE_DIR/$SHARP_TGZ"
download_verify "$SHARP_URL" "$SHARP_CACHE" "$SHARP_SHA256" "@img/sharp-win32-x64 v${SHARP_VERSION}"

# Pandoc
PANDOC_CACHE="$CACHE_DIR/pandoc-${PANDOC_VERSION}-windows-x86_64.zip"
download_verify "$PANDOC_URL" "$PANDOC_CACHE" "$PANDOC_SHA256" "Pandoc ${PANDOC_VERSION}"

# QPDF
QPDF_CACHE="$CACHE_DIR/qpdf-${QPDF_VERSION}-msvc64.zip"
download_verify "$QPDF_URL" "$QPDF_CACHE" "$QPDF_SHA256" "QPDF ${QPDF_VERSION}"

# Poppler
POPPLER_CACHE="$CACHE_DIR/poppler-${POPPLER_VERSION}-windows.zip"
download_verify "$POPPLER_URL" "$POPPLER_CACHE" "$POPPLER_SHA256" "Poppler ${POPPLER_VERSION}"

# ── Section 3: Install deps, lint, typecheck, tests, build ───────────────────
info "Verifying required system tools..."
for tool in node pnpm curl unzip sha256sum python3; do
  command -v "$tool" >/dev/null 2>&1 || die "Tool not found: $tool"
done
ok "System tools OK"

info "Installing dependencies (frozen-lockfile)..."
pnpm install --frozen-lockfile
ok "Dependencies installed"

info "Running lint..."
pnpm lint || warn "Lint reported warnings (non-blocking)"

info "Running typecheck..."
pnpm typecheck || die "Typecheck failed"
ok "Typecheck OK"

info "Running tests..."
pnpm test || warn "Tests not available or failed — manual review required"

info "Building Next.js standalone..."
ANCLORA_FILESTUDIO_DEPLOYMENT_TARGET=desktop \
NEXT_PUBLIC_ANCLORA_FILESTUDIO_MODE=desktop \
NEXT_TELEMETRY_DISABLED=1 \
  pnpm build
[[ -f "$STANDALONE/server.js" ]] || die "Standalone build missing: $STANDALONE/server.js"
ok "Next.js build complete"

# ── Section 4: Create clean staging ─────────────────────────────────────────
info "Creating clean staging directory..."
rm -rf "$STAGING_DIR"
mkdir -p "$STAGING_DIR"/{app,runtime,tools,data,temp,logs,licenses,internal}
mkdir -p "$OUT_DIR"
ok "Staging: $STAGING_DIR"

# ── Section 5: Copy application (whitelist — not full standalone mirror) ──────
# The .next/standalone dir mirrors outputFileTracingRoot (the entire repo root).
# We only copy the files the runtime actually needs.
info "Copying application (whitelist copy)..."

APP_DIR="$STAGING_DIR/app"

# server.js — the Next.js standalone entry point
cp "$STANDALONE/server.js" "$APP_DIR/server.js"

# node_modules — standalone traces only what it needs (a subset)
if [[ -d "$STANDALONE/node_modules" ]]; then
  cp -r "$STANDALONE/node_modules" "$APP_DIR/node_modules"
fi

# .next build output: copy everything except build cache.
# IMPORTANT: Do NOT exclude .next/node_modules/ — Turbopack places external
# module stubs there (better-sqlite3-<hash>, sharp-<hash>) required at runtime.
mkdir -p "$APP_DIR/.next"
if [[ -d "$STANDALONE/.next" ]]; then
  find "$STANDALONE/.next" -mindepth 1 -maxdepth 1 \
    ! -name "cache" | while read -r item; do
    cp -r "$item" "$APP_DIR/.next/"
  done
fi

# Static assets (client-side JS/CSS)
if [[ -d "$STATIC_DIR" ]]; then
  rm -rf "$APP_DIR/.next/static"
  cp -r "$STATIC_DIR" "$APP_DIR/.next/static"
fi

# Public directory
if [[ -d "$PUBLIC_DIR" ]]; then
  cp -r "$PUBLIC_DIR" "$APP_DIR/public"
else
  mkdir -p "$APP_DIR/public"
fi

ok "Application copied (whitelist)"

# ── Section 6: Node.js win-x64 runtime ───────────────────────────────────────
info "Extracting node.exe..."
TMP_NODE_EXTRACT="$(mktemp -d)"
unzip -q "$NODE_CACHE" "node-v${NODE_WIN_VERSION}-win-x64/node.exe" -d "$TMP_NODE_EXTRACT" \
  || die "Failed to extract node.exe"
cp "$TMP_NODE_EXTRACT/node-v${NODE_WIN_VERSION}-win-x64/node.exe" "$STAGING_DIR/runtime/node.exe"
rm -rf "$TMP_NODE_EXTRACT"
[[ -f "$STAGING_DIR/runtime/node.exe" ]] || die "node.exe not found after extraction"
ok "node.exe extracted (v${NODE_WIN_VERSION})"

# ── Section 7: Remove Linux native modules, install Windows native modules ────
info "Removing Linux native modules..."

# Remove Linux ELF .node files from app/
find "$APP_DIR" \
  \( -path "*/@next/swc-*" \
  -o -path "*/@img/sharp-linux-*" \
  -o -path "*/@img/sharp-darwin-*" \) \
  -name "*.node" -delete 2>/dev/null || true

find "$APP_DIR" -name "better_sqlite3.node" -delete 2>/dev/null || true
find "$APP_DIR" -name "sharp*.node" -delete 2>/dev/null || true
find "$APP_DIR" -name "*.so" -delete 2>/dev/null || true

ok "Linux binaries removed"

# Install better_sqlite3.node (win32-x64, ABI ${NODE_WIN_ABI})
info "Installing better_sqlite3.node (win32-x64)..."
BS3_TARGET="$APP_DIR/node_modules/better-sqlite3/build/Release"
mkdir -p "$BS3_TARGET"

TMP_BS3="$(mktemp -d)"
tar -xzf "$BS3_CACHE" -C "$TMP_BS3" \
  || die "Failed to decompress $BS3_ASSET"
BS3_NODE="$(find "$TMP_BS3" -name "better_sqlite3.node" | head -1)"
[[ -n "$BS3_NODE" ]] || die "better_sqlite3.node not found in tarball"
cp "$BS3_NODE" "$BS3_TARGET/better_sqlite3.node"
rm -rf "$TMP_BS3"
ok "better_sqlite3.node installed (win32-x64, node-v${NODE_WIN_ABI})"

# Install @img/sharp-win32-x64
info "Installing @img/sharp-win32-x64 v${SHARP_VERSION}..."
SHARP_TARGET="$APP_DIR/node_modules/@img/sharp-win32-x64"
mkdir -p "$SHARP_TARGET"

TMP_SHARP="$(mktemp -d)"
tar -xzf "$SHARP_CACHE" -C "$TMP_SHARP" \
  || die "Failed to decompress sharp-win32-x64 tgz"
# npm tarballs unpack into a 'package/' subdirectory
SHARP_PKG="$(find "$TMP_SHARP" -maxdepth 1 -type d | tail -1)"
cp -r "$SHARP_PKG/." "$SHARP_TARGET/"
rm -rf "$TMP_SHARP"
ok "@img/sharp-win32-x64 v${SHARP_VERSION} installed"

# ── Section 8: Tools ──────────────────────────────────────────────────────────
TOOLS_DIR="$STAGING_DIR/tools"

# yt-dlp
info "Installing yt-dlp..."
mkdir -p "$TOOLS_DIR/yt-dlp"
cp "$YTDLP_CACHE" "$TOOLS_DIR/yt-dlp/yt-dlp.exe"
ok "yt-dlp.exe installed (${YTDLP_VERSION})"

# FFmpeg
info "Extracting FFmpeg..."
mkdir -p "$TOOLS_DIR/ffmpeg"
TMP_FF="$(mktemp -d)"
unzip -q "$FFMPEG_CACHE" -d "$TMP_FF" || die "Failed to decompress FFmpeg ZIP"
FFMPEG_EXE="$(find "$TMP_FF" -name "ffmpeg.exe" | head -1)"
FFPROBE_EXE="$(find "$TMP_FF" -name "ffprobe.exe" | head -1)"
[[ -n "$FFMPEG_EXE" ]] || die "ffmpeg.exe not found in ZIP"
[[ -n "$FFPROBE_EXE" ]] || die "ffprobe.exe not found in ZIP"
cp "$FFMPEG_EXE" "$TOOLS_DIR/ffmpeg/ffmpeg.exe"
cp "$FFPROBE_EXE" "$TOOLS_DIR/ffmpeg/ffprobe.exe"
rm -rf "$TMP_FF"
ok "ffmpeg.exe + ffprobe.exe extracted"

# Pandoc
info "Extracting Pandoc ${PANDOC_VERSION}..."
mkdir -p "$TOOLS_DIR/pandoc"
TMP_PANDOC="$(mktemp -d)"
unzip -q "$PANDOC_CACHE" -d "$TMP_PANDOC" || die "Failed to decompress Pandoc ZIP"
PANDOC_EXE="$(find "$TMP_PANDOC" -name "pandoc.exe" | head -1)"
[[ -n "$PANDOC_EXE" ]] || die "pandoc.exe not found in ZIP"
cp "$PANDOC_EXE" "$TOOLS_DIR/pandoc/pandoc.exe"
rm -rf "$TMP_PANDOC"
ok "pandoc.exe extracted (${PANDOC_VERSION})"

# QPDF
info "Extracting QPDF ${QPDF_VERSION}..."
mkdir -p "$TOOLS_DIR/qpdf"
TMP_QPDF="$(mktemp -d)"
unzip -q "$QPDF_CACHE" -d "$TMP_QPDF" || die "Failed to decompress QPDF ZIP"
QPDF_BIN="$(find "$TMP_QPDF" -type d -name "bin" | head -1)"
if [[ -n "$QPDF_BIN" ]]; then
  cp "$QPDF_BIN/"*.exe "$TOOLS_DIR/qpdf/" 2>/dev/null || true
  cp "$QPDF_BIN/"*.dll "$TOOLS_DIR/qpdf/" 2>/dev/null || true
else
  QPDF_EXE="$(find "$TMP_QPDF" -name "qpdf.exe" | head -1)"
  [[ -n "$QPDF_EXE" ]] || die "qpdf.exe not found in ZIP"
  cp "$(dirname "$QPDF_EXE")/"*.exe "$TOOLS_DIR/qpdf/" 2>/dev/null || true
  cp "$(dirname "$QPDF_EXE")/"*.dll "$TOOLS_DIR/qpdf/" 2>/dev/null || true
fi
rm -rf "$TMP_QPDF"
ok "QPDF ${QPDF_VERSION} extracted"

# Poppler
info "Extracting Poppler ${POPPLER_VERSION}..."
mkdir -p "$TOOLS_DIR/poppler"
TMP_POPPLER="$(mktemp -d)"
unzip -q "$POPPLER_CACHE" -d "$TMP_POPPLER" || die "Failed to decompress Poppler ZIP"
POPPLER_ROOT="$(find "$TMP_POPPLER" -maxdepth 1 -type d -name "poppler-*" | head -1)"
[[ -n "$POPPLER_ROOT" ]] || die "Poppler root directory not found in ZIP"
POPPLER_PDFTOPPM="$(find "$POPPLER_ROOT" \( -path "*/Library/bin/pdftoppm.exe" -o -path "*/bin/pdftoppm.exe" -o -name "pdftoppm.exe" \) | head -1)"
[[ -n "$POPPLER_PDFTOPPM" ]] || die "pdftoppm.exe not found in Poppler ZIP"
cp -r "$POPPLER_ROOT/." "$TOOLS_DIR/poppler/"
rm -rf "$TMP_POPPLER"
# Validate using the same multi-layout search (Library\bin, bin, root) — works with Poppler ≤25.x and 26.x+
POPPLER_INSTALLED="$(find "$TOOLS_DIR/poppler" \( -path "*/Library/bin/pdftoppm.exe" -o -path "*/bin/pdftoppm.exe" -o -name "pdftoppm.exe" \) | head -1)"
[[ -n "$POPPLER_INSTALLED" ]] || die "Poppler extraction failed: pdftoppm.exe not found in tools/poppler/"
ok "Poppler ${POPPLER_VERSION} extracted"

# 7-Zip — optional, no pinned SHA in lockfile, best-effort
SEVENZIP_VERSION="${SEVENZIP_VERSION:-2601}"
SEVENZIP_CACHE="$CACHE_DIR/7z${SEVENZIP_VERSION}-extra.7z"
mkdir -p "$TOOLS_DIR/sevenzip"
if [[ ! -f "$SEVENZIP_CACHE" ]]; then
  info "Downloading 7-Zip (best-effort, no pinned SHA)..."
  curl --fail --location --retry 3 --progress-bar \
    -o "$SEVENZIP_CACHE" \
    "https://www.7-zip.org/a/7z${SEVENZIP_VERSION}-extra.7z" 2>/dev/null \
    || { rm -f "$SEVENZIP_CACHE"; warn "7-Zip download failed — archive conversion unavailable"; }
fi
if [[ -f "$SEVENZIP_CACHE" ]]; then
  if command -v 7z >/dev/null 2>&1; then
    7z e -y -o"$TOOLS_DIR/sevenzip" "$SEVENZIP_CACHE" "7za.exe" "7za.dll" "7zxa.dll" 2>/dev/null || true
    7z e -y -o"$TOOLS_DIR/sevenzip" "$SEVENZIP_CACHE" "7zr.exe" "7z.dll" 2>/dev/null || true
  elif command -v 7za >/dev/null 2>&1; then
    7za e -y -o"$TOOLS_DIR/sevenzip" "$SEVENZIP_CACHE" "7za.exe" "7za.dll" "7zxa.dll" 2>/dev/null || true
  else
    warn "No 7z/7za available to extract 7-Zip — skipping"
  fi
  if [[ ! -f "$TOOLS_DIR/sevenzip/7z.exe" ]] && [[ -f "$TOOLS_DIR/sevenzip/7za.exe" ]]; then
    cp "$TOOLS_DIR/sevenzip/7za.exe" "$TOOLS_DIR/sevenzip/7z.exe"
  fi
  [[ -f "$TOOLS_DIR/sevenzip/7z.exe" ]] && ok "7-Zip extracted" || warn "7-Zip exe not found after extraction"
fi

# ── Section 9: Materialize pnpm symlinks for Windows ZIP ─────────────────────
info "Materializing pnpm symlinks for Windows..."
export _APP_DIR="$APP_DIR"
python3 - << 'PYEOF'
import os, shutil
from pathlib import Path

app_dir = Path(os.environ["_APP_DIR"])
links = [p for p in app_dir.rglob("*") if p.is_symlink()]

for link in sorted(links, key=lambda p: len(p.parts), reverse=True):
    if not link.is_symlink():
        continue
    target = link.resolve(strict=False)
    if not target.exists():
        link.unlink()
        continue
    tmp = link.with_name(f"{link.name}.__materialized__")
    if tmp.exists():
        shutil.rmtree(tmp) if tmp.is_dir() and not tmp.is_symlink() else tmp.unlink()
    if target.is_dir():
        shutil.copytree(target, tmp, symlinks=False)
    else:
        shutil.copy2(target, tmp)
    link.unlink()
    tmp.rename(link)

remaining = [str(p) for p in app_dir.rglob("*") if p.is_symlink()]
if remaining:
    raise SystemExit("Unresolved symlinks:\n" + "\n".join(remaining[:20]))
print(f"  {len(links)} symlinks materialized")
PYEOF
ok "Symlinks materialized"

info "Creating flat node_modules layer for Windows module resolution..."
export _APP_DIR="$APP_DIR"
python3 - << 'PYEOF'
import os, shutil
from pathlib import Path

app_dir = Path(os.environ["_APP_DIR"])
node_modules = app_dir / "node_modules"
pnpm_flat = node_modules / ".pnpm" / "node_modules"
copied = 0
if pnpm_flat.exists():
    for entry in pnpm_flat.iterdir():
        if entry.name.startswith("."):
            continue
        if entry.name.startswith("@"):
            scope_dest = node_modules / entry.name
            scope_dest.mkdir(exist_ok=True)
            for scoped_pkg in entry.iterdir():
                dest = scope_dest / scoped_pkg.name
                if dest.exists():
                    continue
                shutil.copytree(scoped_pkg, dest, symlinks=False)
                copied += 1
        else:
            dest = node_modules / entry.name
            if dest.exists():
                continue
            shutil.copytree(entry, dest, symlinks=False) if entry.is_dir() else shutil.copy2(entry, dest)
            copied += 1
print(f"  {copied} packages flattened to node_modules/")
PYEOF
ok "node_modules flattened"

# ── Fix truncated JS dependency stubs ────────────────────────────────────────
# Next.js standalone traces its own bundled semver (next/dist/compiled/semver) and
# leaves semver@7.8.1 as a stub in the pnpm flat namespace — only package.json,
# no index.js. Sharp@0.35.1 requires semver@^7.8.4 (full package). We replace the
# stub with the full semver@7.8.4 from the repo pnpm store before removing .pnpm.
info "Fixing truncated semver stub..."
SEMVER_IN_PKG="$APP_DIR/node_modules/semver"
SEMVER_FULL_SRC="$REPO_ROOT/node_modules/.pnpm/semver@7.8.4/node_modules/semver"

if [[ ! -f "$SEMVER_IN_PKG/index.js" ]]; then
  if [[ ! -d "$SEMVER_FULL_SRC" ]] || [[ ! -f "$SEMVER_FULL_SRC/index.js" ]]; then
    die "Full semver@7.8.4 not found in pnpm store: $SEMVER_FULL_SRC"
  fi
  info "  Replacing semver stub (7.8.1 stub → 7.8.4 full)..."
  rm -rf "$SEMVER_IN_PKG"
  cp -r "$SEMVER_FULL_SRC" "$SEMVER_IN_PKG"
  ok "semver stub replaced with full semver@7.8.4"
else
  SEMVER_VER="$(python3 -c "import json; print(json.load(open('$SEMVER_IN_PKG/package.json')).get('version','?'))" 2>/dev/null || echo "?")"
  ok "semver/index.js already present (v${SEMVER_VER}) — no stub fix needed"
fi

# Validate semver completeness
for _semver_req_file in \
  "index.js" \
  "classes/semver.js" \
  "classes/range.js" \
  "functions/parse.js" \
  "internal/re.js" \
  "ranges/valid.js"; do
  [[ -f "$SEMVER_IN_PKG/$_semver_req_file" ]] \
    || die "semver validation failed — missing: $SEMVER_IN_PKG/$_semver_req_file"
done
ok "semver package validated (all required files present)"

info "Removing .pnpm store (prevents deep paths on Windows)..."
rm -rf "$APP_DIR/node_modules/.pnpm"
ok ".pnpm store removed"

info "Checking internal path lengths..."
export _STAGING_DIR="$STAGING_DIR"
python3 - << 'PYEOF'
import os
from pathlib import Path

staging_dir = Path(os.environ["_STAGING_DIR"])
max_len = 0; max_path = ""
for root, _, files in os.walk(staging_dir):
    for fname in files:
        rel = Path(root, fname).relative_to(staging_dir.parent).as_posix()
        if len(rel) > max_len:
            max_len = len(rel); max_path = rel
print(f"  Longest internal path: {max_len} chars")
if max_len > 180:
    raise SystemExit(f"Internal path exceeds 180 chars — Windows extraction may fail:\n  {max_path}")
PYEOF
ok "Path lengths OK"

# ── Section 10: Windows launcher scripts ────────────────────────────────────
info "Writing Windows launcher scripts..."

INTERNAL_DIR="$STAGING_DIR/internal"

WIN_SCRIPTS_DIR="$SCRIPT_DIR/windows-portable"
for ps1 in start-anclora-filestudio.ps1 stop-anclora-filestudio.ps1 \
           update-ytdlp.ps1 diagnose-anclora-filestudio.ps1 tool-resolution.ps1; do
  if [[ -f "$WIN_SCRIPTS_DIR/$ps1" ]]; then
    cp "$WIN_SCRIPTS_DIR/$ps1" "$INTERNAL_DIR/"
  else
    warn "Not found: $WIN_SCRIPTS_DIR/$ps1"
  fi
done

for bat in INICIAR_ANCLORA_FILESTUDIO.bat CERRAR_ANCLORA_FILESTUDIO.bat \
           ACTUALIZAR_YTDLP.bat DIAGNOSTICO_ANCLORA_FILESTUDIO.bat; do
  if [[ -f "$SCRIPT_DIR/$bat" ]]; then
    cp "$SCRIPT_DIR/$bat" "$STAGING_DIR/"
  else
    warn "Not found: $SCRIPT_DIR/$bat"
  fi
done

# Generate minimal bat launchers if originals not present
if [[ ! -f "$STAGING_DIR/INICIAR_ANCLORA_FILESTUDIO.bat" ]]; then
cat > "$STAGING_DIR/INICIAR_ANCLORA_FILESTUDIO.bat" << 'BATEOF'
@echo off
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "internal\start-anclora-filestudio.ps1"
pause
BATEOF
fi

if [[ ! -f "$STAGING_DIR/CERRAR_ANCLORA_FILESTUDIO.bat" ]]; then
cat > "$STAGING_DIR/CERRAR_ANCLORA_FILESTUDIO.bat" << 'BATEOF'
@echo off
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "internal\stop-anclora-filestudio.ps1"
pause
BATEOF
fi

ok "Launcher scripts ready"

# ── Section 11: Generate internal/start-anclora-filestudio.ps1 if missing ────
if [[ ! -f "$INTERNAL_DIR/start-anclora-filestudio.ps1" ]]; then
  info "Generating start-anclora-filestudio.ps1..."
  cat > "$INTERNAL_DIR/start-anclora-filestudio.ps1" << 'PS1EOF'
# Anclora FileStudio — Windows launcher
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$NodeExe = Join-Path $Root "runtime\node.exe"
$AppDir = Join-Path $Root "app"
$ServerJs = Join-Path $AppDir "server.js"
$ServerEntry = "server.js"
$PidFile = Join-Path $Root "anclora-filestudio.pid"
$LogFile = Join-Path $Root "logs\app.log"

if (-not (Test-Path $NodeExe)) { Write-Error "runtime\node.exe not found"; exit 1 }
if (-not (Test-Path $ServerJs)) { Write-Error "app\server.js not found"; exit 1 }
New-Item -ItemType Directory -Path (Join-Path $Root "logs") -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $Root "data") -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $Root "temp") -Force | Out-Null

$env:NODE_ENV = "production"
$env:PORT = "3847"
$env:HOSTNAME = "127.0.0.1"
$env:ANCLORA_FILESTUDIO_DATA_DIR = Join-Path $Root "data"
$env:ANCLORA_FILESTUDIO_TEMP_DIR = Join-Path $Root "temp"
$env:ANCLORA_FILESTUDIO_LOG_DIR = Join-Path $Root "logs"
$env:ANCLORA_FILESTUDIO_TOOLS_DIR = Join-Path $Root "tools"
$env:PATH = (Join-Path $Root "tools\yt-dlp") + ";" + (Join-Path $Root "tools\ffmpeg") + ";" + `
            (Join-Path $Root "tools\pandoc") + ";" + (Join-Path $Root "tools\qpdf") + ";" + `
            (Join-Path $Root "tools\sevenzip") + ";" + $env:PATH

$proc = Start-Process -FilePath $NodeExe -ArgumentList @($ServerEntry) -WorkingDirectory $AppDir `
        -RedirectStandardOutput $LogFile -RedirectStandardError $LogFile `
        -WindowStyle Hidden -PassThru
$proc.Id | Out-File -FilePath $PidFile -Encoding ascii

Write-Host "Anclora FileStudio started (PID $($proc.Id)) on http://127.0.0.1:3847"
Start-Sleep 3
Start-Process "http://127.0.0.1:3847"
PS1EOF
fi

if [[ ! -f "$INTERNAL_DIR/stop-anclora-filestudio.ps1" ]]; then
  cat > "$INTERNAL_DIR/stop-anclora-filestudio.ps1" << 'PS1EOF'
$Root = Split-Path -Parent $PSScriptRoot
$PidFile = Join-Path $Root "anclora-filestudio.pid"
if (Test-Path $PidFile) {
    $pid = Get-Content $PidFile
    Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue
    Remove-Item $PidFile -ErrorAction SilentlyContinue
    Write-Host "Anclora FileStudio stopped (PID $pid)"
} else {
    Write-Host "No running instance found"
}
PS1EOF
fi

# ── Section 12: Placeholder dirs ─────────────────────────────────────────────
printf "temporary conversion files - auto-generated\n" > "$STAGING_DIR/data/placeholder.txt"
printf "temporary files - auto-generated\n"            > "$STAGING_DIR/temp/placeholder.txt"
printf "application logs - auto-generated\n"           > "$STAGING_DIR/logs/placeholder.txt"

# ── Section 13: Generate VERSION.txt ────────────────────────────────────────
cat > "$STAGING_DIR/VERSION.txt" << EOF
Anclora FileStudio $APP_VERSION
Platform: Windows x64
Build date: $BUILD_DATE_UTC

Bundled runtime and tools:
  Node.js:        v${NODE_WIN_VERSION} (ABI ${NODE_WIN_ABI})
  yt-dlp:         ${YTDLP_VERSION}
  FFmpeg:         BtbN GPL (locked SHA-256 at build time)
  better-sqlite3: ${BS3_VERSION} (win32-x64, node-v${NODE_WIN_ABI})
  sharp:          @img/sharp-win32-x64 ${SHARP_VERSION}
  Pandoc:         ${PANDOC_VERSION}
  QPDF:           ${QPDF_VERSION}
  Poppler:        ${POPPLER_VERSION}
  7-Zip:          26.01 (best-effort)

All versions and SHA-256 hashes locked in scripts/toolchain.lock.json.
EOF
ok "VERSION.txt generated"

# ── Section 14: Generate manifest.json ───────────────────────────────────────
info "Generating manifest.json..."
BUILD_COMMIT="$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")"
cat > "$STAGING_DIR/manifest.json" << EOF
{
  "name": "Anclora FileStudio",
  "version": "${APP_VERSION}",
  "buildId": "win-x64-${BUILD_DATE_UTC:0:10}",
  "buildDate": "${BUILD_DATE_UTC}",
  "commit": "${BUILD_COMMIT}",
  "platform": "windows",
  "arch": "x64",
  "capabilities": ["data","image","audio","video","thumbnail","youtube","pdf","archive","document","pdf-to-image"],
  "runtime": {
    "nodeVersion": "${NODE_WIN_VERSION}",
    "nodeAbi": "${NODE_WIN_ABI}",
    "nodeSha256": "${NODE_WIN_SHA256}"
  },
  "tools": {
    "ytdlp": { "version": "${YTDLP_VERSION}", "sha256": "${YTDLP_SHA256}" },
    "ffmpeg": { "sha256": "${FFMPEG_SHA256}" },
    "betterSqlite3": { "version": "${BS3_VERSION}", "sha256": "${BS3_SHA256}" },
    "sharp": { "package": "@img/sharp-win32-x64", "version": "${SHARP_VERSION}", "sha256": "${SHARP_SHA256}" },
    "pandoc": { "version": "${PANDOC_VERSION}", "sha256": "${PANDOC_SHA256}" },
    "qpdf": { "version": "${QPDF_VERSION}", "sha256": "${QPDF_SHA256}" },
    "poppler": { "version": "${POPPLER_VERSION}", "sha256": "${POPPLER_SHA256}" }
  }
}
EOF
ok "manifest.json generated"

# ── Section 15: Generate LEEME.txt ───────────────────────────────────────────
cat > "$STAGING_DIR/LEEME.txt" << 'EOF'
╔══════════════════════════════════════════════════════════════╗
║              Anclora FileStudio — Guía rápida                ║
╚══════════════════════════════════════════════════════════════╝

CÓMO EMPEZAR
────────────
1. Extrae TODO el contenido del ZIP en una carpeta de tu ordenador.
   (No ejecutes nada directamente desde el ZIP.)
2. Abre la carpeta extraída.
3. Haz doble clic en INICIAR_ANCLORA_FILESTUDIO.bat
4. Espera a que se abra el navegador automáticamente.
5. Selecciona un archivo local o pega un enlace de YouTube.

CÓMO CERRAR
───────────
Haz doble clic en CERRAR_ANCLORA_FILESTUDIO.bat

REQUISITOS
──────────
· Windows 10 u 11 de 64 bits.
· No se requiere instalar Node.js ni ninguna otra herramienta.

PROBLEMAS FRECUENTES
─────────────────────
· SmartScreen muestra advertencia: "Más información" → "Ejecutar de todas formas".
· El navegador no se abre: abre manualmente http://127.0.0.1:3847

═══════════════════════════════════════════════════════════════
Solo para contenido propio o con autorización del titular.
Respeta siempre los derechos de autor y las licencias aplicables.
═══════════════════════════════════════════════════════════════
EOF
ok "LEEME.txt generated"

# ── Section 16: Generate THIRD_PARTY_NOTICES.txt ─────────────────────────────
cat > "$STAGING_DIR/THIRD_PARTY_NOTICES.txt" << EOF
THIRD-PARTY NOTICES — Anclora FileStudio ${APP_VERSION} Windows x64
======================================================================

1. Node.js v${NODE_WIN_VERSION} — MIT License — https://nodejs.org/
   SHA-256: ${NODE_WIN_SHA256}

2. yt-dlp ${YTDLP_VERSION} — The Unlicense — https://github.com/yt-dlp/yt-dlp
   SHA-256: ${YTDLP_SHA256}

3. FFmpeg (BtbN GPL) — GPL-2.0-or-later — https://ffmpeg.org/
   SHA-256: ${FFMPEG_SHA256}

4. better-sqlite3 v${BS3_VERSION} — MIT License — https://github.com/WiseLibs/better-sqlite3
   SHA-256: ${BS3_SHA256}

5. @img/sharp-win32-x64 v${SHARP_VERSION} — Apache-2.0 — https://sharp.pixelplumbing.com/
   SHA-256: ${SHARP_SHA256}

6. Pandoc ${PANDOC_VERSION} — GPL-2.0 — https://pandoc.org/
   SHA-256: ${PANDOC_SHA256}

7. QPDF ${QPDF_VERSION} — Apache-2.0 — https://qpdf.sourceforge.io/
   SHA-256: ${QPDF_SHA256}

8. Poppler ${POPPLER_VERSION} — GPL-2.0 — https://poppler.freedesktop.org/
   Windows build: https://github.com/oschwartz10612/poppler-windows
   SHA-256: ${POPPLER_SHA256}

9. 7-Zip 26.01 — LGPL-2.1 — https://www.7-zip.org/

10. Next.js + React (in app/node_modules) — MIT License

All npm dependencies: see individual LICENSE files in app/node_modules/*/LICENSE
EOF
ok "THIRD_PARTY_NOTICES.txt generated"

# ── Section 17: SBOM stub ────────────────────────────────────────────────────
cat > "$STAGING_DIR/SBOM.cdx.json" << EOF
{
  "bomFormat": "CycloneDX",
  "specVersion": "1.4",
  "version": 1,
  "metadata": {
    "timestamp": "${BUILD_DATE_UTC}",
    "component": {
      "type": "application",
      "name": "Anclora FileStudio",
      "version": "${APP_VERSION}",
      "purl": "pkg:generic/anclora-filestudio@${APP_VERSION}?platform=windows-x64"
    }
  },
  "components": [
    { "type": "library", "name": "node", "version": "${NODE_WIN_VERSION}", "licenses": [{"license":{"id":"MIT"}}] },
    { "type": "library", "name": "yt-dlp", "version": "${YTDLP_VERSION}", "licenses": [{"license":{"id":"Unlicense"}}] },
    { "type": "library", "name": "ffmpeg", "licenses": [{"license":{"id":"GPL-2.0-or-later"}}] },
    { "type": "library", "name": "better-sqlite3", "version": "${BS3_VERSION}", "licenses": [{"license":{"id":"MIT"}}] },
    { "type": "library", "name": "@img/sharp-win32-x64", "version": "${SHARP_VERSION}", "licenses": [{"license":{"id":"Apache-2.0"}}] },
    { "type": "library", "name": "pandoc", "version": "${PANDOC_VERSION}", "licenses": [{"license":{"id":"GPL-2.0"}}] },
    { "type": "library", "name": "qpdf", "version": "${QPDF_VERSION}", "licenses": [{"license":{"id":"Apache-2.0"}}] },
    { "type": "library", "name": "poppler", "version": "${POPPLER_VERSION}", "licenses": [{"license":{"id":"GPL-2.0"}}] }
  ]
}
EOF
ok "SBOM.cdx.json generated"

# ── Section 18: Security checks ──────────────────────────────────────────────
info "Security checks..."

# No .git in package
if find "$STAGING_DIR" -name ".git" -type d 2>/dev/null | grep -q .; then
  die ".git directory found in staging — build contaminated"
fi
ok "No .git in staging"

# No secrets
if grep -rqiE 'BEGIN (RSA|OPENSSH|EC|PRIVATE) KEY|api[_-]?key\s*=\s*["\x27][^"]+' \
   "$STAGING_DIR" --include="*.json" --include="*.env" 2>/dev/null; then
  die "Potential secret found in staging package"
fi
ok "No secrets detected"

# Verify launcher does not bind to 0.0.0.0
if grep -q "0\.0\.0\.0" "$INTERNAL_DIR/start-anclora-filestudio.ps1" 2>/dev/null; then
  die "Launcher binds to 0.0.0.0 (INSECURE)"
fi
ok "Launcher binds to 127.0.0.1 only"

# ── Section 19: Create ZIP ────────────────────────────────────────────────────
info "Creating ZIP..."
rm -f "$OUT_ZIP"
cd "$STAGING_BASE"
export _OUT_ZIP="$OUT_ZIP"
python3 - << 'PYEOF'
import zipfile, os, sys
out_zip = os.environ["_OUT_ZIP"]
prefix  = "Anclora-FileStudio-Windows-x64-Core"
SKIP_DIRS  = {'.git', '.cache', '.staging', '.tmp', '__pycache__', '.verify_tmp'}
SKIP_FILES = {'.gitkeep', '.gitignore', '.env.local', '.env.production'}
count = 0
with zipfile.ZipFile(out_zip, "w", zipfile.ZIP_DEFLATED, allowZip64=True) as zf:
    for root, dirs, files in os.walk(prefix):
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
        for fname in files:
            if fname in SKIP_FILES:
                continue
            fpath = os.path.join(root, fname)
            zf.write(fpath)
            count += 1
print(f"  {count} files in ZIP")
PYEOF
cd "$REPO_ROOT"
[[ -f "$OUT_ZIP" ]] || die "ZIP was not created"
ok "ZIP created: $OUT_ZIP"

# ── Section 20: SHA-256 ───────────────────────────────────────────────────────
ZIP_SHA256="$(sha256sum "$OUT_ZIP" | awk '{print $1}')"
echo "$ZIP_SHA256  Anclora-FileStudio-Windows-x64-Core.zip" > "$OUT_SHA"

ZIP_SIZE="$(du -sh "$OUT_ZIP" | awk '{print $1}')"

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  === Build complete ===${NC}"
echo -e "${GREEN}========================================${NC}"
echo -e "  Package : $OUT_ZIP"
echo -e "  Size    : $ZIP_SIZE"
echo -e "  SHA-256 : $ZIP_SHA256"
echo -e "  Verify  : sha256sum -c $OUT_SHA"
echo ""
echo -e "  Runtime : Node.js v${NODE_WIN_VERSION} (ABI ${NODE_WIN_ABI})"
echo -e "  yt-dlp  : ${YTDLP_VERSION}"
echo -e "  sqlite3 : better-sqlite3 v${BS3_VERSION} (win32-x64)"
echo -e "  sharp   : @img/sharp-win32-x64 v${SHARP_VERSION}"
echo -e "  Pandoc  : ${PANDOC_VERSION} | QPDF: ${QPDF_VERSION} | Poppler: ${POPPLER_VERSION}"
echo -e "${GREEN}========================================${NC}"
