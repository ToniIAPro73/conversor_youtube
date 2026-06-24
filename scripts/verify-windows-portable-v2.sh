#!/usr/bin/env bash
# =============================================================================
# verify-windows-portable-v2.sh
# Verifies the integrity and content of the Anclora FileStudio Windows portable.
# Usage: bash scripts/verify-windows-portable-v2.sh [staging-dir-or-zip]
# =============================================================================

set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
info() { printf "%b %s\n" "${CYAN}[CHECK]${NC}" "$*"; }
ok()   { printf "%b  %s\n" "${GREEN}[PASS]${NC}" "$*"; }
warn() { printf "%b  %s\n" "${YELLOW}[WARN]${NC}" "$*"; }
fail() { printf "%b  %s\n" "${RED}[FAIL]${NC}" "$*"; FAILURES=$((FAILURES+1)); }

if REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)"; then :
else
  REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
fi

ZIP_PATH="$REPO_ROOT/dist/windows/Anclora-FileStudio-Windows-x64-Core.zip"
SHA_PATH="$REPO_ROOT/dist/windows/Anclora-FileStudio-Windows-x64-Core.zip.sha256"
VERIFY_STAGING="$REPO_ROOT/scripts/.staging/.verify_tmp_windows"
FAILURES=0
PASS=0

echo ""
echo -e "${CYAN}══════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}  Verificación — Anclora FileStudio Windows portable  ${NC}"
echo -e "${CYAN}══════════════════════════════════════════════════════${NC}"
echo ""

# ── Determine extraction source ──────────────────────────────────────────────
STAGING_ARG="${1:-}"
EXTRACTED=""

if [[ -n "$STAGING_ARG" ]]; then
  EXTRACTED="$STAGING_ARG"
  info "Usando directorio de staging: $EXTRACTED"
elif [[ -f "$ZIP_PATH" ]]; then
  # ── 1. ZIP exists ───────────────────────────────────────────────────────────
  info "Verificando ZIP..."
  ZIP_SIZE="$(du -sh "$ZIP_PATH" | awk '{print $1}')"
  ok "ZIP encontrado: $(basename "$ZIP_PATH") ($ZIP_SIZE)"
  PASS=$((PASS+1))

  # ── 2. SHA-256 ─────────────────────────────────────────────────────────────
  info "Verificando SHA-256..."
  if [[ -f "$SHA_PATH" ]]; then
    if (cd "$(dirname "$ZIP_PATH")" && sha256sum -c "$(basename "$SHA_PATH")" --quiet 2>/dev/null); then
      ok "SHA-256 verificado"
      PASS=$((PASS+1))
    else
      fail "SHA-256 no coincide"
    fi
  else
    fail "Archivo .sha256 no encontrado: $SHA_PATH"
  fi

  # ── 3. Extract ─────────────────────────────────────────────────────────────
  info "Extrayendo ZIP..."
  rm -rf "$VERIFY_STAGING"
  mkdir -p "$VERIFY_STAGING"
  unzip -q "$ZIP_PATH" -d "$VERIFY_STAGING" || { fail "No se pudo extraer el ZIP"; exit 1; }
  EXTRACTED="$VERIFY_STAGING/Anclora-FileStudio-Windows-x64-Core"
  if [[ ! -d "$EXTRACTED" ]]; then
    fail "Raíz 'Anclora-FileStudio-Windows-x64-Core' no encontrada en el ZIP"
    exit 1
  fi
  ok "ZIP extraído en: $EXTRACTED"
  PASS=$((PASS+1))
else
  fail "ZIP no encontrado: $ZIP_PATH"
  echo -e "${RED}Ejecuta primero: pnpm build:portable:windows${NC}"
  exit 1
fi

# ── 4. Required directories ──────────────────────────────────────────────────
info "Verificando directorios obligatorios..."

REQUIRED_DIRS=(
  "app"
  "app/.next"
  "app/.next/static"
  "app/node_modules"
  "runtime"
  "tools"
  "tools/yt-dlp"
  "tools/ffmpeg"
  "tools/qpdf"
  "tools/sevenzip"
  "tools/pandoc"
  "data"
  "temp"
  "logs"
  "internal"
)

for d in "${REQUIRED_DIRS[@]}"; do
  if [[ -d "$EXTRACTED/$d" ]]; then
    ok "  Existe: $d/"
    PASS=$((PASS+1))
  else
    fail "  Falta directorio: $d/"
  fi
done

# ── 5. Required files ────────────────────────────────────────────────────────
info "Verificando archivos obligatorios..."

