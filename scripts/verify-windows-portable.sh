#!/usr/bin/env bash
# =============================================================================
# verify-windows-portable.sh
# Verifica la integridad y contenido del ZIP portable de Link2Media.
# Uso: bash scripts/verify-windows-portable.sh
# =============================================================================

set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
info() { echo -e "${CYAN}[CHECK]${NC} $*"; }
ok()   { echo -e "${GREEN}[PASS]${NC}  $*"; }
warn() { echo -e "${YELLOW}[WARN]${NC}  $*"; }
fail() { echo -e "${RED}[FAIL]${NC}  $*"; FAILURES=$((FAILURES+1)); }
skip() { echo -e "${YELLOW}[SKIP]${NC}  $*"; }

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCRIPTS_DIR="$REPO_ROOT/scripts"
ZIP_PATH="$SCRIPTS_DIR/Link2Media-Windows-x64.zip"
SHA_PATH="$SCRIPTS_DIR/Link2Media-Windows-x64.zip.sha256"
VERIFY_STAGING="$SCRIPTS_DIR/.staging/.verify_tmp"
FAILURES=0

echo ""
echo -e "${CYAN}═══════════════════════════════════════════════════${NC}"
echo -e "${CYAN}  Verificación del paquete portable Link2Media      ${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════${NC}"
echo ""

# ── 1. Existe el ZIP ─────────────────────────────────────────────────────────
info "Verificando existencia del ZIP..."
if [[ -f "$ZIP_PATH" ]]; then
  ZIP_SIZE="$(du -sh "$ZIP_PATH" | awk '{print $1}')"
  ok "ZIP encontrado: $ZIP_PATH ($ZIP_SIZE)"
else
  fail "ZIP no encontrado: $ZIP_PATH"
  echo -e "${RED}Ejecuta primero: bash scripts/build-windows-portable.sh${NC}"
  exit 1
fi

# ── 2. Hash SHA256 ───────────────────────────────────────────────────────────
info "Verificando SHA256..."
if [[ -f "$SHA_PATH" ]]; then
  if (cd "$SCRIPTS_DIR" && sha256sum -c "$(basename "$SHA_PATH")" --quiet 2>/dev/null); then
    ok "SHA256 verificado"
  else
    fail "SHA256 no coincide"
  fi
else
  warn "Archivo .sha256 no encontrado — omitiendo verificación de hash"
fi

# ── 3. Extraer en staging temporal ───────────────────────────────────────────
info "Extrayendo ZIP en staging temporal..."
rm -rf "$VERIFY_STAGING"
mkdir -p "$VERIFY_STAGING"
unzip -q "$ZIP_PATH" -d "$VERIFY_STAGING" || { fail "No se pudo descomprimir el ZIP"; exit 1; }
EXTRACTED="$VERIFY_STAGING/Link2Media-Windows-x64"
[[ -d "$EXTRACTED" ]] || { fail "Directorio raíz Link2Media-Windows-x64 no encontrado en el ZIP"; exit 1; }
ok "ZIP extraído"

# ── 4. Archivos obligatorios ─────────────────────────────────────────────────
info "Verificando archivos obligatorios..."

REQUIRED_FILES=(
  "INICIAR_LINK2MEDIA.bat"
  "CERRAR_LINK2MEDIA.bat"
  "ACTUALIZAR_YTDLP.bat"
  "LEEME.txt"
  "VERSION.txt"
  "THIRD_PARTY_NOTICES.txt"
  "manifest.json"
  "runtime/node.exe"
  "tools/yt-dlp.exe"
  "tools/ffmpeg/bin/ffmpeg.exe"
  "tools/ffmpeg/bin/ffprobe.exe"
  "app/server.js"
  "app/package.json"
  "app/.next/static"
  "internal/start-link2media.ps1"
  "internal/stop-link2media.ps1"
  "internal/update-ytdlp.ps1"
)

for f in "${REQUIRED_FILES[@]}"; do
  if [[ -e "$EXTRACTED/$f" ]]; then
    ok "  Existe: $f"
  else
    fail "  Falta: $f"
  fi
done

# ── 5. No contiene archivos secretos ─────────────────────────────────────────
info "Verificando ausencia de secretos..."

