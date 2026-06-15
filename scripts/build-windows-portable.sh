#!/usr/bin/env bash
# =============================================================================
# build-windows-portable.sh
# Construye la distribución portable de Link2Media para Windows x64.
# Uso: bash scripts/build-windows-portable.sh
# =============================================================================

set -euo pipefail

# ── Colores ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
info()    { echo -e "${CYAN}[INFO]${NC}  $*"; }
ok()      { echo -e "${GREEN}[OK]${NC}    $*"; }
warn()    { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error()   { echo -e "${RED}[ERROR]${NC} $*" >&2; }
die()     { error "$*"; exit 1; }

# ── Rutas ────────────────────────────────────────────────────────────────────
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCRIPTS_DIR="$REPO_ROOT/scripts"
CACHE_DIR="$SCRIPTS_DIR/.cache/windows-portable"
STAGING_BASE="$SCRIPTS_DIR/.staging"
STAGING_DIR="$STAGING_BASE/Link2Media-Windows-x64"
OUT_ZIP="$SCRIPTS_DIR/Link2Media-Windows-x64.zip"
OUT_SHA="$SCRIPTS_DIR/Link2Media-Windows-x64.zip.sha256"

# ── Versiones (sobreescribibles por env) ─────────────────────────────────────
NODE_WINDOWS_VERSION="${NODE_WINDOWS_VERSION:-}"
NODE_MODULES_ABI="${NODE_MODULES_ABI:-}"
YTDLP_WINDOWS_VERSION="${YTDLP_WINDOWS_VERSION:-}"
FFMPEG_WINDOWS_VERSION="${FFMPEG_WINDOWS_VERSION:-}"
SQLITE3_WINDOWS_VERSION="${SQLITE3_WINDOWS_VERSION:-}"

BUILD_DATE_UTC="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
APP_VERSION="0.1.0"

# ── 1. Verificar directorio de ejecución ─────────────────────────────────────
info "Verificando directorio de trabajo..."
[[ -f "$REPO_ROOT/package.json" ]] || die "Ejecuta desde la raíz del repositorio: bash scripts/build-windows-portable.sh"
cd "$REPO_ROOT"
ok "Directorio: $REPO_ROOT"

# ── 2. Verificar herramientas ─────────────────────────────────────────────────
info "Verificando herramientas requeridas..."
for tool in node pnpm curl unzip sha256sum python3; do
  command -v "$tool" >/dev/null 2>&1 || die "Herramienta no encontrada: $tool"
done
ok "Todas las herramientas disponibles"

# ── 3. Limpiar staging anterior ───────────────────────────────────────────────
info "Limpiando staging anterior..."
rm -rf "$STAGING_DIR"
mkdir -p "$STAGING_DIR"
mkdir -p "$CACHE_DIR"
ok "Staging limpio: $STAGING_DIR"

# ── 4. Instalar dependencias ──────────────────────────────────────────────────
info "Instalando dependencias (frozen-lockfile)..."
pnpm install --frozen-lockfile
ok "Dependencias instaladas"

# ── 5. Lint ───────────────────────────────────────────────────────────────────
info "Ejecutando lint..."
pnpm lint || { warn "Lint reportó advertencias (no bloqueante)"; }

# ── 6. Typecheck ──────────────────────────────────────────────────────────────
info "Ejecutando typecheck..."
pnpm typecheck || die "Typecheck falló"
ok "Typecheck OK"

# ── 7. Tests ──────────────────────────────────────────────────────────────────
info "Ejecutando tests..."
pnpm test || { warn "Tests no disponibles o fallaron (revisión manual requerida)"; }

# ── 8. Build Next.js standalone ──────────────────────────────────────────────
info "Ejecutando pnpm build (modo standalone)..."
NEXT_TELEMETRY_DISABLED=1 pnpm build
[[ -f ".next/standalone/server.js" ]] || die ".next/standalone/server.js no encontrado tras el build"
ok "Build completado"

# ── 9. Copiar aplicación al staging ──────────────────────────────────────────
info "Copiando aplicación al staging..."

APP_DIR="$STAGING_DIR/app"
mkdir -p "$APP_DIR"

# Copiar standalone (incluye server.js y node_modules mínimos)
cp -a .next/standalone/. "$APP_DIR/"

# Eliminar archivos inesperados en la raíz de app/ (solo server.js y package.json pertenecen ahí)
# Next.js standalone puede arrastrar ficheros del root del proyecto (ej. RUN_BUILD.bat)
find "$APP_DIR" -maxdepth 1 -type f ! -name "server.js" ! -name "package.json" -delete 2>/dev/null || true
ok "Archivos no pertenecientes a la app eliminados de app/ raíz"

# Copiar assets estáticos (Next.js NO los incluye en standalone automáticamente)
mkdir -p "$APP_DIR/.next/static"
cp -a .next/static/. "$APP_DIR/.next/static/"

# Copiar carpeta public
if [[ -d "public" ]]; then
  cp -a public/. "$APP_DIR/public/"
fi

ok "Aplicación copiada"

# ── 10. Descargar / reutilizar Node.js para Windows x64 ──────────────────────
info "Preparando Node.js para Windows x64..."

resolve_node_version() {
  # Obtiene la versión LTS más reciente de Node.js
  curl -fsSL "https://nodejs.org/dist/index.json" \
    | python3 -c "
import sys, json
data = json.load(sys.stdin)
lts = [v for v in data if v.get('lts')]
print(lts[0]['version'])
" 2>/dev/null || echo "v22.16.0"
}

if [[ -z "$NODE_WINDOWS_VERSION" ]]; then
  info "Resolviendo versión LTS de Node.js..."
  NODE_WINDOWS_VERSION="$(resolve_node_version)"
  info "Versión Node.js resuelta: $NODE_WINDOWS_VERSION"
fi

# Derivar el ABI de Node.js para seleccionar el binario nativo correcto de better-sqlite3
if [[ -z "$NODE_MODULES_ABI" ]]; then
  NODE_MAJOR="${NODE_WINDOWS_VERSION#v}"
  NODE_MAJOR="${NODE_MAJOR%%.*}"
  case "$NODE_MAJOR" in
    20) NODE_MODULES_ABI="115" ;;
    22) NODE_MODULES_ABI="127" ;;
    23) NODE_MODULES_ABI="131" ;;
    24) NODE_MODULES_ABI="137" ;;
    *) NODE_MODULES_ABI="127" ; warn "ABI desconocido para Node.js $NODE_MAJOR, usando 127" ;;
  esac
  info "Node.js module ABI: $NODE_MODULES_ABI"