REQUIRED_FILES=(
  "INICIAR_ANCLORA_FILESTUDIO.bat"
  "CERRAR_ANCLORA_FILESTUDIO.bat"
  "ACTUALIZAR_YTDLP.bat"
  "DIAGNOSTICO_ANCLORA_FILESTUDIO.bat"
  "LEEME.txt"
  "VERSION.txt"
  "THIRD_PARTY_NOTICES.txt"
  "SBOM.cdx.json"
  "manifest.json"
  "app/server.js"
  "internal/start-anclora-filestudio.ps1"
  "internal/stop-anclora-filestudio.ps1"
  "internal/update-ytdlp.ps1"
  "internal/diagnose-anclora-filestudio.ps1"
  "internal/tool-resolution.ps1"
  "runtime/node.exe"
  "tools/yt-dlp/yt-dlp.exe"
  "tools/ffmpeg/ffmpeg.exe"
  "tools/ffmpeg/ffprobe.exe"
  "tools/pandoc/pandoc.exe"
  "tools/qpdf/qpdf.exe"
)

for f in "${REQUIRED_FILES[@]}"; do
  if [[ -e "$EXTRACTED/$f" ]]; then
    ok "  Existe: $f"
    PASS=$((PASS+1))
  else
    fail "  Falta: $f"
  fi
done

# ── 6. Native modules ────────────────────────────────────────────────────────
info "Verificando módulos nativos Windows..."

NATIVE_FILES=(
  "app/node_modules/better-sqlite3/build/Release/better_sqlite3.node"
  "app/node_modules/@img/sharp-win32-x64/lib/sharp-win32-x64-0.35.1.node"
  "app/node_modules/@img/sharp-win32-x64/lib/libvips-42.dll"
  "app/node_modules/@img/sharp-win32-x64/lib/libvips-cpp-8.18.3.dll"
)

for f in "${NATIVE_FILES[@]}"; do
  if [[ -f "$EXTRACTED/$f" ]]; then
    SIZE="$(du -sh "$EXTRACTED/$f" | awk '{print $1}')"
    ok "  Existe ($SIZE): $f"
    PASS=$((PASS+1))
  else
    fail "  Falta módulo nativo: $f"
  fi
done

# ── 7. semver — must NOT be a stub ───────────────────────────────────────────
info "Verificando paquete semver completo..."

if [[ -f "$EXTRACTED/app/node_modules/semver/index.js" ]]; then
  SEMVER_VER="$(python3 -c "import json; print(json.load(open('$EXTRACTED/app/node_modules/semver/package.json')).get('version','?'))" 2>/dev/null || echo "?")"
  ok "  semver/index.js presente (v${SEMVER_VER})"
  PASS=$((PASS+1))
else
  fail "  semver/index.js AUSENTE — stub detectado (Sharp fallará al cargar)"
fi

SEMVER_REQUIRED_FILES=(
  "app/node_modules/semver/index.js"
  "app/node_modules/semver/classes/semver.js"
  "app/node_modules/semver/classes/range.js"
  "app/node_modules/semver/functions/parse.js"
  "app/node_modules/semver/internal/re.js"
  "app/node_modules/semver/ranges/valid.js"
)
SEMVER_OK=true
for f in "${SEMVER_REQUIRED_FILES[@]}"; do
  if [[ ! -f "$EXTRACTED/$f" ]]; then
    fail "  Falta en semver: $f"
    SEMVER_OK=false
  fi
done
if [[ "$SEMVER_OK" == "true" ]]; then
  ok "  semver package completo (6/6 archivos requeridos)"
  PASS=$((PASS+1))
fi

# ── 8. manifest.json válido ──────────────────────────────────────────────────
info "Verificando manifest.json..."
if [[ -f "$EXTRACTED/manifest.json" ]]; then
  if python3 -c "import json,sys; d=json.load(open('$EXTRACTED/manifest.json')); sys.exit(0)" 2>/dev/null; then
    ok "  manifest.json es JSON válido"
    PASS=$((PASS+1))
  else
    fail "  manifest.json no es JSON válido"
  fi

  PLATFORM="$(python3 -c "import json; print(json.load(open('$EXTRACTED/manifest.json')).get('platform',''))" 2>/dev/null || echo '')"
  if [[ "$PLATFORM" == "windows" ]]; then
    ok "  manifest.platform = windows"
    PASS=$((PASS+1))
  else
    fail "  manifest.platform != windows (got: '$PLATFORM')"
  fi

  ARCH="$(python3 -c "import json; print(json.load(open('$EXTRACTED/manifest.json')).get('arch',''))" 2>/dev/null || echo '')"
  if [[ "$ARCH" == "x64" ]]; then
    ok "  manifest.arch = x64"
    PASS=$((PASS+1))
  else
    fail "  manifest.arch != x64 (got: '$ARCH')"
  fi

  for field in name version capabilities runtime; do
    HAS="$(python3 -c "import json; d=json.load(open('$EXTRACTED/manifest.json')); print('yes' if '$field' in d else 'no')" 2>/dev/null || echo 'no')"
    if [[ "$HAS" == "yes" ]]; then
      ok "  manifest.$field presente"
      PASS=$((PASS+1))
    else
      fail "  manifest.$field AUSENTE"
    fi
  done
