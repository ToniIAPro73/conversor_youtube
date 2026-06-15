#!/usr/bin/env bash
# =============================================================================
# verify-windows-portable-v2.sh
# Verifica la integridad y contenido de la distribución portable de Link2Media.
# Versión actualizada: verifica LINK2MEDIA_* env vars, manifest.json, VERSION.txt,
# THIRD_PARTY_NOTICES.txt, y la nueva estructura de directorios con subdirectorios.
# Uso: bash scripts/verify-windows-portable-v2.sh [staging-dir]
# =============================================================================

set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
info() { echo -e "${CYAN}[CHECK]${NC} $*"; }
ok()   { echo -e "${GREEN}[PASS]${NC}  $*"; }
warn() { echo -e "${YELLOW}[WARN]${NC}  $*"; }
fail() { echo -e "${RED}[FAIL]${NC}  $*"; FAILURES=$((FAILURES+1)); }
skip() { echo -e "${YELLOW}[SKIP]${NC}  $*"; }

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCRIPTS_DIR="$REPO_ROOT/scripts"

# Allow passing a staging directory directly, or extract from ZIP
STAGING_ARG="${1:-}"
ZIP_PATH="$SCRIPTS_DIR/Link2Media-Windows-x64.zip"
SHA_PATH="$SCRIPTS_DIR/Link2Media-Windows-x64.zip.sha256"
VERIFY_STAGING="$SCRIPTS_DIR/.staging/.verify_tmp"
FAILURES=0

echo ""
echo -e "${CYAN}═══════════════════════════════════════════════════${NC}"
echo -e "${CYAN}  Verificación del paquete portable Link2Media v2   ${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════${NC}"
echo ""

# ── Determine the extracted directory ────────────────────────────────────────
EXTRACTED=""
if [[ -n "$STAGING_ARG" ]]; then
  EXTRACTED="$STAGING_ARG"
  info "Using provided staging directory: $EXTRACTED"
elif [[ -f "$ZIP_PATH" ]]; then
  # ── 1. Existe el ZIP ─────────────────────────────────────────────────────
  info "Verificando existencia del ZIP..."
  ZIP_SIZE="$(du -sh "$ZIP_PATH" | awk '{print $1}')"
  ok "ZIP encontrado: $ZIP_PATH ($ZIP_SIZE)"

  # ── 2. Hash SHA256 ───────────────────────────────────────────────────────
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

  # ── 3. Extraer en staging temporal ───────────────────────────────────────
  info "Extrayendo ZIP en staging temporal..."
  rm -rf "$VERIFY_STAGING"
  mkdir -p "$VERIFY_STAGING"
  unzip -q "$ZIP_PATH" -d "$VERIFY_STAGING" || { fail "No se pudo descomprimir el ZIP"; exit 1; }
  EXTRACTED="$VERIFY_STAGING/Link2Media-Windows-x64"
  [[ -d "$EXTRACTED" ]] || { fail "Directorio raíz Link2Media-Windows-x64 no encontrado en el ZIP"; exit 1; }
  ok "ZIP extraído"
else
  # Check if staging directory exists from build
  STAGING_DIR="$SCRIPTS_DIR/.staging/Link2Media-Windows-x64"
  if [[ -d "$STAGING_DIR" ]]; then
    EXTRACTED="$STAGING_DIR"
    info "Using existing staging directory: $EXTRACTED"
  else
    fail "Ni ZIP ni directorio de staging encontrados"
    echo -e "${RED}Ejecuta primero: bash scripts/build-windows-portable-v2.sh${NC}"
    exit 1
  fi
fi

# ── 4. Directorios obligatorios ─────────────────────────────────────────────
info "Verificando directorios obligatorios..."

REQUIRED_DIRS=(
  "licenses"
  "runtime"
  "app"
  "app/.next"
  "app/public"
  "tools"
  "tools/yt-dlp"
  "tools/ffmpeg"
  "tools/qpdf"
  "tools/sevenzip"
  "tools/pandoc"
  "tools/libreoffice"
  "tools/calibre"
  "tools/tesseract"
  "tools/tessdata"
  "tools/poppler"
  "data"
  "temp"
  "logs"
  "internal"
)

for d in "${REQUIRED_DIRS[@]}"; do
  if [[ -d "$EXTRACTED/$d" ]]; then
    ok "  Existe: $d/"
  else
    fail "  Falta directorio: $d/"
  fi
done

# ── 5. Archivos obligatorios ────────────────────────────────────────────────
info "Verificando archivos obligatorios..."

REQUIRED_FILES=(
  "INICIAR_LINK2MEDIA.bat"
  "CERRAR_LINK2MEDIA.bat"
  "ACTUALIZAR_YTDLP.bat"
  "DIAGNOSTICO_LINK2MEDIA.bat"
  "LEEME.txt"
  "VERSION.txt"
  "THIRD_PARTY_NOTICES.txt"
  "manifest.json"
  "app/server.js"
  "app/package.json"
  "internal/start-link2media.ps1"
  "internal/stop-link2media.ps1"
  "internal/update-ytdlp.ps1"
  "internal/diagnose-link2media.ps1"
)