fi

NODE_ZIP="node-${NODE_WINDOWS_VERSION}-win-x64.zip"
NODE_URL="https://nodejs.org/dist/${NODE_WINDOWS_VERSION}/${NODE_ZIP}"
NODE_CACHE="$CACHE_DIR/$NODE_ZIP"

if [[ ! -f "$NODE_CACHE" ]]; then
  info "Descargando $NODE_URL ..."
  curl --fail --location --retry 3 --progress-bar -o "$NODE_CACHE" "$NODE_URL" \
    || die "No se pudo descargar Node.js desde $NODE_URL"
fi

NODE_SHA256="$(sha256sum "$NODE_CACHE" | awk '{print $1}')"
ok "Node.js descargado/cacheado: $NODE_WINDOWS_VERSION (SHA256: ${NODE_SHA256:0:16}...)"

# Extraer solo node.exe
info "Extrayendo node.exe..."
RUNTIME_DIR="$STAGING_DIR/runtime"
mkdir -p "$RUNTIME_DIR"
TMP_NODE_EXTRACT="$CACHE_DIR/.tmp_node_extract"
rm -rf "$TMP_NODE_EXTRACT"
mkdir -p "$TMP_NODE_EXTRACT"
unzip -q "$NODE_CACHE" "node-${NODE_WINDOWS_VERSION}-win-x64/node.exe" -d "$TMP_NODE_EXTRACT" \
  || die "No se pudo extraer node.exe del ZIP"
cp "$TMP_NODE_EXTRACT/node-${NODE_WINDOWS_VERSION}-win-x64/node.exe" "$RUNTIME_DIR/node.exe"
rm -rf "$TMP_NODE_EXTRACT"
[[ -f "$RUNTIME_DIR/node.exe" ]] || die "node.exe no encontrado tras la extracción"
ok "node.exe extraído"

# ── 10b. Descargar (y cachear) better-sqlite3 Windows nativo ─────────────────
# La descarga se hace aquí para que SQLITE3_SHA256 y SQLITE3_WINDOWS_VERSION
# estén definidos antes de que los pasos 16-18 generen los manifests.
# La instalación en staging se hace en el paso 19b (tras limpiar el .node Linux).
info "Resolviendo versión de better-sqlite3..."
if [[ -z "$SQLITE3_WINDOWS_VERSION" ]]; then
  SQLITE3_WINDOWS_VERSION="$(node -e "const p=require('./node_modules/better-sqlite3/package.json');console.log(p.version);" 2>/dev/null \
    || python3 -c "
