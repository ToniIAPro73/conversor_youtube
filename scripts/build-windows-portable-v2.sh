#!/usr/bin/env bash
# =============================================================================
# build-windows-portable-v2.sh
# Construye la distribución portable de Link2Media para Windows x64.
# Versión actualizada: usa git rev-parse, sin operaciones destructivas de git,
# todas las gates de calidad, log en build-reports/, manifest.json con versiones.
# Uso: bash scripts/build-windows-portable-v2.sh
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
REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || die 'No es un repositorio git')"
SCRIPTS_DIR="$REPO_ROOT/scripts"
CACHE_DIR="$SCRIPTS_DIR/.cache/windows-portable"
STAGING_BASE="$SCRIPTS_DIR/.staging"
STAGING_DIR="$STAGING_BASE/Link2Media-Windows-x64"
OUT_ZIP="$SCRIPTS_DIR/Link2Media-Windows-x64.zip"
OUT_SHA="$SCRIPTS_DIR/Link2Media-Windows-x64.zip.sha256"
BUILD_REPORTS_DIR="$SCRIPTS_DIR/build-reports"

# ── Versiones (desde tool-versions.json) ─────────────────────────────────────
TOOL_VERSIONS_FILE="$SCRIPTS_DIR/tool-versions.json"
if [[ ! -f "$TOOL_VERSIONS_FILE" ]]; then
  die "No se encuentra $TOOL_VERSIONS_FILE"
fi

APP_VERSION="$(node -e "const p=require('$REPO_ROOT/package.json');console.log(p.version)" 2>/dev/null || echo '0.1.0')"
BUILD_DATE_UTC="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
BUILD_LOG="$BUILD_REPORTS_DIR/${TIMESTAMP}-portable-build.log"

# ── Iniciar log ─────────────────────────────────────────────────────────────
mkdir -p "$BUILD_REPORTS_DIR"
exec > >(tee -a "$BUILD_LOG") 2>&1

echo ""
echo -e "${CYAN}═══════════════════════════════════════════════════${NC}"
echo -e "${CYAN}  Link2Media Portable Build v2                      ${NC}"
echo -e "${CYAN}  $BUILD_DATE_UTC                                   ${NC}"
echo -e "${CYAN}═══════════════════════════════════════════════════${NC}"
echo ""

# ── 1. Verificar directorio de ejecución ─────────────────────────────────────
info "Verificando directorio de trabajo..."
[[ -f "$REPO_ROOT/package.json" ]] || die "Ejecuta desde la raíz del repositorio: bash scripts/build-windows-portable-v2.sh"
cd "$REPO_ROOT"
ok "Directorio: $REPO_ROOT"

# ── 2. Verificar herramientas ────────────────────────────────────────────────
info "Verificando herramientas requeridas..."
for tool in node pnpm; do
  command -v "$tool" >/dev/null 2>&1 || die "Herramienta no encontrada: $tool"
done
ok "Herramientas básicas disponibles"

# ── 3. Gate: Lint ────────────────────────────────────────────────────────────
info "Ejecutando lint..."
if pnpm lint; then
  ok "Lint OK"
else
  die "Lint falló — corrige los errores antes de construir"
fi

# ── 4. Gate: Typecheck ──────────────────────────────────────────────────────
info "Ejecutando typecheck..."
if pnpm typecheck; then
  ok "Typecheck OK"
else
  die "Typecheck falló — corrige los errores de tipos antes de construir"
fi

# ── 5. Gate: Tests ──────────────────────────────────────────────────────────
info "Ejecutando tests..."
if pnpm test; then
  ok "Tests OK"
else
  die "Tests fallaron — corrige los tests antes de construir"
fi

# ── 6. Gate: Build Next.js standalone ───────────────────────────────────────
info "Ejecutando pnpm build (modo standalone)..."
NEXT_TELEMETRY_DISABLED=1 pnpm build || die "Build falló"
ok "Build Next.js standalone completado"

# ── 7. Limpiar staging anterior ──────────────────────────────────────────────
info "Limpiando staging anterior..."
rm -rf "$STAGING_DIR"
mkdir -p "$STAGING_DIR"
mkdir -p "$CACHE_DIR"
ok "Staging limpio: $STAGING_DIR"

# ── 8. Crear estructura de directorios ───────────────────────────────────────
info "Creando estructura de directorios..."

mkdir -p "$STAGING_DIR"/{licenses,runtime,app,data,temp,logs,internal}
mkdir -p "$STAGING_DIR"/tools/{yt-dlp,ffmpeg,qpdf,sevenzip,pandoc,libreoffice,calibre,tesseract,tessdata,poppler}
mkdir -p "$STAGING_DIR"/app/public

ok "Estructura de directorios creada"

# ── 9. Copiar aplicación Next.js standalone ──────────────────────────────────
info "Copiando aplicación Next.js standalone..."

STANDALONE_DIR="$REPO_ROOT/.next/standalone"
if [[ ! -d "$STANDALONE_DIR" ]]; then
  die "Directorio standalone no encontrado: $STANDALONE_DIR. Verifica que next.config.ts tiene output:'standalone'"
fi

# Copiar standalone server y node_modules
cp -r "$STANDALONE_DIR/." "$STAGING_DIR/app/"

# Copiar .next/static (se genera fuera del standalone)
if [[ -d "$REPO_ROOT/.next/static" ]]; then
  mkdir -p "$STAGING_DIR/app/.next/static"
  cp -r "$REPO_ROOT/.next/static/." "$STAGING_DIR/app/.next/static/"
fi

# Copiar public/
if [[ -d "$REPO_ROOT/public" ]]; then
  cp -r "$REPO_ROOT/public/." "$STAGING_DIR/app/public/"
fi

# Asegurar que app/package.json existe
if [[ ! -f "$STAGING_DIR/app/package.json" ]]; then
  echo '{"name":"link2media","version":"'"$APP_VERSION"'","private":true}' > "$STAGING_DIR/app/package.json"
fi

# Renombrar server.js si Next.js lo generó como .next/standalone/server.js
if [[ -f "$STAGING_DIR/app/server.js" ]]; then
  ok "server.js encontrado"
elif [[ -f "$STAGING_DIR/app/.next/server/server.js" ]]; then
  cp "$STAGING_DIR/app/.next/server/server.js" "$STAGING_DIR/app/server.js"
  ok "server.js copiado desde .next/server/"
else
  warn "No se encontró server.js — la aplicación puede necesitar ajustes"
fi

ok "Aplicación copiada"

# ── 10. Crear launcher scripts BAT ──────────────────────────────────────────
info "Creando launcher scripts BAT..."

# INICIAR_LINK2MEDIA.bat
cat > "$STAGING_DIR/INICIAR_LINK2MEDIA.bat" << 'BATEOF'
@echo off
chcp 65001 >nul 2>&1
setlocal EnableDelayedExpansion

:: ============================================================================
:: INICIAR_LINK2MEDIA.bat
:: Lanzador principal de Link2Media para Windows.
:: Haz doble clic para iniciar la aplicacion.
:: ============================================================================

title Link2Media - Iniciando...

:: - Cambiar al directorio donde esta el .bat -----------------
cd /d "%~dp0"
set "BASE_DIR=%~dp0"
if "%BASE_DIR:~-1%"=="\" set "BASE_DIR=%BASE_DIR:~0,-1%"

echo.
echo  ======================================
echo            Link2Media
echo  ======================================
echo.