for f in "${REQUIRED_FILES[@]}"; do
  if [[ -e "$EXTRACTED/$f" ]]; then
    ok "  Existe: $f"
  else
    fail "  Falta: $f"
  fi
done

# ── 6. manifest.json es JSON válido ─────────────────────────────────────────
info "Verificando manifest.json..."
if [[ -f "$EXTRACTED/manifest.json" ]]; then
  if node -e "JSON.parse(require('fs').readFileSync('$EXTRACTED/manifest.json','utf8'));process.exit(0)" 2>/dev/null; then
    ok "manifest.json es JSON válido"
    # Verify it has required fields
    HAS_APP="$(node -e "const m=JSON.parse(require('fs').readFileSync('$EXTRACTED/manifest.json','utf8'));console.log(m.app&&m.version&&m.components?'yes':'no')" 2>/dev/null || echo 'no')"
    if [[ "$HAS_APP" == "yes" ]]; then
      ok "manifest.json tiene campos requeridos (app, version, components)"
    else
      fail "manifest.json no tiene todos los campos requeridos (app, version, components)"
    fi
  else
    fail "manifest.json no es JSON válido"
  fi
else
  fail "manifest.json no encontrado"
fi

# ── 7. VERSION.txt existe y tiene contenido ─────────────────────────────────
info "Verificando VERSION.txt..."
if [[ -f "$EXTRACTED/VERSION.txt" ]]; then
  VERSION_CONTENT="$(head -1 "$EXTRACTED/VERSION.txt" 2>/dev/null || true)"
  if [[ -n "$VERSION_CONTENT" ]]; then
    ok "VERSION.txt existe y tiene contenido: $VERSION_CONTENT"
  else
    fail "VERSION.txt está vacío"
  fi
else
  fail "VERSION.txt no encontrado"
fi

# ── 8. THIRD_PARTY_NOTICES.txt existe ───────────────────────────────────────
info "Verificando THIRD_PARTY_NOTICES.txt..."
if [[ -f "$EXTRACTED/THIRD_PARTY_NOTICES.txt" ]]; then
  LINES="$(wc -l < "$EXTRACTED/THIRD_PARTY_NOTICES.txt")"
  ok "THIRD_PARTY_NOTICES.txt existe ($LINES líneas)"
else
  fail "THIRD_PARTY_NOTICES.txt no encontrado"
fi

# ── 9. No contiene archivos secretos ────────────────────────────────────────
info "Verificando ausencia de secretos..."

SECRET_PATTERNS=(".env.local" ".env.production" "*.pem" "*.key" "*.pfx" ".env")
for pat in "${SECRET_PATTERNS[@]}"; do
  FOUND="$(find "$EXTRACTED" -name "$pat" 2>/dev/null | head -3)"
  if [[ -n "$FOUND" ]]; then
    fail "  Encontrado archivo sensible: $FOUND"
  else
    ok "  Ausente: $pat"
  fi
done

# ── 10. No contiene .git ────────────────────────────────────────────────────
info "Verificando ausencia de .git..."
if [[ -d "$EXTRACTED/.git" ]] || find "$EXTRACTED" -name ".git" -type d 2>/dev/null | grep -q .; then
  fail "  Directorio .git encontrado en el paquete"
else
  ok "  Sin .git"
fi

# ── 11. No contiene binarios Linux ──────────────────────────────────────────
info "Verificando ausencia de binarios Linux..."
LINUX_BINS="$(find "$EXTRACTED/app" \( -name "*.so" -o -name "*.dylib" \) 2>/dev/null || true)"
if [[ -n "$LINUX_BINS" ]]; then
  fail "  Binarios Linux encontrados en app/:"
  echo "$LINUX_BINS"
else
  ok "  Sin binarios .so/.dylib en app/"
fi

# ── 12. No contiene rutas del desarrollador ─────────────────────────────────
info "Verificando ausencia de rutas del desarrollador en BAT/PS1..."
DEV_PATHS=("/home/toni" "/root" "/home/antonio" "C:\\Users\\antonio" "wsl.localhost" "/home/z/")
for p in "${DEV_PATHS[@]}"; do
  FOUND="$(grep -rl "$p" "$EXTRACTED" --include="*.bat" --include="*.ps1" 2>/dev/null || true)"
  if [[ -n "$FOUND" ]]; then
    fail "  Ruta hardcodeada '$p' encontrada en: $FOUND"
  else
    ok "  Ruta '$p' no encontrada en scripts"
  fi
done

# ── 13. .bat usa %~dp0 (rutas relativas) ───────────────────────────────────
info "Verificando que los BAT usan %%~dp0 ..."
BAT_FILES=("INICIAR_LINK2MEDIA.bat" "CERRAR_LINK2MEDIA.bat" "ACTUALIZAR_YTDLP.bat" "DIAGNOSTICO_LINK2MEDIA.bat")
for bat in "${BAT_FILES[@]}"; do
  if [[ -f "$EXTRACTED/$bat" ]] && grep -q "%~dp0" "$EXTRACTED/$bat" 2>/dev/null; then
    ok "  $bat usa %%~dp0"
  elif [[ -f "$EXTRACTED/$bat" ]]; then
    fail "  $bat no usa %%~dp0 — las rutas pueden ser absolutas del dev"
  fi