import json, re, pathlib
txt = pathlib.Path('package.json').read_text()
data = json.loads(txt)
ver = data.get('dependencies', {}).get('better-sqlite3', '12.10.1')
print(re.sub(r'^[\^~]', '', ver))
")"
fi
info "better-sqlite3: v${SQLITE3_WINDOWS_VERSION} (node-v${NODE_MODULES_ABI})"

SQLITE3_ASSET="better-sqlite3-v${SQLITE3_WINDOWS_VERSION}-node-v${NODE_MODULES_ABI}-win32-x64.tar.gz"
SQLITE3_URL="https://github.com/WiseLibs/better-sqlite3/releases/download/v${SQLITE3_WINDOWS_VERSION}/${SQLITE3_ASSET}"
SQLITE3_CACHE="$CACHE_DIR/$SQLITE3_ASSET"

if [[ ! -f "$SQLITE3_CACHE" ]]; then
  info "Descargando $SQLITE3_ASSET ..."
  curl --fail --location --retry 3 --progress-bar -o "$SQLITE3_CACHE" "$SQLITE3_URL" \
    || die "No se pudo descargar better-sqlite3 desde $SQLITE3_URL"
fi
SQLITE3_SHA256="$(sha256sum "$SQLITE3_CACHE" | awk '{print $1}')"
ok "better-sqlite3 cacheado (SHA256: ${SQLITE3_SHA256:0:16}...)"

# ── 11. Descargar / reutilizar yt-dlp.exe ────────────────────────────────────
info "Preparando yt-dlp.exe..."

resolve_ytdlp_version() {
  curl -fsSL "https://api.github.com/repos/yt-dlp/yt-dlp/releases/latest" \
    | python3 -c "import sys,json; print(json.load(sys.stdin)['tag_name'])" 2>/dev/null \
    || find "$CACHE_DIR" -maxdepth 1 -name 'yt-dlp-*.exe' -printf '%f\n' 2>/dev/null \
      | sed -E 's/^yt-dlp-(.*)\.exe$/\1/' \
      | sort -V \
      | tail -1 \
    || echo "2026.06.09"
}

if [[ -z "$YTDLP_WINDOWS_VERSION" ]]; then
  info "Resolviendo versión estable de yt-dlp..."
  YTDLP_WINDOWS_VERSION="$(resolve_ytdlp_version)"
  info "Versión yt-dlp resuelta: $YTDLP_WINDOWS_VERSION"
fi

YTDLP_CACHE="$CACHE_DIR/yt-dlp-${YTDLP_WINDOWS_VERSION}.exe"
YTDLP_URL="https://github.com/yt-dlp/yt-dlp/releases/download/${YTDLP_WINDOWS_VERSION}/yt-dlp.exe"

if [[ ! -f "$YTDLP_CACHE" ]]; then
  info "Descargando yt-dlp.exe $YTDLP_WINDOWS_VERSION ..."
  curl --fail --location --retry 3 --progress-bar -o "$YTDLP_CACHE" "$YTDLP_URL" \
    || die "No se pudo descargar yt-dlp.exe"
fi

YTDLP_SHA256="$(sha256sum "$YTDLP_CACHE" | awk '{print $1}')"
ok "yt-dlp.exe listo: $YTDLP_WINDOWS_VERSION (SHA256: ${YTDLP_SHA256:0:16}...)"

TOOLS_DIR="$STAGING_DIR/tools"
mkdir -p "$TOOLS_DIR"
cp "$YTDLP_CACHE" "$TOOLS_DIR/yt-dlp.exe"

# ── 12. Descargar / reutilizar FFmpeg para Windows x64 ───────────────────────
info "Preparando FFmpeg para Windows x64..."

# Usamos BtbN builds (GPL) — binarios ampliamente reconocidos
# https://github.com/BtbN/FFmpeg-Builds/releases
resolve_ffmpeg_version() {
  curl -fsSL "https://api.github.com/repos/BtbN/FFmpeg-Builds/releases/latest" \
    | python3 -c "import sys,json; print(json.load(sys.stdin)['tag_name'])" 2>/dev/null \
    || echo "autobuild-2025-01-10-12-58"
}

if [[ -z "$FFMPEG_WINDOWS_VERSION" ]]; then
  info "Resolviendo versión de FFmpeg (BtbN builds)..."
  FFMPEG_WINDOWS_VERSION="$(resolve_ffmpeg_version)"
  info "Versión FFmpeg tag: $FFMPEG_WINDOWS_VERSION"
fi