:: - Verificar archivos criticos ---------------------------
if not exist "%BASE_DIR%\runtime\node.exe" (
    echo  [ERROR] No se encuentra runtime\node.exe
    echo.
    echo  Extrae primero todo el contenido del ZIP en una carpeta
    echo  local y vuelve a ejecutar INICIAR_LINK2MEDIA.bat
    echo.
    pause
    exit /b 1
)

if not exist "%BASE_DIR%\app\server.js" (
    echo  [ERROR] No se encuentra app\server.js
    echo.
    echo  El paquete puede estar incompleto. Vuelve a descargar y extraer el ZIP.
    echo.
    pause
    exit /b 1
)

:: - Delegar en PowerShell para la logica compleja --------------
set "PS_SCRIPT=%BASE_DIR%\internal\start-link2media.ps1"

if not exist "%PS_SCRIPT%" (
    echo  [ERROR] No se encuentra el script interno: internal\start-link2media.ps1
    echo.
    echo  El paquete puede estar incompleto. Vuelve a descargar y extraer el ZIP.
    echo.
    pause
    exit /b 1
)

powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass ^
    -File "%PS_SCRIPT%" -BaseDir "%BASE_DIR%"

if errorlevel 1 (
    echo.
    echo  La aplicacion no pudo iniciarse.
    echo  Consulta logs\error.log para mas detalles.
    echo  Ejecuta DIAGNOSTICO_LINK2MEDIA.bat para diagnostico completo.
    echo.
    pause
    exit /b 1
)

endlocal
BATEOF

# CERRAR_LINK2MEDIA.bat
cat > "$STAGING_DIR/CERRAR_LINK2MEDIA.bat" << 'BATEOF'
@echo off
chcp 65001 >nul 2>&1
setlocal EnableDelayedExpansion

:: ============================================================================
:: CERRAR_LINK2MEDIA.bat
:: Cierra la aplicacion Link2Media de forma segura.
:: ============================================================================

title Link2Media - Cerrando...

cd /d "%~dp0"
set "BASE_DIR=%~dp0"
if "%BASE_DIR:~-1%"=="\" set "BASE_DIR=%BASE_DIR:~0,-1%"

set "PS_SCRIPT=%BASE_DIR%\internal\stop-link2media.ps1"

if not exist "%PS_SCRIPT%" (
    echo  [ERROR] No se encuentra el script interno: internal\stop-link2media.ps1
    pause
    exit /b 1
)

powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass ^
    -File "%PS_SCRIPT%" -BaseDir "%BASE_DIR%"

timeout /t 2 >nul
endlocal
BATEOF

# ACTUALIZAR_YTDLP.bat
cat > "$STAGING_DIR/ACTUALIZAR_YTDLP.bat" << 'BATEOF'
@echo off
chcp 65001 >nul 2>&1
setlocal EnableDelayedExpansion

:: ============================================================================
:: ACTUALIZAR_YTDLP.bat
:: Descarga e instala la ultima version estable de yt-dlp.
:: Ejecuta cuando las conversiones empiecen a fallar.
:: ============================================================================

title Link2Media - Actualizando yt-dlp...

cd /d "%~dp0"
set "BASE_DIR=%~dp0"
if "%BASE_DIR:~-1%"=="\" set "BASE_DIR=%BASE_DIR:~0,-1%"

set "PS_SCRIPT=%BASE_DIR%\internal\update-ytdlp.ps1"

if not exist "%PS_SCRIPT%" (
    echo  [ERROR] No se encuentra el script interno: internal\update-ytdlp.ps1
    pause
    exit /b 1
)

powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass ^
    -File "%PS_SCRIPT%" -BaseDir "%BASE_DIR%"

if errorlevel 1 (
    echo.
    echo  La actualizacion fallo. Revisa la conexion a Internet e intenta de nuevo.
    pause
    exit /b 1
)

echo  Actualizacion completada. Puedes cerrar esta ventana.
timeout /t 3 >nul
endlocal
BATEOF

# DIAGNOSTICO_LINK2MEDIA.bat
cat > "$STAGING_DIR/DIAGNOSTICO_LINK2MEDIA.bat" << 'BATEOF'
@echo off
chcp 65001 >nul 2>&1
setlocal EnableDelayedExpansion

:: ============================================================================
:: DIAGNOSTICO_LINK2MEDIA.bat
:: Ejecuta un diagnostico completo de la instalacion de Link2Media.
:: ============================================================================

title Link2Media - Diagnostico...

cd /d "%~dp0"
set "BASE_DIR=%~dp0"
if "%BASE_DIR:~-1%"=="\" set "BASE_DIR=%BASE_DIR:~0,-1%"

set "PS_SCRIPT=%BASE_DIR%\internal\diagnose-link2media.ps1"

if not exist "%PS_SCRIPT%" (
    echo  [ERROR] No se encuentra el script interno: internal\diagnose-link2media.ps1
    echo  El paquete puede estar incompleto.
    pause
    exit /b 1
)

powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass ^
    -File "%PS_SCRIPT%" -BaseDir "%BASE_DIR%"

pause
endlocal
BATEOF

ok "Launcher scripts BAT creados"

# ── 11. Crear scripts internos PowerShell ────────────────────────────────────
info "Creando scripts internos PowerShell..."

# start-link2media.ps1
cat > "$STAGING_DIR/internal/start-link2media.ps1" << 'PSEOF'
# =============================================================================
# start-link2media.ps1 - Lanzador interno de Link2Media (Windows)
# Invocado por INICIAR_LINK2MEDIA.bat
# NO ejecutar directamente; usar INICIAR_LINK2MEDIA.bat
# =============================================================================
[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)]
    [string]$BaseDir
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# - Rutas absolutas derivadas de BaseDir ------------------
$NodeExe      = Join-Path $BaseDir 'runtime\node.exe'
$ServerJs     = Join-Path $BaseDir 'app\server.js'
$YtdlpExe     = Join-Path $BaseDir 'tools\yt-dlp\yt-dlp.exe'
$FfmpegExe    = Join-Path $BaseDir 'tools\ffmpeg\bin\ffmpeg.exe'
$FfprobeExe   = Join-Path $BaseDir 'tools\ffmpeg\bin\ffprobe.exe'
$QpdfExe      = Join-Path $BaseDir 'tools\qpdf\bin\qpdf.exe'
$SevenZipExe  = Join-Path $BaseDir 'tools\sevenzip\7z.exe'
$PandocExe    = Join-Path $BaseDir 'tools\pandoc\pandoc.exe'
$LibreOfficeExe = Join-Path $BaseDir 'tools\libreoffice\program\soffice.exe'
$CalibreExe   = Join-Path $BaseDir 'tools\calibre\ebook-convert.exe'
$TesseractExe = Join-Path $BaseDir 'tools\tesseract\tesseract.exe'
$TessdataDir  = Join-Path $BaseDir 'tools\tessdata'
$PopplerDir   = Join-Path $BaseDir 'tools\poppler'
$DataDir      = Join-Path $BaseDir 'data'
$TempDir      = Join-Path $BaseDir 'temp'
$LogDir       = Join-Path $BaseDir 'logs'
$PidFile      = Join-Path $BaseDir 'data\link2media.pid'
$PortFile     = Join-Path $BaseDir 'data\link2media.port'
$ServerLog    = Join-Path $LogDir  'server.log'
$ErrorLog     = Join-Path $LogDir  'error.log'

