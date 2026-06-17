#!/usr/bin/env bash
# smoke-linux-portable.sh — Quick structural smoke test for the Linux portable.
# Fails with exit 1 when the package is missing. Does NOT start the server.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
TAR="$REPO_ROOT/dist/linux/Anclora-FileStudio-Linux-x64.tar.zst"

# ── Artifact must exist — no false-positive SKIP ──────────────────────────────
if [[ ! -f "$TAR" ]]; then
  echo "[FAIL] Package not found: $TAR"
  echo "       Run 'pnpm build:portable:linux' first."
  exit 1
fi

echo "=== Smoke test — Linux portable ==="
echo "Package: $(du -sh "$TAR" | awk '{print $1}') → $TAR"

# ── zstd path ─────────────────────────────────────────────────────────────────
for p in "$HOME/.local/bin/zstd" "/usr/local/bin/zstd" "zstd"; do
  command -v "$p" >/dev/null 2>&1 && { PATH="$(dirname "$(command -v "$p" 2>/dev/null || echo "$p")")":$PATH; break; } 2>/dev/null || true
done

TMP_DIR="$(mktemp -d)"
trap "rm -rf '$TMP_DIR'" EXIT

echo "Extracting..."
tar -C "$TMP_DIR" -I zstd -xf "$TAR"
PKG="$TMP_DIR/Anclora-FileStudio-Linux-x64"

# ── Required files ────────────────────────────────────────────────────────────
FAIL=0
for f in \
  "start-anclora-filestudio.sh" \
  "stop-anclora-filestudio.sh" \
  "manifest.json" \
  "VERSION.txt" \
  "app/server.js" \
  "app/.next/static"; do
  if [[ -e "$PKG/$f" ]]; then
    echo "[PASS] $f"
  else
    echo "[FAIL] Missing: $f"
    (( FAIL++ )) || true
  fi
done

# ── Developer paths ───────────────────────────────────────────────────────────
# Exclude Next.js build artifacts that inevitably contain outputFileTracingRoot:
#   server.js, required-server-files.json — these are baked in at build time
#   and cannot contain user-controlled content that poses a security risk.
DEV_PATTERN="/home/toni/projects|/home/antonio|/Users/antonio|convertidor_youtube_mp3"
DEV_HITS="$(grep -rE "$DEV_PATTERN" "$TMP_DIR" \
  --exclude="server.js" \
  --exclude="required-server-files.json" \
  --exclude="trace" \
  2>/dev/null || true)"
if [[ -n "$DEV_HITS" ]]; then
  echo "[FAIL] Developer paths found in package"
  echo "$DEV_HITS" | head -5
  (( FAIL++ )) || true
else
  echo "[PASS] No developer paths (excl. Next.js build artifacts)"
fi

# ── Checksum ──────────────────────────────────────────────────────────────────
SHA_FILE="$TAR.sha256"
if [[ -f "$SHA_FILE" ]]; then
  cd "$(dirname "$TAR")"
  if sha256sum -c "$(basename "$SHA_FILE")" >/dev/null 2>&1; then
    echo "[PASS] SHA-256 OK"
  else
    echo "[FAIL] SHA-256 mismatch"
    (( FAIL++ )) || true
  fi
else
  echo "[FAIL] .sha256 file missing"
  (( FAIL++ )) || true
fi

# ── Manifest JSON parseable ───────────────────────────────────────────────────
if python3 -m json.tool "$PKG/manifest.json" >/dev/null 2>&1; then
  echo "[PASS] manifest.json is valid JSON"
else
  echo "[FAIL] manifest.json is invalid JSON"
  (( FAIL++ )) || true
fi

# ── Sharp: real PNG→WebP conversion using bundled node ───────────────────────
echo ""
echo "--- Sharp PNG→WebP conversion (bundled node) ---"

NODE_BIN="$PKG/runtime/node"
LIBVIPS_SO="$(find "$PKG/app/node_modules/.pnpm/@img+sharp-libvips-linux-x64@1.3.0" \
  -name "libvips-cpp.so.8.18.3" -not -type l 2>/dev/null | head -1 || true)"

if [[ ! -x "$NODE_BIN" ]]; then
  echo "[FAIL] runtime/node not executable — cannot run Sharp test"
  (( FAIL++ )) || true
elif [[ -z "$LIBVIPS_SO" ]]; then
  echo "[FAIL] libvips-cpp.so.8.18.3 not found in package — Sharp cannot load"
  (( FAIL++ )) || true
else
  # Create a minimal 4x4 red PNG in /tmp using Python (no external deps)
  TEST_PNG="$TMP_DIR/test-input.png"
  TEST_WEBP="$TMP_DIR/test-output.webp"
  python3 - "$TEST_PNG" << 'MKPNG'
import struct, zlib, sys

def make_png(path):
    def chunk(name, data):
        c = struct.pack('>I', len(data)) + name + data
        return c + struct.pack('>I', zlib.crc32(name + data) & 0xffffffff)
    w, h = 4, 4
    sig = b'\x89PNG\r\n\x1a\n'
    # colortype=2 (RGB), 8-bit depth, 3 bytes per pixel
    ihdr = chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0))
    # Each scanline: filter byte (0=None) + w*3 bytes RGB
    raw = b''.join(b'\x00' + b'\xff\x00\x00' * w for _ in range(h))
    idat = chunk(b'IDAT', zlib.compress(raw))
    iend = chunk(b'IEND', b'')
    with open(path, 'wb') as f:
        f.write(sig + ihdr + idat + iend)

make_png(sys.argv[1])
MKPNG

  SHARP_TEST_RESULT="$(cd "$PKG/app" && "$NODE_BIN" -e "
const sharp = require('sharp');
const path = require('path');
sharp('$TEST_PNG')
  .webp({ quality: 80 })
  .toFile('$TEST_WEBP')
  .then(info => {
    console.log('OK width=' + info.width + ' height=' + info.height + ' size=' + info.size);
    process.exit(0);
  })
  .catch(err => {
    console.error('ERR', err.message);
    process.exit(1);
  });
" 2>&1 || echo "EXEC_FAILED")"

  if echo "$SHARP_TEST_RESULT" | grep -q "^OK"; then
    WEBP_SIZE="$(stat -c%s "$TEST_WEBP" 2>/dev/null || echo 0)"
    if [[ "$WEBP_SIZE" -gt 0 ]]; then
      echo "[PASS] Sharp PNG→WebP: $SHARP_TEST_RESULT (output ${WEBP_SIZE} bytes)"
    else
      echo "[FAIL] Sharp PNG→WebP: output file empty or missing"
      (( FAIL++ )) || true
    fi
  else
    echo "[FAIL] Sharp PNG→WebP conversion failed: $SHARP_TEST_RESULT"
    (( FAIL++ )) || true
  fi
fi

echo ""
if [[ "$FAIL" -gt 0 ]]; then
  echo "=== Smoke test FAILED ($FAIL issue(s)) ==="
  exit 1
else
  echo "=== Smoke test PASSED ==="
fi