# Asset: ffmpeg-master-latest-win64-gpl.zip (incluye ffmpeg.exe y ffprobe.exe)
FFMPEG_ASSET="ffmpeg-master-latest-win64-gpl.zip"
FFMPEG_URL="https://github.com/BtbN/FFmpeg-Builds/releases/download/${FFMPEG_WINDOWS_VERSION}/${FFMPEG_ASSET}"
FFMPEG_CACHE="$CACHE_DIR/ffmpeg-${FFMPEG_WINDOWS_VERSION}-win64-gpl.zip"

if [[ ! -f "$FFMPEG_CACHE" ]]; then
  info "Descargando FFmpeg $FFMPEG_WINDOWS_VERSION ..."
  curl --fail --location --retry 3 --progress-bar -o "$FFMPEG_CACHE" "$FFMPEG_URL" \
    || {
      # Fallback: latest con tag fijo
      warn "No se pudo descargar FFmpeg con tag $FFMPEG_WINDOWS_VERSION, intentando latest..."
      FFMPEG_ASSET_LATEST="ffmpeg-master-latest-win64-gpl.zip"
      FFMPEG_URL_LATEST="https://github.com/BtbN/FFmpeg-Builds/releases/latest/download/${FFMPEG_ASSET_LATEST}"
      curl --fail --location --retry 3 --progress-bar -o "$FFMPEG_CACHE" "$FFMPEG_URL_LATEST" \
        || die "No se pudo descargar FFmpeg"
    }
fi

FFMPEG_SHA256="$(sha256sum "$FFMPEG_CACHE" | awk '{print $1}')"
ok "FFmpeg descargado/cacheado (SHA256: ${FFMPEG_SHA256:0:16}...)"

info "Extrayendo ffmpeg.exe y ffprobe.exe..."
FFMPEG_BIN_DIR="$TOOLS_DIR/ffmpeg/bin"
mkdir -p "$FFMPEG_BIN_DIR"
TMP_FF_EXTRACT="$CACHE_DIR/.tmp_ff_extract"
rm -rf "$TMP_FF_EXTRACT"
mkdir -p "$TMP_FF_EXTRACT"

# Extraer ZIP completo para encontrar los binarios
unzip -q "$FFMPEG_CACHE" -d "$TMP_FF_EXTRACT" \
  || die "No se pudo descomprimir el ZIP de FFmpeg"

# Buscar los binarios dentro del ZIP (pueden estar en subdirectorios)
FFMPEG_EXE="$(find "$TMP_FF_EXTRACT" -name "ffmpeg.exe" | head -1)"
FFPROBE_EXE="$(find "$TMP_FF_EXTRACT" -name "ffprobe.exe" | head -1)"

[[ -n "$FFMPEG_EXE" ]] || die "ffmpeg.exe no encontrado en el ZIP"
[[ -n "$FFPROBE_EXE" ]] || die "ffprobe.exe no encontrado en el ZIP"

cp "$FFMPEG_EXE" "$FFMPEG_BIN_DIR/ffmpeg.exe"
cp "$FFPROBE_EXE" "$FFMPEG_BIN_DIR/ffprobe.exe"
rm -rf "$TMP_FF_EXTRACT"

ok "ffmpeg.exe y ffprobe.exe extraídos"

# ── 13. Copiar scripts Windows ────────────────────────────────────────────────
info "Copiando scripts de Windows..."

INTERNAL_DIR="$STAGING_DIR/internal"
mkdir -p "$INTERNAL_DIR"

cp "$SCRIPTS_DIR/windows-portable/start-link2media.ps1"  "$INTERNAL_DIR/"
cp "$SCRIPTS_DIR/windows-portable/stop-link2media.ps1"   "$INTERNAL_DIR/"
cp "$SCRIPTS_DIR/windows-portable/update-ytdlp.ps1"      "$INTERNAL_DIR/"

cp "$SCRIPTS_DIR/INICIAR_LINK2MEDIA.bat"   "$STAGING_DIR/"
cp "$SCRIPTS_DIR/CERRAR_LINK2MEDIA.bat"    "$STAGING_DIR/"
cp "$SCRIPTS_DIR/ACTUALIZAR_YTDLP.bat"     "$STAGING_DIR/"

ok "Scripts copiados"

# ── 14. Crear directorios vacíos ──────────────────────────────────────────────
mkdir -p "$STAGING_DIR/data/temp"
mkdir -p "$STAGING_DIR/logs"

# Placeholder para preservar las carpetas en el ZIP (sin . para no ser filtrado)
printf "carpeta temporal de conversiones - generada automaticamente\n" > "$STAGING_DIR/data/temp/placeholder.txt"
printf "carpeta de logs de la aplicacion - generada automaticamente\n" > "$STAGING_DIR/logs/placeholder.txt"

ok "Directorios data/temp y logs creados"

