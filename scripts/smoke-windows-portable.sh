#!/usr/bin/env bash
# smoke-windows-portable.sh — Structural + native acceptance smoke test for Windows portable.
# Structural checks run from WSL.
# Native acceptance (runtime/sqlite/sharp/webp) runs via powershell.exe when available.
# Fails with exit 1 when the package is missing.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ZIP="$REPO_ROOT/dist/windows/Anclora-FileStudio-Windows-x64-Core.zip"
PS1_SMOKE="$SCRIPT_DIR/smoke-windows-portable.ps1"

# ── Artifact must exist — no false-positive SKIP ──────────────────────────────
if [[ ! -f "$ZIP" ]]; then
  echo "[FAIL] Package not found: $ZIP"
  echo "       Run 'pnpm build:portable:windows' first."
  exit 1
fi

echo "=== Smoke test — Windows portable ==="
echo "Package: $(du -sh "$ZIP" | awk '{print $1}') → $ZIP"
echo ""

FAIL=0
PASS=0

# ── Checksum ──────────────────────────────────────────────────────────────────
SHA_FILE="$ZIP.sha256"
if [[ -f "$SHA_FILE" ]]; then
  cd "$(dirname "$ZIP")"
  if sha256sum -c "$(basename "$SHA_FILE")" >/dev/null 2>&1; then
    echo "[PASS] SHA-256 OK"
    PASS=$((PASS+1))
  else
    echo "[FAIL] SHA-256 mismatch"
    FAIL=$((FAIL+1))
  fi
  cd "$REPO_ROOT"
else
  echo "[FAIL] .sha256 file missing"
  FAIL=$((FAIL+1))
fi

# ── ZIP extraction (only if 7z available) ────────────────────────────────────
SEVENZIP=""
for c in 7zz 7z; do
  command -v "$c" >/dev/null 2>&1 && { SEVENZIP="$c"; break; } || true
done