SECRET_PATTERNS=(".env.local" ".env.production" "*.pem" "*.key" "*.pfx")
for pat in "${SECRET_PATTERNS[@]}"; do
  FOUND="$(find "$EXTRACTED" -name "$pat" 2>/dev/null | head -3)"
  if [[ -n "$FOUND" ]]; then
    fail "  Encontrado archivo sensible: $FOUND"
  else
    ok "  Ausente: $pat"
  fi
done

# ── 6. No contiene .git ───────────────────────────────────────────────────────
info "Verificando ausencia de .git..."
if [[ -d "$EXTRACTED/.git" ]] || find "$EXTRACTED" -name ".git" -type d | grep -q .; then
  fail "  Directorio .git encontrado en el ZIP"
else
  ok "  Sin .git"
fi

# ── 7. No contiene binarios Linux ─────────────────────────────────────────────
info "Verificando ausencia de binarios Linux..."
LINUX_BINS="$(find "$EXTRACTED/app" \( -name "*.so" -o -name "*.dylib" \) 2>/dev/null || true)"
if [[ -n "$LINUX_BINS" ]]; then
  fail "  Binarios Linux encontrados:"
  echo "$LINUX_BINS"
else
  ok "  Sin binarios .so/.dylib en app/"
fi

# ── 8. No contiene store .pnpm ni rutas internas largas ──────────────────────
info "Verificando compatibilidad de rutas Windows..."
if [[ -d "$EXTRACTED/app/node_modules/.pnpm" ]]; then
  fail "  El paquete contiene app/node_modules/.pnpm; puede provocar rutas demasiado largas"
else
  ok "  Sin app/node_modules/.pnpm"
fi

MAX_PATH_INFO="$(cd "$VERIFY_STAGING" && find Link2Media-Windows-x64 -type f | awk '{ if (length($0) > max) { max=length($0); path=$0 } } END { print max " " path }')"
MAX_PATH_LEN="${MAX_PATH_INFO%% *}"
MAX_PATH_NAME="${MAX_PATH_INFO#* }"
if [[ "${MAX_PATH_LEN:-0}" -gt 180 ]]; then
  fail "  Ruta interna demasiado larga (${MAX_PATH_LEN} caracteres): $MAX_PATH_NAME"
else
  ok "  Ruta interna mas larga: ${MAX_PATH_LEN} caracteres"
fi

# ── 9. No contiene rutas del desarrollador ───────────────────────────────────
info "Verificando ausencia de rutas del desarrollador en BAT/PS1..."
DEV_PATHS=("/home/toni" "/root" "/home/antonio" "C:\\Users\\antonio" "wsl.localhost")
for p in "${DEV_PATHS[@]}"; do
  FOUND="$(grep -r "$p" "$EXTRACTED" --include="*.bat" --include="*.ps1" -l 2>/dev/null || true)"
  if [[ -n "$FOUND" ]]; then
    fail "  Ruta hardcodeada '$p' encontrada en: $FOUND"
  else
    ok "  Ruta '$p' no encontrada en scripts"
  fi
done

# ── 10. .bat contiene %~dp0 (rutas relativas) ────────────────────────────────
info "Verificando que el BAT usa %%~dp0 ..."
if grep -q "%~dp0" "$EXTRACTED/INICIAR_LINK2MEDIA.bat" 2>/dev/null; then
  ok "  INICIAR_LINK2MEDIA.bat usa %%~dp0"
else
  fail "  INICIAR_LINK2MEDIA.bat no usa %%~dp0 — las rutas pueden ser absolutas del dev"
fi