else
  fail "  manifest.json no encontrado"
fi

# ── 9. SBOM.cdx.json válido ──────────────────────────────────────────────────
info "Verificando SBOM.cdx.json..."
if [[ -f "$EXTRACTED/SBOM.cdx.json" ]]; then
  if python3 -c "import json; json.load(open('$EXTRACTED/SBOM.cdx.json'))" 2>/dev/null; then
    ok "  SBOM.cdx.json es JSON válido"
    PASS=$((PASS+1))
  else
    fail "  SBOM.cdx.json no es JSON válido"
  fi
else
  fail "  SBOM.cdx.json no encontrado"
fi

# ── 10. No Linux binaries in app ─────────────────────────────────────────────
info "Verificando ausencia de binarios Linux en app/..."
LINUX_BINS="$(find "$EXTRACTED/app" \( -name "*.so" -o -name "*.dylib" \) 2>/dev/null || true)"
if [[ -n "$LINUX_BINS" ]]; then
  fail "  Binarios Linux encontrados:"
  echo "$LINUX_BINS" | head -5
else
  ok "  Sin binarios .so/.dylib en app/"
  PASS=$((PASS+1))
fi

# ── 11. No secrets or .git ───────────────────────────────────────────────────
info "Verificando ausencia de secretos y .git..."
SECRET_PATTERNS=(".env.local" ".env.production" "*.pem" "*.key" "*.pfx")
for pat in "${SECRET_PATTERNS[@]}"; do
  FOUND="$(find "$EXTRACTED" -name "$pat" 2>/dev/null | head -3)"
  if [[ -n "$FOUND" ]]; then
    fail "  Archivo sensible encontrado: $FOUND"
  else
    ok "  Ausente: $pat"
    PASS=$((PASS+1))
  fi
done

if find "$EXTRACTED" -name ".git" -type d 2>/dev/null | grep -q .; then
  fail "  Directorio .git encontrado en el paquete"
else
  ok "  Sin .git"
  PASS=$((PASS+1))
fi

# ── 12. No developer paths in launchers ──────────────────────────────────────
info "Verificando ausencia de rutas del desarrollador en BAT/PS1..."
DEV_PATHS=("/home/toni" "/root" "/home/antonio" "C:\\\\Users\\\\antonio" "wsl.localhost")
for p in "${DEV_PATHS[@]}"; do
  FOUND="$(grep -rl "$p" "$EXTRACTED" --include="*.bat" --include="*.ps1" 2>/dev/null || true)"
  if [[ -n "$FOUND" ]]; then
    fail "  Ruta hardcodeada '$p' encontrada en: $FOUND"
  else
    ok "  Ruta '$p' no encontrada en scripts"
    PASS=$((PASS+1))
  fi
done

# ── 13. BATs use %~dp0 ───────────────────────────────────────────────────────
info "Verificando que los BAT usan %%~dp0..."
for bat in "INICIAR_ANCLORA_FILESTUDIO.bat" "CERRAR_ANCLORA_FILESTUDIO.bat" \
           "ACTUALIZAR_YTDLP.bat" "DIAGNOSTICO_ANCLORA_FILESTUDIO.bat"; do
  if [[ -f "$EXTRACTED/$bat" ]]; then
    if grep -q "%~dp0" "$EXTRACTED/$bat" 2>/dev/null; then
      ok "  $bat usa %%~dp0"
      PASS=$((PASS+1))
    else
      fail "  $bat no usa %%~dp0"
    fi
  fi
done