done

# ── 14. Launcher scripts set LINK2MEDIA_* env vars ──────────────────────────
info "Verificando que start-link2media.ps1 establece variables LINK2MEDIA_*..."

REQUIRED_ENV_VARS=(
  "LINK2MEDIA_FFMPEG_PATH"
  "LINK2MEDIA_FFPROBE_PATH"
  "LINK2MEDIA_YTDLP_PATH"
  "LINK2MEDIA_QPDF_PATH"
  "LINK2MEDIA_7ZIP_PATH"
  "LINK2MEDIA_PANDOC_PATH"
  "LINK2MEDIA_LIBREOFFICE_PATH"
  "LINK2MEDIA_CALIBRE_PATH"
  "LINK2MEDIA_TESSERACT_PATH"
  "LINK2MEDIA_TESSDATA_PREFIX"
  "LINK2MEDIA_POPPLER_PATH"
  "LINK2MEDIA_DATA_DIR"
  "LINK2MEDIA_TEMP_DIR"
)

START_PS1="$EXTRACTED/internal/start-link2media.ps1"
if [[ -f "$START_PS1" ]]; then
  for var in "${REQUIRED_ENV_VARS[@]}"; do
    if grep -q "$var" "$START_PS1" 2>/dev/null; then
      ok "  $var está en start-link2media.ps1"
    else
      fail "  $var NO está en start-link2media.ps1"
    fi
  done
else
  fail "  start-link2media.ps1 no encontrado — no se pueden verificar env vars"
fi

# ── 15. No contiene .pnpm store ─────────────────────────────────────────────
info "Verificando compatibilidad de rutas Windows..."
if [[ -d "$EXTRACTED/app/node_modules/.pnpm" ]]; then
  fail "  El paquete contiene app/node_modules/.pnpm; puede provocar rutas demasiado largas"
else
  ok "  Sin app/node_modules/.pnpm"
fi

MAX_PATH_INFO="$(cd "$(dirname "$EXTRACTED")" && find "$(basename "$EXTRACTED")" -type f 2>/dev/null | awk '{ if (length($0) > max) { max=length($0); path=$0 } } END { print max " " path }')"
MAX_PATH_LEN="${MAX_PATH_INFO%% *}"
MAX_PATH_NAME="${MAX_PATH_INFO#* }"
if [[ "${MAX_PATH_LEN:-0}" -gt 180 ]]; then
  fail "  Ruta interna demasiado larga (${MAX_PATH_LEN} caracteres): $MAX_PATH_NAME"
else
  ok "  Ruta interna mas larga: ${MAX_PATH_LEN:-0} caracteres"
fi

# ── 16. diagnose-link2media.ps1 existe ──────────────────────────────────────
info "Verificando script de diagnostico..."
if [[ -f "$EXTRACTED/internal/diagnose-link2media.ps1" ]]; then
  ok "  internal/diagnose-link2media.ps1 existe"
  # Verify it references tools
  if grep -q "LINK2MEDIA_" "$EXTRACTED/internal/diagnose-link2media.ps1" 2>/dev/null; then
    ok "  diagnose-link2media.ps1 referencia variables LINK2MEDIA_*"
  else
    warn "  diagnose-link2media.ps1 no referencia variables LINK2MEDIA_*"
  fi
else
  fail "  internal/diagnose-link2media.ps1 no encontrado"
fi

# ── 17. DIAGNOSTICO_LINK2MEDIA.bat existe ───────────────────────────────────
info "Verificando DIAGNOSTICO_LINK2MEDIA.bat..."
if [[ -f "$EXTRACTED/DIAGNOSTICO_LINK2MEDIA.bat" ]]; then
  ok "  DIAGNOSTICO_LINK2MEDIA.bat existe"
  if grep -q "diagnose-link2media.ps1" "$EXTRACTED/DIAGNOSTICO_LINK2MEDIA.bat" 2>/dev/null; then
    ok "  DIAGNOSTICO_LINK2MEDIA.bat invoca diagnose-link2media.ps1"
  else
    fail "  DIAGNOSTICO_LINK2MEDIA.bat no invoca diagnose-link2media.ps1"
  fi
else
  fail "  DIAGNOSTICO_LINK2MEDIA.bat no encontrado"
fi

# ── Resultado final ─────────────────────────────────────────────────────────
echo ""
echo -e "${CYAN}════════════════════════════════════════════${NC}"
if [[ $FAILURES -eq 0 ]]; then
  echo -e "${GREEN}  ✓ TODAS LAS VERIFICACIONES PASARON${NC}"
else
  echo -e "${RED}  ✗ $FAILURES verificación(es) FALLARON${NC}"
fi
echo -e "${CYAN}════════════════════════════════════════════${NC}"

# Limpiar staging temporal (only if we extracted from ZIP)
if [[ -z "$STAGING_ARG" ]] && [[ -d "$VERIFY_STAGING" ]]; then
  rm -rf "$VERIFY_STAGING"
fi

[[ $FAILURES -eq 0 ]]