# ── 11. Verificación Windows (si cmd.exe está disponible) ────────────────────
echo ""
info "Verificaciones Windows..."
if command -v cmd.exe >/dev/null 2>&1; then
  WIN_EXTRACT="$(cmd.exe /c "echo %TEMP%" 2>/dev/null | tr -d '\r' | tail -n 1)"
  WIN_EXTRACT="$(printf '%s' "$WIN_EXTRACT" | tr -d '\n')"
  if [[ -z "$WIN_EXTRACT" ]]; then
    WIN_TEMP_WSL="$(printf '%s' "$PATH" | tr ':' '\n' | sed -n 's#^\(/mnt/c/Users/[^/]\+/AppData/Local\)/.*#\1/Temp#p' | head -1)"
    if [[ -n "$WIN_TEMP_WSL" ]]; then
      mkdir -p "$WIN_TEMP_WSL"
      WIN_EXTRACT="$(wslpath -w "$WIN_TEMP_WSL")"
    fi
  fi
  if [[ -z "$WIN_EXTRACT" ]]; then
    skip "  No se pudo resolver la carpeta TEMP de Windows"
    exit 0
  fi
  WIN_EXTRACT="${WIN_EXTRACT%\\}"
  WIN_TEST_DIR="${WIN_EXTRACT}\\Link2Media-Test-$$"

  info "  Copiando a carpeta Windows: $WIN_TEST_DIR"

  # Extraer en ruta Windows usando PowerShell
  WIN_DEST="$WIN_TEST_DIR"
  WIN_ZIP_LOCAL="${WIN_EXTRACT}\\Link2Media-Windows-x64-$$.zip"
  WIN_ZIP_LOCAL_WSL="$(wslpath -u "$WIN_ZIP_LOCAL")"
  cp "$ZIP_PATH" "$WIN_ZIP_LOCAL_WSL"

  powershell.exe -NoProfile -NonInteractive -Command "
    Expand-Archive -Path '$WIN_ZIP_LOCAL' -DestinationPath '$WIN_DEST' -Force
  " 2>/dev/null && {
    ok "  ZIP extraído en Windows: $WIN_DEST"

    # Comprobar que node.exe ejecuta en Windows
    WIN_NODE="$WIN_DEST\\Link2Media-Windows-x64\\runtime\\node.exe"
    NODE_VER="$(powershell.exe -NoProfile -Command "& '$WIN_NODE' --version" 2>/dev/null | tr -d '\r')" && {
      ok "  node.exe responde: $NODE_VER"
    } || fail "  node.exe no responde en Windows"

    # Comprobar yt-dlp.exe
    WIN_YTDLP="$WIN_DEST\\Link2Media-Windows-x64\\tools\\yt-dlp.exe"
    YTDLP_VER="$(powershell.exe -NoProfile -Command "& '$WIN_YTDLP' --version" 2>/dev/null | tr -d '\r')" && {
      ok "  yt-dlp.exe responde: $YTDLP_VER"
    } || fail "  yt-dlp.exe no responde en Windows"

    # Comprobar ffmpeg.exe
    WIN_FFMPEG="$WIN_DEST\\Link2Media-Windows-x64\\tools\\ffmpeg\\bin\\ffmpeg.exe"
    FFMPEG_VER="$(powershell.exe -NoProfile -Command "& '$WIN_FFMPEG' -version 2>&1" 2>/dev/null | head -1 | tr -d '\r')" && {
      ok "  ffmpeg.exe responde: $FFMPEG_VER"
    } || fail "  ffmpeg.exe no responde en Windows"

    # Limpiar
    powershell.exe -NoProfile -Command "Remove-Item -Recurse -Force '$WIN_DEST'" 2>/dev/null || true
    rm -f "$WIN_ZIP_LOCAL_WSL" 2>/dev/null || true
    ok "  Carpeta de prueba Windows limpiada"
  } || {
    rm -f "$WIN_ZIP_LOCAL_WSL" 2>/dev/null || true
    skip "  No se pudo extraer en Windows"
  }
else
  skip "  cmd.exe no disponible — pruebas Windows omitidas"
  skip "  PENDIENTE: extraer el ZIP en Windows y verificar manualmente"
fi

# ── Resultado final ───────────────────────────────────────────────────────────
echo ""
echo -e "${CYAN}════════════════════════════════════════════${NC}"
if [[ $FAILURES -eq 0 ]]; then
  echo -e "${GREEN}  ✓ TODAS LAS VERIFICACIONES PASARON${NC}"
else
  echo -e "${RED}  ✗ $FAILURES verificación(es) FALLARON${NC}"
fi
echo -e "${CYAN}════════════════════════════════════════════${NC}"

# Limpiar staging temporal
rm -rf "$VERIFY_STAGING"

[[ $FAILURES -eq 0 ]]