if [[ -n "$SEVENZIP" ]]; then
  TMP_DIR="$(mktemp -d)"
  trap "rm -rf '$TMP_DIR'" EXIT

  echo "Extracting with $SEVENZIP for structural check..."
  "$SEVENZIP" x "$ZIP" -o"$TMP_DIR" -y >/dev/null 2>&1

  PKG="$TMP_DIR/Anclora-FileStudio-Windows-x64-Core"

  STRUCTURAL_FILES=(
    "INICIAR_ANCLORA_FILESTUDIO.bat"
    "CERRAR_ANCLORA_FILESTUDIO.bat"
    "manifest.json"
    "VERSION.txt"
    "THIRD_PARTY_NOTICES.txt"
    "SBOM.cdx.json"
    "runtime/node.exe"
    "tools/yt-dlp/yt-dlp.exe"
    "tools/ffmpeg/ffmpeg.exe"
    "tools/ffmpeg/ffprobe.exe"
    "tools/pandoc/pandoc.exe"
    "tools/qpdf/qpdf.exe"
    "internal/start-anclora-filestudio.ps1"
    "internal/stop-anclora-filestudio.ps1"
    "internal/tool-resolution.ps1"
    "app/server.js"
    "app/.next/static"
    "app/node_modules/better-sqlite3/build/Release/better_sqlite3.node"
    "app/node_modules/@img/sharp-win32-x64/lib/sharp-win32-x64-0.35.1.node"
    "app/node_modules/@img/sharp-win32-x64/lib/libvips-42.dll"
    "app/node_modules/@img/sharp-win32-x64/lib/libvips-cpp-8.18.3.dll"
    "app/node_modules/semver/index.js"
  )

  echo ""
  echo "--- Structural checks ---"
  for f in "${STRUCTURAL_FILES[@]}"; do
    if [[ -e "$PKG/$f" ]]; then
      echo "[PASS] $f"
      PASS=$((PASS+1))
    else
      echo "[FAIL] Missing: $f"
      FAIL=$((FAIL+1))
    fi
  done

  # semver version check
  if [[ -f "$PKG/app/node_modules/semver/package.json" ]]; then
    SEMVER_VER="$(python3 -c "import json; print(json.load(open('$PKG/app/node_modules/semver/package.json')).get('version','?'))" 2>/dev/null || echo '?')"
    echo "[INFO] semver version in package: $SEMVER_VER"
    if [[ "$SEMVER_VER" == "7.8.4" ]]; then
      echo "[PASS] semver@7.8.4 (Sharp compatible)"
      PASS=$((PASS+1))
    else
      echo "[WARN] semver@$SEMVER_VER (expected 7.8.4)"
    fi
  fi

  # Developer paths check
  DEV_PATTERN="/home/toni|/home/antonio|convertidor_youtube_mp3"
  if grep -rqE "$DEV_PATTERN" "$TMP_DIR" \
       --include="*.bat" --include="*.ps1" --include="*.json" \
       --exclude="required-server-files.json" --exclude="server.js" 2>/dev/null; then
    echo "[FAIL] Developer paths found in package"
    grep -rE "$DEV_PATTERN" "$TMP_DIR" \
       --include="*.bat" --include="*.ps1" --include="*.json" \
       --exclude="required-server-files.json" --exclude="server.js" 2>/dev/null | head -5
    FAIL=$((FAIL+1))
  else
    echo "[PASS] No developer paths (Next.js build artifacts excluded)"
    PASS=$((PASS+1))
  fi

  # platform=windows check
  PLATFORM="$(python3 -c "import json; print(json.load(open('$PKG/manifest.json'))['platform'])" 2>/dev/null || echo '')"
  if [[ "$PLATFORM" == "windows" ]]; then
    echo "[PASS] manifest.platform=windows"
    PASS=$((PASS+1))
  else
    echo "[FAIL] manifest.platform != windows (got: '$PLATFORM')"
    FAIL=$((FAIL+1))
  fi

  # no Linux binaries
  LINUX_BINS="$(find "$PKG/app" \( -name "*.so" -o -name "*.dylib" \) 2>/dev/null || true)"
  if [[ -n "$LINUX_BINS" ]]; then
    echo "[FAIL] Linux binaries found in app/:"
    echo "$LINUX_BINS" | head -5
    FAIL=$((FAIL+1))
  else
    echo "[PASS] No Linux .so/.dylib in app/"
    PASS=$((PASS+1))
  fi

  START_PS1="$PKG/internal/start-anclora-filestudio.ps1"
  STOP_PS1="$PKG/internal/stop-anclora-filestudio.ps1"
  TOOL_RESOLUTION_PS1="$PKG/internal/tool-resolution.ps1"

  if grep -q 'Read-Host' "$START_PS1"; then
    echo "[FAIL] start launcher contains Read-Host despite -NonInteractive BAT"
    FAIL=$((FAIL+1))
  else
    echo "[PASS] start launcher has no Read-Host"
    PASS=$((PASS+1))
  fi

  if grep -q 'ArgumentList[[:space:]]*=[[:space:]]*@(\$ServerJs)' "$START_PS1"; then
    echo "[FAIL] start launcher passes absolute ServerJs through ArgumentList"
    FAIL=$((FAIL+1))
  else
    echo "[PASS] start launcher does not pass absolute ServerJs"
    PASS=$((PASS+1))
  fi

  if grep -q "\$ServerEntry[[:space:]]*=[[:space:]]*'server.js'" "$START_PS1" \
     && grep -q 'ArgumentList[[:space:]]*=[[:space:]]*@(\$ServerEntry)' "$START_PS1" \
     && grep -q 'WorkingDirectory[[:space:]]*=[[:space:]]*\$AppDir' "$START_PS1"; then
    echo "[PASS] start launcher uses relative server.js with app WorkingDirectory"
    PASS=$((PASS+1))
  else
    echo "[FAIL] start launcher missing relative server.js/app WorkingDirectory contract"
    FAIL=$((FAIL+1))
  fi

  if grep -q '\[switch\]\$SkipBrowser' "$START_PS1"; then
    echo "[PASS] start launcher supports -SkipBrowser"
    PASS=$((PASS+1))
  else
    echo "[FAIL] start launcher missing -SkipBrowser"
    FAIL=$((FAIL+1))
  fi

  if grep -qE 'Stop-Process[[:space:]]+-Name|taskkill[[:space:]]+/IM[[:space:]]+node\.exe' "$STOP_PS1"; then
    echo "[FAIL] stop launcher contains global node termination"
    FAIL=$((FAIL+1))
  else
    echo "[PASS] stop launcher only targets recorded PID"
    PASS=$((PASS+1))
  fi

  for marker in \
    'C:\Program Files\LibreOffice\program\soffice.com' \
    'C:\Program Files\LibreOffice\program\soffice.exe' \
    'C:\Program Files\Calibre2\ebook-convert.exe' \
    'C:\Program Files\Tesseract-OCR\tesseract.exe' \
    'C:\Program Files\Tesseract-OCR\tessdata' \
    'Get-Command' \
    'ANCLORA_FILESTUDIO_TESSDATA_PREFIX'; do
    if grep -Fq "$marker" "$TOOL_RESOLUTION_PS1"; then
      echo "[PASS] tool-resolution contains $marker"
      PASS=$((PASS+1))
    else
      echo "[FAIL] tool-resolution missing $marker"
      FAIL=$((FAIL+1))
    fi
  done

  SOFFICE_COM_LINE="$(grep -nF 'C:\Program Files\LibreOffice\program\soffice.com' "$TOOL_RESOLUTION_PS1" | head -1 | cut -d: -f1 || true)"
  SOFFICE_EXE_LINE="$(grep -nF 'C:\Program Files\LibreOffice\program\soffice.exe' "$TOOL_RESOLUTION_PS1" | head -1 | cut -d: -f1 || true)"
  if [[ -n "$SOFFICE_COM_LINE" && -n "$SOFFICE_EXE_LINE" && "$SOFFICE_COM_LINE" -lt "$SOFFICE_EXE_LINE" ]]; then
    echo "[PASS] tool-resolution prioritizes soffice.com before soffice.exe"
    PASS=$((PASS+1))
  else
    echo "[FAIL] tool-resolution does not prioritize soffice.com before soffice.exe"
    FAIL=$((FAIL+1))
  fi

  echo ""
  echo "--- Structural: $PASS PASS, $FAIL FAIL ---"