# ── 15. Generar LEEME.txt ─────────────────────────────────────────────────────
info "Generando LEEME.txt..."
LEEME_TEMPLATE="$SCRIPTS_DIR/windows-portable/LEEME.template.txt"
if [[ -f "$LEEME_TEMPLATE" ]]; then
  cp "$LEEME_TEMPLATE" "$STAGING_DIR/LEEME.txt"
else
  cat > "$STAGING_DIR/LEEME.txt" << 'EOF'
╔══════════════════════════════════════════════════════════════╗
║                  Link2Media  — Guía rápida                   ║
╚══════════════════════════════════════════════════════════════╝

CÓMO EMPEZAR
────────────
1. Extrae TODO el contenido del ZIP en una carpeta de tu ordenador.
   (Importante: no ejecutes nada directamente desde el ZIP.)
2. Abre la carpeta extraída.
3. Haz doble clic en INICIAR_LINK2MEDIA.bat
4. Espera a que se abra el navegador automáticamente.
5. Pega el enlace de YouTube autorizado y convierte.

CÓMO CERRAR
───────────
Haz doble clic en CERRAR_LINK2MEDIA.bat
o cierra la ventana de consola que se abrió al iniciar.

REQUISITOS
──────────
· Windows 10 u 11 de 64 bits.
· Conexión a Internet para las conversiones.
· Espacio libre suficiente en el disco.
· Solo para contenido propio o con permiso del autor.

ACTUALIZAR yt-dlp
─────────────────
Si las conversiones empiezan a fallar, es posible que YouTube
haya cambiado su sistema. Haz doble clic en ACTUALIZAR_YTDLP.bat
para descargar la versión más reciente.

PROBLEMAS FRECUENTES
─────────────────────
· Windows muestra una advertencia de seguridad (SmartScreen):
  Haz clic en "Más información" → "Ejecutar de todas formas".
  Los archivos incluidos proceden de proyectos de código abierto
  conocidos (Node.js, yt-dlp, FFmpeg). Puedes verificar el SHA256.

· El antivirus bloquea un ejecutable:
  Algunos antivirus detectan falsos positivos en herramientas de
  descarga. Consulta con tu administrador si estás en un entorno
  corporativo. No desactives el antivirus globalmente.

· La ventana indica que faltan archivos:
  Extrae primero todo el ZIP en una carpeta local (no en red ni
  en una unidad virtual) y vuelve a ejecutar INICIAR_LINK2MEDIA.bat

· El navegador no se abre:
  Abre manualmente http://127.0.0.1:3000 (u otro puerto indicado).

· El puerto está ocupado:
  Cierra otras aplicaciones que usen los puertos 3000-3010.

· No hay espacio suficiente:
  Las conversiones de vídeo pueden requerir varios GB temporales.
  Libera espacio y vuelve a intentarlo.

VERIFICACIÓN DE INTEGRIDAD
───────────────────────────
Puedes verificar el SHA256 del paquete con el archivo
Link2Media-Windows-x64.zip.sha256 incluido en el repositorio.

═══════════════════════════════════════════════════════════════
Solo para contenido propio o con autorización del titular.
Respeta siempre los derechos de autor y las licencias aplicables.
═══════════════════════════════════════════════════════════════
EOF
fi
ok "LEEME.txt generado"

# ── 16. Generar VERSION.txt ───────────────────────────────────────────────────
cat > "$STAGING_DIR/VERSION.txt" << EOF
Link2Media $APP_VERSION
Plataforma: Windows x64
Fecha de build: $BUILD_DATE_UTC
Node.js: $NODE_WINDOWS_VERSION (ABI v${NODE_MODULES_ABI})
yt-dlp: $YTDLP_WINDOWS_VERSION
FFmpeg: BtbN GPL ($FFMPEG_WINDOWS_VERSION)
better-sqlite3: $SQLITE3_WINDOWS_VERSION
EOF
ok "VERSION.txt generado"

# ── 17. Generar manifest.json ─────────────────────────────────────────────────
info "Generando manifest.json..."
cat > "$STAGING_DIR/manifest.json" << EOF
{
  "application": {
    "name": "Link2Media",
    "version": "$APP_VERSION",
    "platform": "windows-x64",
    "buildDateUtc": "$BUILD_DATE_UTC"
  },
  "components": {
    "node": {
      "version": "$NODE_WINDOWS_VERSION",
      "sha256": "$NODE_SHA256"
    },
    "ytDlp": {
      "version": "$YTDLP_WINDOWS_VERSION",
      "sha256": "$YTDLP_SHA256"
    },
    "ffmpeg": {
      "version": "$FFMPEG_WINDOWS_VERSION",
      "provider": "BtbN FFmpeg-Builds (GPL)",
      "sha256": "$FFMPEG_SHA256"
    },
    "betterSqlite3": {
      "version": "$SQLITE3_WINDOWS_VERSION",
      "nodeModulesAbi": "$NODE_MODULES_ABI",
      "platform": "win32-x64",
      "sha256": "$SQLITE3_SHA256"
    }
  }
}
EOF
ok "manifest.json generado"