# ── 14. start PS1 sets required ANCLORA_FILESTUDIO_* vars ────────────────────
info "Verificando variables ANCLORA_FILESTUDIO_* en start PS1..."
START_PS1="$EXTRACTED/internal/start-anclora-filestudio.ps1"
REQUIRED_ENV_VARS=(
  "ANCLORA_FILESTUDIO_FFMPEG_PATH"
  "ANCLORA_FILESTUDIO_FFPROBE_PATH"
  "ANCLORA_FILESTUDIO_YTDLP_PATH"
  "ANCLORA_FILESTUDIO_QPDF_PATH"
  "ANCLORA_FILESTUDIO_7ZIP_PATH"
  "ANCLORA_FILESTUDIO_PANDOC_PATH"
  "ANCLORA_FILESTUDIO_LIBREOFFICE_PATH"
  "ANCLORA_FILESTUDIO_CALIBRE_PATH"
  "ANCLORA_FILESTUDIO_TESSERACT_PATH"
  "ANCLORA_FILESTUDIO_TESSDATA_PREFIX"
  "ANCLORA_FILESTUDIO_DATA_DIR"
  "ANCLORA_FILESTUDIO_TEMP_DIR"
)
if [[ -f "$START_PS1" ]]; then
  for var in "${REQUIRED_ENV_VARS[@]}"; do
    if grep -q "$var" "$START_PS1" 2>/dev/null; then
      ok "  $var"
      PASS=$((PASS+1))
    else
      fail "  $var NO está en start-anclora-filestudio.ps1"
    fi
  done
else
  fail "  start-anclora-filestudio.ps1 no encontrado"
fi

TOOL_RESOLUTION_PS1="$EXTRACTED/internal/tool-resolution.ps1"
info "Verificando resolución de herramientas externas..."
if [[ -f "$TOOL_RESOLUTION_PS1" ]]; then
  TOOL_RESOLUTION_MARKERS=(
    "C:\\Program Files\\LibreOffice\\program\\soffice.com"
    "C:\\Program Files\\LibreOffice\\program\\soffice.exe"
    "C:\\Program Files\\Calibre2\\ebook-convert.exe"
    "C:\\Program Files\\Tesseract-OCR\\tesseract.exe"
    "C:\\Program Files\\Tesseract-OCR\\tessdata"
    "Get-Command"
    "ANCLORA_FILESTUDIO_TESSDATA_PREFIX"
  )
  for marker in "${TOOL_RESOLUTION_MARKERS[@]}"; do
    if grep -Fq "$marker" "$TOOL_RESOLUTION_PS1" 2>/dev/null; then
      ok "  tool-resolution contiene: $marker"
      PASS=$((PASS+1))
    else
      fail "  tool-resolution no contiene: $marker"
    fi
  done
  SOFFICE_COM_LINE="$(grep -nF "C:\\Program Files\\LibreOffice\\program\\soffice.com" "$TOOL_RESOLUTION_PS1" | head -1 | cut -d: -f1 || true)"
  SOFFICE_EXE_LINE="$(grep -nF "C:\\Program Files\\LibreOffice\\program\\soffice.exe" "$TOOL_RESOLUTION_PS1" | head -1 | cut -d: -f1 || true)"
  if [[ -n "$SOFFICE_COM_LINE" && -n "$SOFFICE_EXE_LINE" && "$SOFFICE_COM_LINE" -lt "$SOFFICE_EXE_LINE" ]]; then
    ok "  LibreOffice prioriza soffice.com antes de soffice.exe"
    PASS=$((PASS+1))
  else
    fail "  LibreOffice no prioriza soffice.com antes de soffice.exe"
  fi
else
  fail "  tool-resolution.ps1 no encontrado"
fi

# ── 15. Launcher binds to 127.0.0.1 ─────────────────────────────────────────
info "Verificando binding del launcher (127.0.0.1)..."
if [[ -f "$START_PS1" ]]; then
  if grep -q "127.0.0.1" "$START_PS1" 2>/dev/null; then
    ok "  Launcher binds to 127.0.0.1"
    PASS=$((PASS+1))
  else
    fail "  Launcher no menciona 127.0.0.1"
  fi
  if grep -q "0\.0\.0\.0" "$START_PS1" 2>/dev/null; then
    fail "  Launcher binds to 0.0.0.0 (INSECURE)"
  else
    ok "  No 0.0.0.0 binding"
    PASS=$((PASS+1))
  fi
fi

# ── 16. No .pnpm store (path length safety) ──────────────────────────────────
info "Verificando compatibilidad de rutas Windows..."
if [[ -d "$EXTRACTED/app/node_modules/.pnpm" ]]; then
  fail "  Contiene app/node_modules/.pnpm — rutas demasiado largas en Windows"
else
  ok "  Sin app/node_modules/.pnpm"
  PASS=$((PASS+1))
fi

MAX_PATH_INFO="$(cd "$(dirname "$EXTRACTED")" && find "$(basename "$EXTRACTED")" -type f 2>/dev/null | awk '{ if (length($0) > max) { max=length($0); path=$0 } } END { print max " " path }')"
MAX_PATH_LEN="${MAX_PATH_INFO%% *}"
if [[ "${MAX_PATH_LEN:-0}" -gt 180 ]]; then
  fail "  Ruta interna demasiado larga (${MAX_PATH_LEN} chars)"