else
  echo "[SKIP] 7z/7zz not available — structural extraction skipped"
  echo "       Install: sudo apt install p7zip-full"
fi

# ── Native acceptance via powershell.exe ──────────────────────────────────────
echo ""
echo "--- Native acceptance test ---"

if ! command -v powershell.exe >/dev/null 2>&1; then
  echo "[SKIP] powershell.exe not available in WSL — native test skipped"
  echo "       The native test must be run manually on a Windows machine:"
  echo "       powershell.exe -ExecutionPolicy Bypass -File smoke-windows-portable.ps1 -ZipPath <path>"
else
  # Get Windows TEMP dir (|| true: powershell.exe sometimes exits non-zero even on success; set -e guard)
  WIN_TEMP="$(powershell.exe -NoProfile -NonInteractive -Command '$env:TEMP' 2>/dev/null | tr -d '\r\n')" || WIN_TEMP=""
  if [[ -z "$WIN_TEMP" ]]; then
    echo "[WARN] Could not determine Windows TEMP — using C:\\Temp"
    WIN_TEMP="C:\\Temp"
  fi

  SMOKE_ID="$(date +%s)"
  WIN_SMOKE_COPY="${WIN_TEMP}\\Prueba Anclora WinSmoke ${SMOKE_ID}"

  # Convert WSL ZIP path to Windows UNC for copy operation only
  WIN_ZIP_SRC="$(wslpath -w "$ZIP" 2>/dev/null || true)"
  WIN_PS1_SRC="$(wslpath -w "$PS1_SMOKE" 2>/dev/null || true)"

  if [[ -z "$WIN_ZIP_SRC" ]] || [[ -z "$WIN_PS1_SRC" ]]; then
    echo "[WARN] wslpath conversion failed — native test skipped"
    echo "       Ensure wsl.exe interop is enabled."
  else
    echo "[INFO] Copying ZIP and PS1 to Windows TEMP (to avoid UNC execution)..."
    # PowerShell 5 (powershell.exe) requires CRLF line endings for here-strings.
    # Create a CRLF copy of the PS1 in WSL /tmp before copying to Windows.
    TMP_PS1_CRLF="$(mktemp /tmp/anclora-smoke-XXXXXX.ps1)"
    sed 's/$/\r/' "$PS1_SMOKE" > "$TMP_PS1_CRLF"
    WIN_PS1_SRC_CRLF="$(wslpath -w "$TMP_PS1_CRLF" 2>/dev/null || true)"

    # Copy ZIP and PS1 to a Windows TEMP folder so execution is on local drive
    powershell.exe -NoProfile -NonInteractive -Command "
      New-Item -ItemType Directory -Force -Path '$WIN_SMOKE_COPY' | Out-Null;
      Copy-Item -Path '$WIN_ZIP_SRC' -Destination '$WIN_SMOKE_COPY\\package.zip';
      Copy-Item -Path '$WIN_PS1_SRC_CRLF' -Destination '$WIN_SMOKE_COPY\\smoke.ps1';
      Write-Host 'Copy OK'
    " 2>&1 | grep -v '^$' || {
      echo "[WARN] Copy to Windows TEMP failed — native test skipped"
      rm -f "$TMP_PS1_CRLF"
      FAIL=$((FAIL+1))
    }
    rm -f "$TMP_PS1_CRLF" 2>/dev/null || true

    WIN_ZIP_LOCAL="${WIN_SMOKE_COPY}\\package.zip"
    WIN_PS1_LOCAL="${WIN_SMOKE_COPY}\\smoke.ps1"

    echo "[INFO] Executing native acceptance test via powershell.exe..."
    NATIVE_LOG="$(mktemp)"
    powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass \
        -File "$WIN_PS1_LOCAL" -ZipPath "$WIN_ZIP_LOCAL" >"$NATIVE_LOG" 2>&1 &
    NATIVE_PID=$!
    NATIVE_RESULT=""
    for _ in $(seq 1 240); do
      if grep -q '^=== NATIVE_ACCEPTANCE_WINDOWS_PASS ===$' "$NATIVE_LOG"; then
        NATIVE_RESULT="pass"
        break
      fi
      if grep -q '^=== NATIVE_ACCEPTANCE_WINDOWS_FAIL ===$' "$NATIVE_LOG"; then
        NATIVE_RESULT="fail"
        break
      fi
      if ! kill -0 "$NATIVE_PID" 2>/dev/null; then
        break
      fi
      sleep 1
    done
    cat "$NATIVE_LOG"
    if kill -0 "$NATIVE_PID" 2>/dev/null; then
      kill "$NATIVE_PID" 2>/dev/null || true
      wait "$NATIVE_PID" 2>/dev/null || true
    else
      wait "$NATIVE_PID" 2>/dev/null || true
    fi
    rm -f "$NATIVE_LOG"

    if [[ "$NATIVE_RESULT" == "pass" ]]; then
      echo "[PASS] NATIVE_ACCEPTANCE_WINDOWS_PASS"
      PASS=$((PASS+1))
    else
      echo "[FAIL] NATIVE_ACCEPTANCE_WINDOWS_FAIL"
      FAIL=$((FAIL+1))
    fi

    # Clean up the copy in Windows TEMP
    powershell.exe -NoProfile -NonInteractive -Command \
      "Remove-Item -Recurse -Force '$WIN_SMOKE_COPY' -ErrorAction SilentlyContinue" \
      2>/dev/null || true
  fi
fi

# ── Final result ──────────────────────────────────────────────────────────────
echo ""
TOTAL=$((PASS + FAIL))
if [[ "$FAIL" -gt 0 ]]; then
  echo "=== Smoke test FAILED ($FAIL/$TOTAL failed) ==="
  exit 1
else
  echo "=== Smoke test PASSED ($PASS/$TOTAL checks) ==="
fi