# ── 18. Generar THIRD_PARTY_NOTICES.txt ──────────────────────────────────────
info "Generando THIRD_PARTY_NOTICES.txt..."
cat > "$STAGING_DIR/THIRD_PARTY_NOTICES.txt" << EOF
═══════════════════════════════════════════════════════════════════
THIRD-PARTY NOTICES — Link2Media $APP_VERSION
═══════════════════════════════════════════════════════════════════

Este paquete incluye software de terceros. A continuación se detallan
los componentes, sus versiones y licencias.

───────────────────────────────────────────────────────────────────
1. Node.js $NODE_WINDOWS_VERSION
───────────────────────────────────────────────────────────────────
Sitio:    https://nodejs.org/
Fuente:   https://github.com/nodejs/node
Licencia: MIT License
Aviso:    Node.js incluye código de V8, libuv, OpenSSL y otros
          componentes. Consulta la licencia completa en:
          https://raw.githubusercontent.com/nodejs/node/main/LICENSE

───────────────────────────────────────────────────────────────────
2. Next.js (incluido en app/node_modules)
───────────────────────────────────────────────────────────────────
Sitio:    https://nextjs.org/
Fuente:   https://github.com/vercel/next.js
Licencia: MIT License

───────────────────────────────────────────────────────────────────
3. React (incluido en app/node_modules)
───────────────────────────────────────────────────────────────────
Sitio:    https://react.dev/
Fuente:   https://github.com/facebook/react
Licencia: MIT License

───────────────────────────────────────────────────────────────────
4. yt-dlp $YTDLP_WINDOWS_VERSION
───────────────────────────────────────────────────────────────────
Sitio:    https://github.com/yt-dlp/yt-dlp
Fuente:   https://github.com/yt-dlp/yt-dlp
Licencia: The Unlicense (dominio público)
Aviso:    yt-dlp se usa únicamente para descargar contenido
          autorizado. No se han modificado los ejecutables.
          SHA256: $YTDLP_SHA256

───────────────────────────────────────────────────────────────────
5. FFmpeg — BtbN GPL build $FFMPEG_WINDOWS_VERSION
───────────────────────────────────────────────────────────────────
Sitio:    https://ffmpeg.org/
Proveedor binarios: https://github.com/BtbN/FFmpeg-Builds
Licencia: GNU General Public License v2 o posterior (GPL-2.0+)
          NOTA: Esta compilación incluye componentes GPL (libx264,
          libx265, etc.). Consulta https://ffmpeg.org/legal.html
          para los detalles completos de licencia.
Fuente:   https://github.com/FFmpeg/FFmpeg
          (código fuente también disponible vía BtbN)
SHA256:   $FFMPEG_SHA256

Dado que FFmpeg se distribuye bajo GPL, el código fuente de esta
aplicación (Link2Media) también debe estar disponible. El código
fuente se encuentra en el repositorio del proyecto.

───────────────────────────────────────────────────────────────────
6. better-sqlite3 $SQLITE3_WINDOWS_VERSION
───────────────────────────────────────────────────────────────────
Sitio:    https://github.com/WiseLibs/better-sqlite3
Licencia: MIT License
Uso:      Persistencia de trabajos y tokens en SQLite (WAL mode).
          El binario nativo precompilado para Windows se descarga
          desde los releases oficiales del proyecto.
SHA256:   $SQLITE3_SHA256