else
  ok "  Ruta interna más larga: ${MAX_PATH_LEN:-0} chars"
  PASS=$((PASS+1))
fi

# ── 17. yt-dlp path injection and logs dir smoke checks ─────────────────────
info "Verificando inyección de ruta yt-dlp y directorio de logs..."

if [[ -f "$START_PS1" ]]; then
  # ANCLORA_FILESTUDIO_LOGS_DIR must be wired in the launcher
  if grep -q "ANCLORA_FILESTUDIO_LOGS_DIR" "$START_PS1" 2>/dev/null; then
    ok "  ANCLORA_FILESTUDIO_LOGS_DIR está configurado en el launcher"
    PASS=$((PASS+1))
  else
    fail "  ANCLORA_FILESTUDIO_LOGS_DIR NO está en start-anclora-filestudio.ps1 (errores yt-dlp no se persistirán en logs/)"
  fi

  # ANCLORA_FILESTUDIO_YTDLP_PATH must be assigned from the resolved tool variable
  # (not a bare "yt-dlp" string), meaning it derives from $YtdlpExe
  if grep -q 'ANCLORA_FILESTUDIO_YTDLP_PATH\s*=\s*\$YtdlpExe' "$START_PS1" 2>/dev/null; then
    ok "  ANCLORA_FILESTUDIO_YTDLP_PATH se asigna desde \$YtdlpExe (ruta absoluta)"
    PASS=$((PASS+1))
  else
    fail "  ANCLORA_FILESTUDIO_YTDLP_PATH no usa \$YtdlpExe — posible path bare o no resuelto"
  fi

  # Launcher must not set a bare yt-dlp on PATH as fallback for ANCLORA_FILESTUDIO_YTDLP_PATH
  if grep -Eq "ANCLORA_FILESTUDIO_YTDLP_PATH\s*=\s*['\"]?yt-dlp['\"]?" "$START_PS1" 2>/dev/null; then
    fail "  ANCLORA_FILESTUDIO_YTDLP_PATH se asigna a 'yt-dlp' bare (depende de PATH — falla en portable)"
  else
    ok "  ANCLORA_FILESTUDIO_YTDLP_PATH no es 'yt-dlp' bare"
    PASS=$((PASS+1))
  fi
fi

# --no-check-certificates must not appear in any script or bundled JS
info "Verificando ausencia de --no-check-certificates..."
NC_FOUND="$(grep -rl -- "--no-check-certificates" "$EXTRACTED" \
  --include="*.ps1" --include="*.bat" --include="*.sh" --include="*.js" \
  --include="*.mjs" --include="*.ts" 2>/dev/null | head -5 || true)"
if [[ -n "$NC_FOUND" ]]; then
  fail "  --no-check-certificates encontrado en:"
  echo "$NC_FOUND" | head -5 | while IFS= read -r f; do echo "    $f"; done
else
  ok "  --no-check-certificates ausente en scripts y app JS"
  PASS=$((PASS+1))
fi

# Verify yt-dlp.exe is present and non-zero size (sanity: bundled binary exists)
YTDLP_EXE="$EXTRACTED/tools/yt-dlp/yt-dlp.exe"
if [[ -f "$YTDLP_EXE" ]]; then
  YTDLP_SIZE="$(du -sh "$YTDLP_EXE" | awk '{print $1}')"
  ok "  tools/yt-dlp/yt-dlp.exe presente ($YTDLP_SIZE)"
  PASS=$((PASS+1))
else
  fail "  tools/yt-dlp/yt-dlp.exe AUSENTE — yt-dlp no estará disponible en portable"
fi

# ── Result ────────────────────────────────────────────────────────────────────
echo ""
echo -e "${CYAN}══════════════════════════════════════════════${NC}"
if [[ $FAILURES -eq 0 ]]; then
  echo -e "${GREEN}  ✓ TODAS LAS VERIFICACIONES PASARON (${PASS} checks)${NC}"
else
  echo -e "${RED}  ✗ ${FAILURES} verificación(es) FALLARON / ${PASS} pasaron${NC}"
fi
echo -e "${CYAN}══════════════════════════════════════════════${NC}"

# Clean up temp extract
if [[ -z "$STAGING_ARG" ]] && [[ -d "$VERIFY_STAGING" ]]; then
  rm -rf "$VERIFY_STAGING"
fi

[[ $FAILURES -eq 0 ]]