# - Funcion: log de consola -------------------------
function Write-Step([string]$msg) {
    Write-Host "  $msg" -ForegroundColor Cyan
}
function Write-Ok([string]$msg) {
    Write-Host "  [OK] $msg" -ForegroundColor Green
}
function Write-Err([string]$msg) {
    Write-Host ""
    Write-Host "  [ERROR] $msg" -ForegroundColor Red
}
function Write-Warn([string]$msg) {
    Write-Host "  [WARN] $msg" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "  Link2Media - Iniciando..." -ForegroundColor White
Write-Host ""

# - Verificar archivos obligatorios ---------------------
Write-Step "Verificando archivos criticos..."
$criticalFiles = @($NodeExe, $ServerJs)
$criticalMissing = @()
foreach ($f in $criticalFiles) {
    if (-not (Test-Path $f)) {
        $criticalMissing += $f
    }
}
if ($criticalMissing.Count -gt 0) {
    Write-Err "Archivos criticos no encontrados:"
    foreach ($f in $criticalMissing) { Write-Host "    $f" -ForegroundColor Red }
    Read-Host "  Pulsa Enter para cerrar"
    exit 1
}
Write-Ok "Archivos criticos verificados"

# - Verificar herramientas opcionales --------------------
Write-Step "Verificando herramientas de conversion..."
$optionalTools = @(
    @{ Name = 'yt-dlp'; Path = $YtdlpExe },
    @{ Name = 'FFmpeg'; Path = $FfmpegExe },
    @{ Name = 'FFprobe'; Path = $FfprobeExe },
    @{ Name = 'QPDF'; Path = $QpdfExe },
    @{ Name = '7-Zip'; Path = $SevenZipExe },
    @{ Name = 'Pandoc'; Path = $PandocExe },
    @{ Name = 'LibreOffice'; Path = $LibreOfficeExe },
    @{ Name = 'Calibre'; Path = $CalibreExe },
    @{ Name = 'Tesseract'; Path = $TesseractExe }
)
$missingTools = @()
foreach ($tool in $optionalTools) {
    if (Test-Path $tool.Path) {
        Write-Ok "  $($tool.Name) encontrado"
    } else {
        Write-Warn "  $($tool.Name) no encontrado (algunas conversiones no estaran disponibles)"
        $missingTools += $tool.Name
    }
}

# - Crear directorios ----------------------------
if (-not (Test-Path $DataDir))    { New-Item -ItemType Directory -Path $DataDir    -Force | Out-Null }
if (-not (Test-Path $TempDir))    { New-Item -ItemType Directory -Path $TempDir    -Force | Out-Null }
if (-not (Test-Path $LogDir))     { New-Item -ItemType Directory -Path $LogDir     -Force | Out-Null }
if (-not (Test-Path $TessdataDir) ) { New-Item -ItemType Directory -Path $TessdataDir -Force | Out-Null }

# - Limpiar temporales caducados (>2 horas) -----------------
Write-Step "Limpiando archivos temporales caducados..."
try {
    $cutoff = (Get-Date).AddHours(-2)
    Get-ChildItem -Path $TempDir -Recurse -File -ErrorAction SilentlyContinue |
        Where-Object { $_.LastWriteTime -lt $cutoff } |
        Remove-Item -Force -ErrorAction SilentlyContinue
} catch { <# no critico #> }

# - Comprobar instancia existente ----------------------
Write-Step "Comprobando instancias previas..."
if (Test-Path $PidFile) {
    $existingPid = Get-Content $PidFile -Raw -ErrorAction SilentlyContinue
    $existingPid = $existingPid.Trim()
    if ($existingPid -match '^\d+$') {
        $proc = Get-Process -Id ([int]$existingPid) -ErrorAction SilentlyContinue
        if ($proc -ne $null -and $proc.Name -match 'node') {
            $existingPort = ''
            if (Test-Path $PortFile) {
                $existingPort = (Get-Content $PortFile -Raw -ErrorAction SilentlyContinue).Trim()
            }
            $url = if ($existingPort) { "http://127.0.0.1:$existingPort" } else { "http://127.0.0.1:3456" }
            Write-Host ""
            Write-Host "  La aplicacion ya esta en ejecucion (PID $existingPid)." -ForegroundColor Green
            Write-Host "  Abriendo navegador en $url ..." -ForegroundColor Cyan
            Start-Process $url
            exit 0
        } else {
            Remove-Item $PidFile -Force -ErrorAction SilentlyContinue
            Remove-Item $PortFile -Force -ErrorAction SilentlyContinue
        }
    }
}

# - Seleccionar puerto libre -------------------------
Write-Step "Buscando puerto disponible..."
$defaultPort = 3456
$selectedPort = $null
foreach ($p in @($defaultPort,3457,3458,3459,3460,3000,3001,3002,3003,3004)) {
    $tcpClient = New-Object System.Net.Sockets.TcpClient
    try {
        $tcpClient.Connect('127.0.0.1', $p)
        $tcpClient.Close()
    } catch {
        $selectedPort = $p
        break
    } finally {
        if ($tcpClient.Connected) { $tcpClient.Close() }
    }
}

if ($null -eq $selectedPort) {
    Write-Err "No se ha encontrado un puerto libre."
    Write-Host "  Cierra otras aplicaciones y vuelve a intentarlo." -ForegroundColor Yellow
    Read-Host "  Pulsa Enter para cerrar"
    exit 1
}
Write-Ok "Puerto seleccionado: $selectedPort"

# - Variables de entorno para el servidor ------------------
$env:NODE_ENV                      = 'production'
$env:NEXT_TELEMETRY_DISABLED       = '1'
$env:HOSTNAME                      = '127.0.0.1'
$env:PORT                          = "$selectedPort"

# LINK2MEDIA_* environment variables
$env:LINK2MEDIA_FFMPEG_PATH        = $FfmpegExe
$env:LINK2MEDIA_FFPROBE_PATH       = $FfprobeExe
$env:LINK2MEDIA_YTDLP_PATH         = $YtdlpExe
$env:LINK2MEDIA_QPDF_PATH          = $QpdfExe
$env:LINK2MEDIA_7ZIP_PATH          = $SevenZipExe
$env:LINK2MEDIA_PANDOC_PATH        = $PandocExe
$env:LINK2MEDIA_LIBREOFFICE_PATH   = $LibreOfficeExe
$env:LINK2MEDIA_CALIBRE_PATH       = $CalibreExe
$env:LINK2MEDIA_TESSERACT_PATH     = $TesseractExe
$env:LINK2MEDIA_TESSDATA_PREFIX    = $TessdataDir
$env:LINK2MEDIA_POPPLER_PATH       = $PopplerDir
$env:LINK2MEDIA_DATA_DIR           = $DataDir
$env:LINK2MEDIA_TEMP_DIR           = $TempDir

# Legacy env vars for backward compatibility
$env:YTDLP_BINARY                  = $YtdlpExe
$env:FFMPEG_BINARY                 = $FfmpegExe
$env:FFPROBE_BINARY                = $FfprobeExe
$env:MEDIA_TEMP_DIR                = $TempDir

$env:MAX_CONCURRENT_JOBS           = '1'
$env:MAX_ACTIVE_JOBS_PER_CLIENT    = '1'

# Add FFmpeg and Poppler directories to PATH for fallback
$env:PATH = "$(Split-Path -Parent $FfmpegExe);$PopplerDir;$env:PATH"

# - Lanzar servidor en segundo plano ---------------------
Write-Step "Iniciando servidor (puerto $selectedPort)..."

$procArgs = @{
    FilePath               = $NodeExe
    ArgumentList           = @($ServerJs)
    WorkingDirectory       = (Join-Path $BaseDir 'app')
    RedirectStandardOutput = $ServerLog
    RedirectStandardError  = $ErrorLog
    WindowStyle            = 'Hidden'
    PassThru               = $true
}

try {
    $serverProc = Start-Process @procArgs
} catch {
    Write-Err "No se pudo iniciar el servidor: $_"
    Write-Host "  Consulta: $ErrorLog" -ForegroundColor Yellow
    Read-Host "  Pulsa Enter para cerrar"
    exit 1
}

# Guardar PID y puerto
$serverProc.Id | Out-File $PidFile -Encoding ascii -NoNewline
"$selectedPort"  | Out-File $PortFile -Encoding ascii -NoNewline

# - Esperar hasta que /api/health responda ------------------
Write-Step "Esperando que el servidor arranque..."
$healthUrl = "http://127.0.0.1:$selectedPort/api/health"
$maxWaitSec = 60
$waited = 0
$ready = $false

while ($waited -lt $maxWaitSec) {
    Start-Sleep -Seconds 2
    $waited += 2

    # Comprobar que el proceso sigue vivo
    $aliveCheck = Get-Process -Id $serverProc.Id -ErrorAction SilentlyContinue
    if ($null -eq $aliveCheck) {
        Write-Err "El servidor se ha cerrado inesperadamente."
        Write-Host "  Consulta el log de error: $ErrorLog" -ForegroundColor Yellow
        if (Test-Path $ErrorLog) {
            Write-Host ""
            Write-Host "  --- Ultimas lineas del log ---" -ForegroundColor DarkGray
            Get-Content $ErrorLog -Tail 10 -ErrorAction SilentlyContinue | ForEach-Object { Write-Host "  $_" -ForegroundColor DarkGray }
        }
        Remove-Item $PidFile  -Force -ErrorAction SilentlyContinue
        Remove-Item $PortFile -Force -ErrorAction SilentlyContinue
        Read-Host "  Pulsa Enter para cerrar"
        exit 1
    }

    try {
        $resp = Invoke-WebRequest -Uri $healthUrl -UseBasicParsing -TimeoutSec 3 -ErrorAction Stop
        if ($resp.StatusCode -eq 200) {
            $ready = $true
            break
        }
    } catch { <# aun no listo #> }

    Write-Host "  Esperando... ($waited/$maxWaitSec s)" -ForegroundColor DarkGray
}

if (-not $ready) {
    Write-Err "El servidor no arranco en $maxWaitSec segundos."
    Write-Host "  Consulta el log de error: $ErrorLog" -ForegroundColor Yellow
    Stop-Process -Id $serverProc.Id -Force -ErrorAction SilentlyContinue
    Remove-Item $PidFile  -Force -ErrorAction SilentlyContinue
    Remove-Item $PortFile -Force -ErrorAction SilentlyContinue
    Read-Host "  Pulsa Enter para cerrar"
    exit 1
}

Write-Ok "Servidor listo en http://127.0.0.1:$selectedPort"

# - Abrir navegador -----------------------------
Write-Step "Abriendo navegador..."
Start-Process "http://127.0.0.1:$selectedPort"

Write-Host ""
Write-Host "  Link2Media esta ejecutandose en http://127.0.0.1:$selectedPort" -ForegroundColor Green
Write-Host "  Para cerrar la aplicacion: doble clic en CERRAR_LINK2MEDIA.bat" -ForegroundColor White
if ($missingTools.Count -gt 0) {
    Write-Host ""
    Write-Host "  Herramientas no disponibles: $($missingTools -join ', ')" -ForegroundColor Yellow
    Write-Host "  Algunas conversiones no estaran disponibles." -ForegroundColor Yellow
}
Write-Host ""
PSEOF

# stop-link2media.ps1
cat > "$STAGING_DIR/internal/stop-link2media.ps1" << 'PSEOF'
# =============================================================================
# stop-link2media.ps1 - Cierra Link2Media de forma segura (Windows)
# Invocado por CERRAR_LINK2MEDIA.bat
# =============================================================================
[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)]
    [string]$BaseDir
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$PidFile  = Join-Path $BaseDir 'data\link2media.pid'
$PortFile = Join-Path $BaseDir 'data\link2media.port'

Write-Host ""
Write-Host "  Link2Media - Cerrando..." -ForegroundColor White
Write-Host ""

if (-not (Test-Path $PidFile)) {
    Write-Host "  La aplicacion no parece estar en ejecucion." -ForegroundColor Yellow
    Write-Host ""
    exit 0
}

$pidStr = (Get-Content $PidFile -Raw -ErrorAction SilentlyContinue).Trim()

if (-not ($pidStr -match '^\d+$')) {
    Write-Host "  PID invalido en archivo. Limpiando..." -ForegroundColor Yellow
    Remove-Item $PidFile  -Force -ErrorAction SilentlyContinue
    Remove-Item $PortFile -Force -ErrorAction SilentlyContinue
    exit 0
}

$targetPid = [int]$pidStr
$proc = Get-Process -Id $targetPid -ErrorAction SilentlyContinue

if ($null -eq $proc) {
    Write-Host "  El proceso ya estaba cerrado (PID $targetPid)." -ForegroundColor Yellow
    Remove-Item $PidFile  -Force -ErrorAction SilentlyContinue
    Remove-Item $PortFile -Force -ErrorAction SilentlyContinue
    Write-Host ""
    exit 0
}

# Verificar que el proceso es node.exe (no otro proceso con ese PID)
if ($proc.Name -notmatch '^node') {
    Write-Host "  El proceso PID $targetPid no es node.exe (es $($proc.Name)). No se cerrara." -ForegroundColor Red
    Remove-Item $PidFile  -Force -ErrorAction SilentlyContinue
    Remove-Item $PortFile -Force -ErrorAction SilentlyContinue
    exit 1
}

# Intentar cierre graceful primero
Write-Host "  Enviando señal de cierre..." -ForegroundColor Cyan
try {
    $port = ''
    if (Test-Path $PortFile) {
        $port = (Get-Content $PortFile -Raw -ErrorAction SilentlyContinue).Trim()
    }
    if ($port) {
        # Try to call a shutdown endpoint if available
        Invoke-WebRequest -Uri "http://127.0.0.1:$port/api/shutdown" -UseBasicParsing -TimeoutSec 3 -ErrorAction SilentlyContinue | Out-Null
    }
} catch { <# no shutdown endpoint, force kill #> }

Start-Sleep -Milliseconds 500
$check = Get-Process -Id $targetPid -ErrorAction SilentlyContinue
if ($null -ne $check) {
    # Force kill if still running
    Stop-Process -Id $targetPid -Force -ErrorAction SilentlyContinue
    Start-Sleep -Milliseconds 500
    $check = Get-Process -Id $targetPid -ErrorAction SilentlyContinue
    if ($null -ne $check) {
        Write-Host "  Advertencia: el proceso tardo en cerrarse." -ForegroundColor Yellow
    } else {
        Write-Host "  [OK] Aplicacion cerrada (PID $targetPid)." -ForegroundColor Green
    }
} else {
    Write-Host "  [OK] Aplicacion cerrada gracefulmente (PID $targetPid)." -ForegroundColor Green
}

Remove-Item $PidFile  -Force -ErrorAction SilentlyContinue
Remove-Item $PortFile -Force -ErrorAction SilentlyContinue

Write-Host "  La aplicacion se ha cerrado." -ForegroundColor Green
Write-Host ""
PSEOF

# update-ytdlp.ps1
cat > "$STAGING_DIR/internal/update-ytdlp.ps1" << 'PSEOF'
# =============================================================================
# update-ytdlp.ps1 - Actualiza yt-dlp.exe de forma segura (Windows)
# Invocado por ACTUALIZAR_YTDLP.bat
# =============================================================================
[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)]
    [string]$BaseDir
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$YtdlpExe  = Join-Path $BaseDir 'tools\yt-dlp\yt-dlp.exe'
$PidFile   = Join-Path $BaseDir 'data\link2media.pid'
$TempDir   = Join-Path $BaseDir 'temp'
$YtdlpNew  = Join-Path $TempDir 'yt-dlp.new.exe'
$YtdlpBack = Join-Path $TempDir 'yt-dlp.backup.exe'

Write-Host ""
Write-Host "  Link2Media - Actualizando yt-dlp..." -ForegroundColor White
Write-Host ""

# - Comprobar que no hay conversion activa ------------------
if (Test-Path $PidFile) {
    $pidStr = (Get-Content $PidFile -Raw -ErrorAction SilentlyContinue).Trim()
    if ($pidStr -match '^\d+$') {
        $proc = Get-Process -Id ([int]$pidStr) -ErrorAction SilentlyContinue
        if ($proc -ne $null -and $proc.Name -match 'node') {
            Write-Host "  La aplicacion esta en ejecucion." -ForegroundColor Yellow
            Write-Host "  Espera a que terminen las conversiones activas o" -ForegroundColor Yellow
            Write-Host "  cierra la aplicacion antes de actualizar yt-dlp." -ForegroundColor Yellow
            Write-Host ""
            Read-Host "  Pulsa Enter para cerrar"
            exit 1
        }
    }
}

# - Version actual ------------------------------
$currentVersion = 'desconocida'
try {
    if (Test-Path $YtdlpExe) {
        $currentVersion = (& $YtdlpExe --version 2>&1).Trim()
        Write-Host "  Version actual: $currentVersion" -ForegroundColor DarkGray
    } else {
        Write-Host "  yt-dlp no encontrado en: $YtdlpExe" -ForegroundColor Yellow
    }
} catch {
    Write-Host "  No se pudo obtener la version actual." -ForegroundColor Yellow
}

# - Descargar nueva version --------------------------
Write-Host "  Descargando ultima version de yt-dlp..." -ForegroundColor Cyan
$downloadUrl = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe'

if (-not (Test-Path $TempDir)) { New-Item -ItemType Directory -Path $TempDir -Force | Out-Null }

try {
    $webClient = New-Object System.Net.WebClient
    $webClient.DownloadFile($downloadUrl, $YtdlpNew)
    $webClient.Dispose()
} catch {
    Write-Host "  [ERROR] No se pudo descargar yt-dlp: $_" -ForegroundColor Red
    Remove-Item $YtdlpNew -Force -ErrorAction SilentlyContinue
    Read-Host "  Pulsa Enter para cerrar"
    exit 1
}

if (-not (Test-Path $YtdlpNew) -or (Get-Item $YtdlpNew).Length -lt 1MB) {
    Write-Host "  [ERROR] El archivo descargado es invalido o demasiado pequeno." -ForegroundColor Red
    Remove-Item $YtdlpNew -Force -ErrorAction SilentlyContinue
    Read-Host "  Pulsa Enter para cerrar"
    exit 1
}

# - Verificar que el nuevo ejecutable responde ----------------
$newVersion = 'desconocida'
try {
    $newVersion = (& $YtdlpNew --version 2>&1).Trim()
    Write-Host "  Nueva version: $newVersion" -ForegroundColor Green
} catch {
    Write-Host "  [ERROR] El nuevo yt-dlp no responde correctamente." -ForegroundColor Red
    Remove-Item $YtdlpNew -Force -ErrorAction SilentlyContinue
    Read-Host "  Pulsa Enter para cerrar"
    exit 1
}

# - Hacer backup y sustituir -------------------------
if (Test-Path $YtdlpExe) {
    try {
        Copy-Item $YtdlpExe $YtdlpBack -Force
        Copy-Item $YtdlpNew $YtdlpExe  -Force
        Remove-Item $YtdlpNew -Force -ErrorAction SilentlyContinue
        Write-Host "  [OK] yt-dlp actualizado: $currentVersion -> $newVersion" -ForegroundColor Green
        Remove-Item $YtdlpBack -Force -ErrorAction SilentlyContinue
    } catch {
        Write-Host "  [ERROR] No se pudo sustituir yt-dlp: $_" -ForegroundColor Red
        if (Test-Path $YtdlpBack) {
            Copy-Item $YtdlpBack $YtdlpExe -Force -ErrorAction SilentlyContinue
            Write-Host "  Restaurada version anterior." -ForegroundColor Yellow
        }
        Remove-Item $YtdlpNew  -Force -ErrorAction SilentlyContinue
        Remove-Item $YtdlpBack -Force -ErrorAction SilentlyContinue
        Read-Host "  Pulsa Enter para cerrar"
        exit 1
    }
} else {
    # First time: no existing exe, just move the new one
    try {
        $toolsDir = Split-Path -Parent $YtdlpExe
        if (-not (Test-Path $toolsDir)) { New-Item -ItemType Directory -Path $toolsDir -Force | Out-Null }
        Copy-Item $YtdlpNew $YtdlpExe -Force
        Remove-Item $YtdlpNew -Force -ErrorAction SilentlyContinue
        Write-Host "  [OK] yt-dlp instalado: $newVersion" -ForegroundColor Green
    } catch {
        Write-Host "  [ERROR] No se pudo instalar yt-dlp: $_" -ForegroundColor Red
        Remove-Item $YtdlpNew -Force -ErrorAction SilentlyContinue
        Read-Host "  Pulsa Enter para cerrar"
        exit 1
    }
}

Write-Host ""
Write-Host "  Actualizacion completada." -ForegroundColor Green
Write-Host ""
Start-Sleep -Seconds 2
PSEOF

# diagnose-link2media.ps1
cat > "$STAGING_DIR/internal/diagnose-link2media.ps1" << 'PSEOF'
# =============================================================================
# diagnose-link2media.ps1 - Diagnostico completo de Link2Media (Windows)
# Invocado por DIAGNOSTICO_LINK2MEDIA.bat
# =============================================================================
[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)]
    [string]$BaseDir
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Continue'

Write-Host ""
Write-Host "  ══════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "    Link2Media - Diagnostico completo" -ForegroundColor Cyan
Write-Host "  ══════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""

$failures = 0

# - 1. Archivos criticos ------------------------------------
Write-Host "  [1] Archivos criticos" -ForegroundColor White
$criticalFiles = @(
    @{ Name = 'node.exe'; Path = (Join-Path $BaseDir 'runtime\node.exe') },
    @{ Name = 'server.js'; Path = (Join-Path $BaseDir 'app\server.js') },
    @{ Name = 'start-link2media.ps1'; Path = (Join-Path $BaseDir 'internal\start-link2media.ps1') },
    @{ Name = 'stop-link2media.ps1'; Path = (Join-Path $BaseDir 'internal\stop-link2media.ps1') },
    @{ Name = 'manifest.json'; Path = (Join-Path $BaseDir 'manifest.json') },
    @{ Name = 'VERSION.txt'; Path = (Join-Path $BaseDir 'VERSION.txt') }
)
foreach ($f in $criticalFiles) {
    if (Test-Path $f.Path) {
        Write-Host "    [OK] $($f.Name)" -ForegroundColor Green
    } else {
        Write-Host "    [FALTA] $($f.Name)" -ForegroundColor Red
        $failures++
    }
}

# - 2. Herramientas de conversion ----------------------------
Write-Host ""
Write-Host "  [2] Herramientas de conversion" -ForegroundColor White
$tools = @(
    @{ Name = 'yt-dlp'; Path = (Join-Path $BaseDir 'tools\yt-dlp\yt-dlp.exe'); EnvVar = 'LINK2MEDIA_YTDLP_PATH' },
    @{ Name = 'FFmpeg'; Path = (Join-Path $BaseDir 'tools\ffmpeg\bin\ffmpeg.exe'); EnvVar = 'LINK2MEDIA_FFMPEG_PATH' },
    @{ Name = 'FFprobe'; Path = (Join-Path $BaseDir 'tools\ffmpeg\bin\ffprobe.exe'); EnvVar = 'LINK2MEDIA_FFPROBE_PATH' },
    @{ Name = 'QPDF'; Path = (Join-Path $BaseDir 'tools\qpdf\bin\qpdf.exe'); EnvVar = 'LINK2MEDIA_QPDF_PATH' },
    @{ Name = '7-Zip'; Path = (Join-Path $BaseDir 'tools\sevenzip\7z.exe'); EnvVar = 'LINK2MEDIA_7ZIP_PATH' },
    @{ Name = 'Pandoc'; Path = (Join-Path $BaseDir 'tools\pandoc\pandoc.exe'); EnvVar = 'LINK2MEDIA_PANDOC_PATH' },
    @{ Name = 'LibreOffice'; Path = (Join-Path $BaseDir 'tools\libreoffice\program\soffice.exe'); EnvVar = 'LINK2MEDIA_LIBREOFFICE_PATH' },
    @{ Name = 'Calibre'; Path = (Join-Path $BaseDir 'tools\calibre\ebook-convert.exe'); EnvVar = 'LINK2MEDIA_CALIBRE_PATH' },
    @{ Name = 'Tesseract'; Path = (Join-Path $BaseDir 'tools\tesseract\tesseract.exe'); EnvVar = 'LINK2MEDIA_TESSERACT_PATH' },
    @{ Name = 'Poppler'; Path = (Join-Path $BaseDir 'tools\poppler\pdftoppm.exe'); EnvVar = 'LINK2MEDIA_POPPLER_PATH' }
)

$availableCount = 0
$missingCount = 0
foreach ($tool in $tools) {
    if (Test-Path $tool.Path) {
        # Try to get version
        $ver = ''
        try {
            $ver = (& $tool.Path --version 2>&1 | Select-Object -First 1).Trim()
        } catch { $ver = '(no se pudo obtener version)' }
        Write-Host "    [OK] $($tool.Name): $ver" -ForegroundColor Green
        $availableCount++
    } else {
        Write-Host "    [FALTA] $($tool.Name) - $($tool.EnvVar)" -ForegroundColor Red
        $missingCount++
    }
}

# - 3. Directorios de datos ----------------------------------
Write-Host ""
Write-Host "  [3] Directorios de datos" -ForegroundColor White
$dirs = @(
    @{ Name = 'data'; Path = (Join-Path $BaseDir 'data') },
    @{ Name = 'temp'; Path = (Join-Path $BaseDir 'temp') },
    @{ Name = 'logs'; Path = (Join-Path $BaseDir 'logs') },
    @{ Name = 'tessdata'; Path = (Join-Path $BaseDir 'tools\tessdata') }
)
foreach ($d in $dirs) {
    if (Test-Path $d.Path) {
        Write-Host "    [OK] $($d.Name)/" -ForegroundColor Green
    } else {
        Write-Host "    [CREAR] $($d.Name)/ (se creara al iniciar)" -ForegroundColor Yellow
    }
}

# - 4. Tesseract language data --------------------------------
Write-Host ""
Write-Host "  [4] Datos de idioma Tesseract" -ForegroundColor White
$tessdataDir = Join-Path $BaseDir 'tools\tessdata'
if (Test-Path $tessdataDir) {
    $traineddata = Get-ChildItem -Path $tessdataDir -Filter '*.traineddata' -ErrorAction SilentlyContinue
    if ($traineddata.Count -gt 0) {
        foreach ($td in $traineddata) {
            Write-Host "    [OK] $($td.Name)" -ForegroundColor Green
        }
    } else {
        Write-Host "    [FALTA] No hay archivos .traineddata" -ForegroundColor Yellow
        Write-Host "           Descarga de: github.com/tesseract-ocr/tessdata" -ForegroundColor DarkGray
    }
} else {
    Write-Host "    [FALTA] Directorio tessdata no existe" -ForegroundColor Yellow
}

# - 5. Servidor en ejecucion ----------------------------------
Write-Host ""
Write-Host "  [5] Estado del servidor" -ForegroundColor White
$pidFile = Join-Path $BaseDir 'data\link2media.pid'
$portFile = Join-Path $BaseDir 'data\link2media.port'

if (Test-Path $pidFile) {
    $pidStr = (Get-Content $pidFile -Raw -ErrorAction SilentlyContinue).Trim()
    if ($pidStr -match '^\d+$') {
        $proc = Get-Process -Id ([int]$pidStr) -ErrorAction SilentlyContinue
        if ($proc -ne $null -and $proc.Name -match 'node') {
            $port = ''
            if (Test-Path $portFile) {
                $port = (Get-Content $portFile -Raw -ErrorAction SilentlyContinue).Trim()
            }
            Write-Host "    [OK] Servidor en ejecucion (PID $pidStr, puerto $port)" -ForegroundColor Green

            # Health check
            if ($port) {
                Write-Host ""
                Write-Host "  [6] Health check API" -ForegroundColor White
                try {
                    $resp = Invoke-WebRequest -Uri "http://127.0.0.1:$port/api/health" -UseBasicParsing -TimeoutSec 5 -ErrorAction Stop
                    $health = $resp.Content | ConvertFrom-Json
                    Write-Host "    Status: $($health.status)" -ForegroundColor Green
                    Write-Host "    Available: $($health.summary.available)/$($health.summary.total)" -ForegroundColor Green
                    if ($health.summary.missing -gt 0) {
                        Write-Host "    Missing: $($health.summary.missing)" -ForegroundColor Yellow
                    }
                } catch {
                    Write-Host "    [ERROR] No se pudo conectar al health endpoint" -ForegroundColor Red
                }
            }
        } else {
            Write-Host "    [OFFLINE] El servidor no esta en ejecucion" -ForegroundColor Yellow
        }
    } else {
        Write-Host "    [OFFLINE] PID invalido" -ForegroundColor Yellow
    }
} else {
    Write-Host "    [OFFLINE] El servidor no esta en ejecucion" -ForegroundColor Yellow
}

# - Resultado -----------------------------------------------
Write-Host ""
Write-Host "  ══════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "    Herramientas: $availableCount disponibles, $missingCount faltantes" -ForegroundColor $(if ($missingCount -eq 0) { 'Green' } else { 'Yellow' })
if ($failures -gt 0) {
    Write-Host "    Archivos criticos faltantes: $failures" -ForegroundColor Red
}
Write-Host "  ══════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""
PSEOF

ok "Scripts internos PowerShell creados"

# ── 12. Copiar scripts PowerShell tambien al repo source ─────────────────────
info "Copiando scripts PowerShell actualizados al source..."
cp "$STAGING_DIR/internal/start-link2media.ps1" "$SCRIPTS_DIR/windows-portable/start-link2media.ps1"
cp "$STAGING_DIR/internal/stop-link2media.ps1" "$SCRIPTS_DIR/windows-portable/stop-link2media.ps1"
cp "$STAGING_DIR/internal/update-ytdlp.ps1" "$SCRIPTS_DIR/windows-portable/update-ytdlp.ps1"
cp "$STAGING_DIR/internal/diagnose-link2media.ps1" "$SCRIPTS_DIR/windows-portable/diagnose-link2media.ps1"
ok "Scripts PowerShell copiados al source"

# ── 13. Copiar launcher BAT al repo source ───────────────────────────────────
info "Copiando launcher BAT actualizados al source..."
cp "$STAGING_DIR/INICIAR_LINK2MEDIA.bat" "$SCRIPTS_DIR/INICIAR_LINK2MEDIA.bat"
cp "$STAGING_DIR/CERRAR_LINK2MEDIA.bat" "$SCRIPTS_DIR/CERRAR_LINK2MEDIA.bat"
cp "$STAGING_DIR/ACTUALIZAR_YTDLP.bat" "$SCRIPTS_DIR/ACTUALIZAR_YTDLP.bat"
cp "$STAGING_DIR/DIAGNOSTICO_LINK2MEDIA.bat" "$SCRIPTS_DIR/DIAGNOSTICO_LINK2MEDIA.bat"
ok "Launcher BAT copiados al source"

# ── 14. Generar manifest.json ───────────────────────────────────────────────
info "Generando manifest.json..."

# Build manifest from tool-versions.json
node -e "
const fs = require('fs');
const path = require('path');
const toolVersions = JSON.parse(fs.readFileSync('$TOOL_VERSIONS_FILE', 'utf8'));
const manifest = {
  app: 'Link2Media',
  version: '$APP_VERSION',
  buildDate: '$BUILD_DATE_UTC',
  platform: 'windows-x64',
  components: {}
};
for (const [key, val] of Object.entries(toolVersions)) {
  manifest.components[key] = {
    version: val.version,
    source: val.source,
    license: val.license
  };
}
// Add app component
manifest.components['link2media'] = {
  version: '$APP_VERSION',
  source: 'https://github.com/link2media/app',
  license: 'MIT'
};
fs.writeFileSync('$STAGING_DIR/manifest.json', JSON.stringify(manifest, null, 2));
console.log('manifest.json generado con', Object.keys(manifest.components).length, 'componentes');
" || die "No se pudo generar manifest.json"
ok "manifest.json generado"

# ── 15. Generar VERSION.txt ─────────────────────────────────────────────────
info "Generando VERSION.txt..."
cat > "$STAGING_DIR/VERSION.txt" << EOF
Link2Media $APP_VERSION
Build: $BUILD_DATE_UTC
Platform: Windows x64
Node.js: $(node -v)
EOF
ok "VERSION.txt generado"

# ── 16. Generar LEEME.txt ───────────────────────────────────────────────────
info "Generando LEEME.txt..."
cp "$SCRIPTS_DIR/windows-portable/LEEME.template.txt" "$STAGING_DIR/LEEME.txt" 2>/dev/null || {
cat > "$STAGING_DIR/LEEME.txt" << 'LEEMEEOF'
═══════════════════════════════════════════════════════════════
                  Link2Media  — Guia rapida
═══════════════════════════════════════════════════════════════

COMO EMPEZAR
────────────
1. Extrae TODO el contenido del ZIP en una carpeta de tu ordenador.
   (Importante: no ejecutes nada directamente desde el ZIP.)
2. Abre la carpeta extraida.
3. Haz doble clic en INICIAR_LINK2MEDIA.bat
4. Espera a que se abra el navegador automaticamente.
5. Pega el enlace de YouTube y convierte tu contenido autorizado.

COMO CERRAR
───────────
Haz doble clic en CERRAR_LINK2MEDIA.bat
o cierra la ventana negra que se abrio al iniciar.

DIAGNOSTICO
───────────
Si la aplicacion no funciona correctamente, haz doble clic en
DIAGNOSTICO_LINK2MEDIA.bat para ver un diagnostico completo.

ACTUALIZAR yt-dlp
─────────────────
Si las conversiones empiezan a fallar, es posible que YouTube
haya actualizado su sistema. Haz doble clic en ACTUALIZAR_YTDLP.bat
para obtener la version mas reciente de yt-dlp.

REQUISITOS
──────────
· Windows 10 u 11 de 64 bits.
· Conexion a Internet para las conversiones.
· Espacio libre suficiente en el disco (los videos pueden requerir
  varios GB temporales durante la conversion).
· Solo para contenido propio o con permiso del autor.

PROBLEMAS FRECUENTES
─────────────────────
· Windows muestra una advertencia de seguridad (SmartScreen):
  Haz clic en "Mas informacion" → "Ejecutar de todas formas".

· El antivirus bloquea un ejecutable:
  Algunos antivirus detectan falsos positivos en herramientas de
  descarga. Si estas en un entorno corporativo, consulta con tu
  administrador.

· La ventana indica que faltan archivos:
  Extrae primero TODO el ZIP en una carpeta local de tu ordenador
  (no en una carpeta de red, no desde dentro del ZIP).

· El navegador no se abre automaticamente:
  Abre manualmente tu navegador y ve a: http://127.0.0.1:3456
  (si el puerto es diferente, la ventana de consola lo indicara).

· El puerto esta ocupado:
  Cierra otras aplicaciones que puedan usar los puertos 3456-3460
  e intentalo de nuevo.

═══════════════════════════════════════════════════════════════
  Solo para contenido propio o con autorizacion del titular.
  Respeta siempre los derechos de autor y las licencias aplicables.
═══════════════════════════════════════════════════════════════
LEEMEEOF
}
ok "LEEME.txt generado"

# ── 17. Generar THIRD_PARTY_NOTICES.txt ─────────────────────────────────────
info "Generando THIRD_PARTY_NOTICES.txt..."

node -e "
const fs = require('fs');
const toolVersions = JSON.parse(fs.readFileSync('$TOOL_VERSIONS_FILE', 'utf8'));

let text = 'THIRD-PARTY NOTICES — Link2Media\n';
text += '='.repeat(60) + '\n\n';
text += 'This application includes software developed by third parties.\n';
text += 'Below are the notices and licenses for each component.\n\n';

const licenseTexts = {
  'MIT': 'Permission is hereby granted, free of charge, to any person obtaining a copy\nof this software and associated documentation files (the \"Software\"), to deal\nin the Software without restriction, including without limitation the rights\nto use, copy, modify, merge, publish, distribute, sublicense, and/or sell\ncopies of the Software, and to permit persons to whom the Software is\nfurnished to do so, subject to the following conditions:\n\nThe above copyright notice and this permission notice shall be included in all\ncopies or substantial portions of the Software.\n\nTHE SOFTWARE IS PROVIDED \"AS IS\", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR\nIMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,\nFITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE\nAUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER\nLIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,\nOUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE\nSOFTWARE.',
  'Unlicense': 'This is free and unencumbered software released into the public domain.\n\nAnyone is free to copy, modify, publish, use, compile, sell, or distribute this\nsoftware, either in source code form or as a compiled binary, for any purpose,\ncommercial or non-commercial, and by any means.\n\nFor more information, please refer to <https://unlicense.org>',
  'LGPL-2.1': 'This library is free software; you can redistribute it and/or modify it\nunder the terms of the GNU Lesser General Public License as published by the\nFree Software Foundation; either version 2.1 of the License, or (at your\noption) any later version.\n\nThis library is distributed in the hope that it will be useful, but WITHOUT\nANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS\nFOR A PARTICULAR PURPOSE. See the GNU Lesser General Public License for more\ndetails.\n\nYou should have received a copy of the GNU Lesser General Public License along\nwith this library; if not, write to the Free Software Foundation, Inc.,\n51 Franklin Street, Fifth Floor, Boston, MA 02110-1301 USA',
  'Apache-2.0': 'Licensed under the Apache License, Version 2.0 (the \"License\");\nyou may not use this file except in compliance with the License.\nYou may obtain a copy of the License at\n\n    http://www.apache.org/licenses/LICENSE-2.0\n\nUnless required by applicable law or agreed to in writing, software\ndistributed under the License is distributed on an \"AS IS\" BASIS,\nWITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.\nSee the License for the specific language governing permissions and\nlimitations under the License.',
  'GPL-2.0': 'This program is free software; you can redistribute it and/or modify\nit under the terms of the GNU General Public License as published by\nthe Free Software Foundation; either version 2 of the License, or\n(at your option) any later version.\n\nThis program is distributed in the hope that it will be useful,\nbut WITHOUT ANY WARRANTY; without even the implied warranty of\nMERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the\nGNU General Public License for more details.\n\nYou should have received a copy of the GNU General Public License along\nwith this program; if not, write to the Free Software Foundation, Inc.,\n51 Franklin Street, Fifth Floor, Boston, MA 02110-1301 USA',
  'GPL-3.0': 'This program is free software: you can redistribute it and/or modify\nit under the terms of the GNU General Public License as published by\nthe Free Software Foundation, either version 3 of the License, or\n(at your option) any later version.\n\nThis program is distributed in the hope that it will be useful,\nbut WITHOUT ANY WARRANTY; without even the implied warranty of\nMERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the\nGNU General Public License for more details.\n\nYou should have received a copy of the GNU General Public License\nalong with this program. If not, see <https://www.gnu.org/licenses/>.',
  'MPL-2.0': 'This Source Code Form is subject to the terms of the Mozilla Public\nLicense, v. 2.0. If a copy of the MPL was not distributed with this\nfile, You can obtain one at https://mozilla.org/MPL/2.0/.'
};

for (const [key, val] of Object.entries(toolVersions)) {
  text += '-'.repeat(60) + '\n';
  text += key.toUpperCase() + ' — Version ' + val.version + '\n';
  text += 'Source: ' + val.source + '\n';
  text += 'License: ' + val.license + '\n';
  text += '-'.repeat(60) + '\n\n';
  if (licenseTexts[val.license]) {
    text += licenseTexts[val.license] + '\n\n';
  } else {
    text += 'See ' + val.source + ' for license details.\n\n';
  }
}

fs.writeFileSync('$STAGING_DIR/THIRD_PARTY_NOTICES.txt', text);
console.log('THIRD_PARTY_NOTICES.txt generado');
" || die "No se pudo generar THIRD_PARTY_NOTICES.txt"
ok "THIRD_PARTY_NOTICES.txt generado"

# ── 18. Crear licenses/ vacío (se rellena con las licencias de las deps) ────
info "Creando directorio licenses/..."
mkdir -p "$STAGING_DIR/licenses"
# Generate a placeholder
cat > "$STAGING_DIR/licenses/README.txt" << 'EOF'
This directory should contain the license files for all bundled dependencies.
Run: pnpm licenses list --prod > licenses/npm-licenses.txt
EOF
ok "Directorio licenses/ creado"

# ── 19. Copiar LEEME.template.txt si existe ─────────────────────────────────
if [[ -f "$SCRIPTS_DIR/windows-portable/LEEME.template.txt" ]]; then
  cp "$SCRIPTS_DIR/windows-portable/LEEME.template.txt" "$STAGING_DIR/LEEME.txt"
  ok "LEEME.txt copiado desde template"
fi

# ── 20. Verificar si tools/ esta poblado ────────────────────────────────────
info "Verificando directorio tools/..."
TOOLS_POPULATED=false
if [[ -f "$STAGING_DIR/tools/yt-dlp/yt-dlp.exe" ]] || [[ -f "$STAGING_DIR/tools/ffmpeg/bin/ffmpeg.exe" ]]; then
  TOOLS_POPULATED=true
  ok "Directorio tools/ contiene binarios"
else
  warn "Directorio tools/ vacio — los binarios se deben agregar en Windows"
  warn "Las herramientas se pueden descargar con los URLs en scripts/tool-versions.json"
fi

# ── 21. Verificar si runtime/node.exe existe ────────────────────────────────
info "Verificando runtime/node.exe..."
if [[ -f "$STAGING_DIR/runtime/node.exe" ]]; then
  ok "runtime/node.exe encontrado"
else
  warn "runtime/node.exe no encontrado — debe agregarse manualmente"
  warn "Descarga Node.js Windows x64 desde: https://nodejs.org/dist/"
fi

# ── 22. Crear ZIP (solo si tools estan poblados) ────────────────────────────
if [[ "$TOOLS_POPULATED" == "true" ]]; then
  info "Creando ZIP..."
  rm -f "$OUT_ZIP" "$OUT_SHA"
  (cd "$STAGING_BASE" && zip -r -9 "$OUT_ZIP" "Link2Media-Windows-x64/") || die "No se pudo crear el ZIP"
  ok "ZIP creado: $OUT_ZIP"

  # SHA-256
  info "Calculando SHA-256..."
  (cd "$SCRIPTS_DIR" && sha256sum "$(basename "$OUT_ZIP")" > "$(basename "$OUT_SHA")")
  ok "SHA-256 calculado"
else
  warn "ZIP no creado — directorio tools/ vacio (requiere Windows para descargar binarios)"
  warn "Para completar la distribucion en Windows:"
  warn "  1. Descarga los binarios con los URLs de scripts/tool-versions.json"
  warn "  2. Colocalos en el directorio tools/ correspondiente"
  warn "  3. Coloca node.exe en runtime/"
  warn "  4. Ejecuta de nuevo este script para crear el ZIP"
fi

# ── 23. Resumen final ───────────────────────────────────────────────────────
echo ""
echo -e "${CYAN}═══════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  Build completado${NC}"
echo ""
echo "  App version:   $APP_VERSION"
echo "  Build date:    $BUILD_DATE_UTC"
echo "  Staging:       $STAGING_DIR"
echo "  Build log:     $BUILD_LOG"
echo ""
if [[ "$TOOLS_POPULATED" == "true" ]]; then
  echo "  ZIP:           $OUT_ZIP"
  echo "  SHA-256:       $OUT_SHA"
else
  echo -e "  ZIP:           ${YELLOW}PENDIENTE (tools/ vacio)${NC}"
fi
echo ""
echo -e "${CYAN}═══════════════════════════════════════════════════${NC}"
echo ""

info "Build log guardado en: $BUILD_LOG"