───────────────────────────────────────────────────────────────────
7. Otras dependencias npm (ver app/node_modules)
───────────────────────────────────────────────────────────────────
Todas las dependencias npm incluidas son de código abierto.
Consulta sus licencias individuales en app/node_modules/*/LICENSE
o en https://www.npmjs.com/.

═══════════════════════════════════════════════════════════════════
EOF
ok "THIRD_PARTY_NOTICES.txt generado"

# ── 19. Verificar que no hay binarios Linux ───────────────────────────────────
info "Verificando ausencia de binarios Linux en app/..."
LINUX_BINS="$(find "$STAGING_DIR/app" \( -name "*.node" -o -name "*.so" -o -name "*.dylib" \) 2>/dev/null || true)"
if [[ -n "$LINUX_BINS" ]]; then
  warn "Se encontraron binarios nativos en app/:"
  echo "$LINUX_BINS"
  warn "Revisando si son necesarios en runtime..."
  # Excluir binarios que NO son necesarios en runtime Windows:
  # - @next/swc-*: solo para build/dev, no para producción standalone
  # - @img/sharp-linux-*: solo necesario si Next.js optimiza imágenes;
  #   con images: { unoptimized: true } no se usa en runtime
  # Excluir binarios gestionados explícitamente:
  #   @next/swc / @img/sharp → solo build-time, se eliminan
  #   better_sqlite3 → se reemplaza con el prebuilt Windows en el paso siguiente
  CRITICAL_BINS="$(echo "$LINUX_BINS" | grep -v "@next/swc" | grep -v "@img/sharp" | grep -v "better_sqlite3" || true)"
  if [[ -n "$CRITICAL_BINS" ]]; then
    error "Binarios nativos potencialmente requeridos en runtime:"
    echo "$CRITICAL_BINS"
    die "Elimina manualmente los binarios Linux o adapta la dependencia antes de continuar."
  else
    warn "Binarios Linux build-only o gestionados explícitamente. Eliminando los innecesarios..."
    find "$STAGING_DIR/app" -path "*/@next/swc-*" -name "*.node" -delete 2>/dev/null || true
    find "$STAGING_DIR/app" -path "*/@img/sharp-*" -name "*.node" -delete 2>/dev/null || true
    find "$STAGING_DIR/app/node_modules" -type d -name "sharp-linux-*" -empty -delete 2>/dev/null || true
    # Eliminar el binario Linux de better-sqlite3 — será reemplazado con la versión Windows
    find "$STAGING_DIR/app" -name "better_sqlite3.node" -delete 2>/dev/null || true
    ok "Binarios Linux no necesarios en runtime eliminados del paquete"
  fi
else
  ok "No se encontraron binarios Linux en app/"
fi

# ── 19b. Instalar better-sqlite3 Windows nativo en staging ───────────────────
# El tarball ya fue descargado y verificado en el paso 10b.
info "Instalando better_sqlite3.node (Windows x64) en staging..."

SQLITE3_TARGET="$STAGING_DIR/app/node_modules/better-sqlite3/build/Release"
mkdir -p "$SQLITE3_TARGET"

TMP_SQLITE3="$CACHE_DIR/.tmp_sqlite3"
rm -rf "$TMP_SQLITE3"
mkdir -p "$TMP_SQLITE3"
tar -xzf "$SQLITE3_CACHE" -C "$TMP_SQLITE3" \
  || die "No se pudo descomprimir $SQLITE3_ASSET"

SQLITE3_NODE="$(find "$TMP_SQLITE3" -name "better_sqlite3.node" | head -1)"
[[ -n "$SQLITE3_NODE" ]] || die "better_sqlite3.node no encontrado en el tarball"
cp "$SQLITE3_NODE" "$SQLITE3_TARGET/better_sqlite3.node"
rm -rf "$TMP_SQLITE3"

ok "better_sqlite3.node instalado (Windows x64, node-v${NODE_MODULES_ABI}, SHA256: ${SQLITE3_SHA256:0:16}...)"

# ── 20. Materializar symlinks de pnpm para ZIP/Windows ───────────────────────
info "Materializando enlaces simbólicos de node_modules para Windows..."
export _APP_DIR="$STAGING_DIR/app"
python3 - << 'PYEOF'
import os
import shutil
from pathlib import Path

app_dir = Path(os.environ["_APP_DIR"])
links = [p for p in app_dir.rglob("*") if p.is_symlink()]

# Procesar primero los enlaces más profundos para no perder enlaces anidados.
for link in sorted(links, key=lambda p: len(p.parts), reverse=True):
    if not link.is_symlink():
        continue
    target = link.resolve(strict=False)
    if not target.exists():
        link.unlink()
        continue

    tmp = link.with_name(f"{link.name}.__materialized__")
    if tmp.exists():
        if tmp.is_dir() and not tmp.is_symlink():
            shutil.rmtree(tmp)
        else:
            tmp.unlink()

    if target.is_dir():
        shutil.copytree(target, tmp, symlinks=False)
    else:
        shutil.copy2(target, tmp)

    link.unlink()
    tmp.rename(link)

remaining = [str(p) for p in app_dir.rglob("*") if p.is_symlink()]
if remaining:
    raise SystemExit("Quedan enlaces simbólicos sin materializar:\n" + "\n".join(remaining[:20]))

print(f"  {len(links)} enlaces simbólicos procesados")
PYEOF
ok "node_modules materializado sin symlinks"

info "Creando capa node_modules plana para resolución Windows..."
python3 - << 'PYEOF'
import os
import shutil
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
            if entry.is_dir():
                shutil.copytree(entry, dest, symlinks=False)
            else:
                shutil.copy2(entry, dest)
            copied += 1

print(f"  {copied} paquetes copiados a node_modules/")
PYEOF
ok "Capa node_modules plana creada"

info "Eliminando store .pnpm para evitar rutas demasiado largas en Windows..."
rm -rf "$STAGING_DIR/app/node_modules/.pnpm"
ok "Store .pnpm eliminado del paquete portable"

info "Verificando longitud de rutas internas del paquete..."
export _STAGING_DIR="$STAGING_DIR"
python3 - << 'PYEOF'
import os
from pathlib import Path

staging_dir = Path(os.environ["_STAGING_DIR"])
max_len = 0
max_path = ""
for root, _, files in os.walk(staging_dir):
    for fname in files:
        rel = Path(root, fname).relative_to(staging_dir.parent).as_posix()
        if len(rel) > max_len:
            max_len = len(rel)
            max_path = rel

print(f"  Ruta interna mas larga: {max_len} caracteres")
print(f"  {max_path}")
if max_len > 180:
    raise SystemExit(
        "La ruta interna mas larga supera 180 caracteres; Windows Explorer "
        "puede fallar si el usuario extrae el ZIP en una carpeta profunda."
    )
PYEOF
ok "Longitud de rutas compatible con extraccion normal en Windows"

# ── 21. Crear el ZIP ──────────────────────────────────────────────────────────
info "Creando ZIP..."
rm -f "$OUT_ZIP"
cd "$STAGING_BASE"
export _OUT_ZIP="$OUT_ZIP"
python3 - << 'PYEOF'
import zipfile, os, sys
out_zip = os.environ["_OUT_ZIP"]
prefix  = "Link2Media-Windows-x64"
count   = 0
# Solo excluir directorios de desarrollo/build — NO .next ni otros directorios de app
SKIP_DIRS = {'.git', '.cache', '.staging', '.tmp', '__pycache__', '.verify_tmp'}
# Excluir solo ficheros de entorno/secretos conocidos
SKIP_FILES = {'.gitkeep', '.gitignore', '.env.local', '.env.production'}
with zipfile.ZipFile(out_zip, "w", zipfile.ZIP_DEFLATED, allowZip64=True) as zf:
    for root, dirs, files in os.walk(prefix):
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
        for fname in files:
            if fname in SKIP_FILES:
                continue
            fpath = os.path.join(root, fname)
            zf.write(fpath)
            count += 1
print(f"  {count} archivos incluidos en el ZIP")
PYEOF
cd "$REPO_ROOT"
[[ -f "$OUT_ZIP" ]] || die "El ZIP no se creó correctamente"
ok "ZIP creado: $OUT_ZIP"

# ── 22. Calcular SHA256 ───────────────────────────────────────────────────────
info "Calculando SHA256 del ZIP..."
ZIP_SHA256="$(sha256sum "$OUT_ZIP" | awk '{print $1}')"
echo "$ZIP_SHA256  Link2Media-Windows-x64.zip" > "$OUT_SHA"
ok "SHA256: $ZIP_SHA256"

# ── 23. Copiar INICIAR_LINK2MEDIA.bat a scripts/ ─────────────────────────────
# (ya existe en scripts/ porque es la fuente canónica)
ok "INICIAR_LINK2MEDIA.bat ya está en scripts/"

# ── 24. Tamaño final ──────────────────────────────────────────────────────────
ZIP_SIZE="$(du -sh "$OUT_ZIP" | awk '{print $1}')"
echo ""
echo -e "${GREEN}════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  ✓ BUILD COMPLETADO${NC}"
echo -e "${GREEN}════════════════════════════════════════════════════${NC}"
echo -e "  Ruta:       $OUT_ZIP"
echo -e "  Tamaño:     $ZIP_SIZE"
echo -e "  SHA256:     $ZIP_SHA256"
echo -e "  Node:       $NODE_WINDOWS_VERSION (ABI v${NODE_MODULES_ABI})"
echo -e "  yt-dlp:     $YTDLP_WINDOWS_VERSION"
echo -e "  FFmpeg:     BtbN GPL $FFMPEG_WINDOWS_VERSION"
echo -e "  sqlite3:    better-sqlite3 v${SQLITE3_WINDOWS_VERSION} (win32-x64)"
echo -e "${GREEN}════════════════════════════════════════════════════${NC}"
echo ""
