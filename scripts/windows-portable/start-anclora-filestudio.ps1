# =============================================================================
# start-anclora-filestudio.ps1 - Lanzador interno de Anclora FileStudio (Windows)
# Invocado por INICIAR_ANCLORA_FILESTUDIO.bat
# NO ejecutar directamente; usar INICIAR_ANCLORA_FILESTUDIO.bat
# =============================================================================
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$BaseDir,

    [switch]$SkipBrowser
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$ToolResolutionScript = Join-Path $PSScriptRoot 'tool-resolution.ps1'
if (-not (Test-Path $ToolResolutionScript)) {
    Write-Host ""
    Write-Host "  [ERROR] No se encuentra el helper interno: tool-resolution.ps1" -ForegroundColor Red
    exit 1
}
. $ToolResolutionScript

# - Rutas absolutas derivadas de BaseDir ------------------
$NodeExe      = Join-Path $BaseDir 'runtime\node.exe'
$AppDir       = Join-Path $BaseDir 'app'
$ServerJs     = Join-Path $AppDir 'server.js'
$ServerEntry  = 'server.js'
$Tools        = Resolve-AncloraWindowsTools -BaseDir $BaseDir
$YtdlpExe     = $Tools.Ytdlp.Path
$FfmpegExe    = $Tools.Ffmpeg.Path
$FfprobeExe   = $Tools.Ffprobe.Path
$QpdfExe      = $Tools.Qpdf.Path
$SevenZipExe  = $Tools.SevenZip.Path
$PandocExe    = $Tools.Pandoc.Path
$LibreOfficeExe = $Tools.LibreOffice.Path
$CalibreExe   = $Tools.Calibre.Path
$TesseractExe = $Tools.Tesseract.Path
$TessdataDir  = $Tools.Tessdata.Path
$PopplerBaseDir = Join-Path $BaseDir 'tools\poppler'
$DataDir      = Join-Path $BaseDir 'data'
$TempDir      = Join-Path $BaseDir 'temp'
$LogDir       = Join-Path $BaseDir 'logs'
$PidFile      = Join-Path $BaseDir 'data\anclora-filestudio.pid'
$PortFile     = Join-Path $BaseDir 'data\anclora-filestudio.port'
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
function Clear-ServerState {
    Remove-Item $PidFile  -Force -ErrorAction SilentlyContinue
    Remove-Item $PortFile -Force -ErrorAction SilentlyContinue
}
function Get-NormalizedPath([string]$path) {
    if ([string]::IsNullOrWhiteSpace($path)) {
        return ''
    }
    return [System.IO.Path]::GetFullPath($path).TrimEnd('\')
}
function Test-PortableNodeProcess([System.Diagnostics.Process]$Process) {
    if ($null -eq $Process) {
        return $false
    }
    if ($Process.Name -notmatch '^node$') {
        return $false
    }
    try {
        $processPath = Get-NormalizedPath $Process.Path
        $expectedPath = Get-NormalizedPath $NodeExe
        return $processPath.Equals($expectedPath, [System.StringComparison]::OrdinalIgnoreCase)
    } catch {
        return $false
    }
}
function Show-ErrorLogTail {
    param([int]$Lines = 10)
    if (Test-Path $ErrorLog) {
        Write-Host ""
        Write-Host "  --- Ultimas lineas del log ---" -ForegroundColor DarkGray
        Get-Content $ErrorLog -Tail $Lines -ErrorAction SilentlyContinue |
            ForEach-Object { Write-Host "  $_" -ForegroundColor DarkGray }
    }
}

Write-Host ""
Write-Host "  Anclora FileStudio - Iniciando..." -ForegroundColor White
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
    exit 1
}
Write-Ok "Archivos criticos verificados"

# - Verificar herramientas opcionales --------------------
Write-Step "Verificando herramientas de conversion..."
$optionalTools = @(
    $Tools.Ytdlp,
    $Tools.Ffmpeg,
    $Tools.Ffprobe,
    $Tools.Qpdf,
    $Tools.SevenZip,
    $Tools.Pandoc,
    $Tools.LibreOffice,
    $Tools.Calibre,
    $Tools.Tesseract
)
$missingTools = @()
foreach ($tool in $optionalTools) {
    if ($tool.Resolved) {
        Write-Ok "$($tool.Name) encontrado"
    } else {
        Write-Warn "$($tool.Name) no encontrado (algunas conversiones no estaran disponibles)"
        $missingTools += $tool.Name
    }
}

# - Crear directorios ----------------------------
if (-not (Test-Path $DataDir))    { New-Item -ItemType Directory -Path $DataDir    -Force | Out-Null }
if (-not (Test-Path $TempDir))    { New-Item -ItemType Directory -Path $TempDir    -Force | Out-Null }
if (-not (Test-Path $LogDir))     { New-Item -ItemType Directory -Path $LogDir     -Force | Out-Null }
if (-not $Tools.Tessdata.Resolved) {
    $portableTessdataDir = Join-Path $BaseDir 'tools\tessdata'
    if (-not (Test-Path $portableTessdataDir)) {
        New-Item -ItemType Directory -Path $portableTessdataDir -Force | Out-Null
    }
    $TessdataDir = $portableTessdataDir
}

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
        if (Test-PortableNodeProcess $proc) {
            $existingPort = ''
            if (Test-Path $PortFile) {
                $existingPort = (Get-Content $PortFile -Raw -ErrorAction SilentlyContinue).Trim()
            }
            $url = if ($existingPort) { "http://127.0.0.1:$existingPort" } else { "http://127.0.0.1:3456" }
            Write-Host ""
            Write-Host "  La aplicacion ya esta en ejecucion (PID $existingPid)." -ForegroundColor Green
            if (-not $SkipBrowser) {
                Write-Host "  Abriendo navegador en $url ..." -ForegroundColor Cyan
                Start-Process $url
            }
            exit 0
        } else {
            Clear-ServerState
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
    exit 1
}
Write-Ok "Puerto seleccionado: $selectedPort"

# - Variables de entorno para el servidor ------------------
$env:NODE_ENV                      = 'production'
$env:NEXT_TELEMETRY_DISABLED       = '1'
$env:HOSTNAME                      = '127.0.0.1'
$env:PORT                          = "$selectedPort"
$env:ANCLORA_FILESTUDIO_PLATFORM   = 'windows'

# ANCLORA_FILESTUDIO_* environment variables
$env:ANCLORA_FILESTUDIO_FFMPEG_PATH        = $FfmpegExe
$env:ANCLORA_FILESTUDIO_FFPROBE_PATH       = $FfprobeExe
$env:ANCLORA_FILESTUDIO_YTDLP_PATH         = $YtdlpExe
$env:ANCLORA_FILESTUDIO_QPDF_PATH          = $QpdfExe
$env:ANCLORA_FILESTUDIO_7ZIP_PATH          = $SevenZipExe
$env:ANCLORA_FILESTUDIO_PANDOC_PATH        = $PandocExe
$env:ANCLORA_FILESTUDIO_LIBREOFFICE_PATH   = $LibreOfficeExe
$env:ANCLORA_FILESTUDIO_CALIBRE_PATH       = $CalibreExe
$env:ANCLORA_FILESTUDIO_TESSERACT_PATH     = $TesseractExe
$env:ANCLORA_FILESTUDIO_TESSDATA_PREFIX    = $TessdataDir
# Resolve the Poppler directory: set ANCLORA_FILESTUDIO_POPPLER_PATH to the
# base tools\poppler dir. The Node.js app searches Library\bin\, bin\, and root.
$env:ANCLORA_FILESTUDIO_POPPLER_PATH       = $PopplerBaseDir
$env:ANCLORA_FILESTUDIO_DATA_DIR           = $DataDir
$env:ANCLORA_FILESTUDIO_TEMP_DIR           = $TempDir
$env:ANCLORA_FILESTUDIO_LOGS_DIR           = $LogDir

# Legacy env vars for backward compatibility
$env:YTDLP_BINARY                  = $YtdlpExe
$env:FFMPEG_BINARY                 = $FfmpegExe
$env:FFPROBE_BINARY                = $FfprobeExe
$env:MEDIA_TEMP_DIR                = $TempDir

$env:MAX_CONCURRENT_JOBS           = '1'
$env:MAX_ACTIVE_JOBS_PER_CLIENT    = '1'

# Add bundled tool directories to PATH for DLL lookup and fallback discovery.
# Poppler: check all common Windows distribution subdirectory layouts.
$popplerBinDirs = @(
    (Join-Path $PopplerBaseDir 'Library\bin'),
    (Join-Path $PopplerBaseDir 'bin'),
    $PopplerBaseDir
) | Where-Object { $_ -and (Test-Path $_) }

$toolPathParts = @(
    (Split-Path -Parent $FfmpegExe),
    (Split-Path -Parent $QpdfExe),
    (Split-Path -Parent $SevenZipExe),
    (Split-Path -Parent $PandocExe),
    (Split-Path -Parent $TesseractExe),
    (Split-Path -Parent $CalibreExe),
    (Split-Path -Parent $LibreOfficeExe)
) + $popplerBinDirs | Where-Object { $_ -and (Test-Path $_) }
$env:PATH = "$($toolPathParts -join ';');$env:PATH"

# - Lanzar servidor en segundo plano ---------------------
Write-Step "Iniciando servidor (puerto $selectedPort)..."

$procArgs = @{
    FilePath               = $NodeExe
    ArgumentList           = @($ServerEntry)
    WorkingDirectory       = $AppDir
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
    Show-ErrorLogTail
    exit 1
}

# Guardar PID y puerto
$serverProc = Get-Process -Id $serverProc.Id -ErrorAction SilentlyContinue
if (-not (Test-PortableNodeProcess $serverProc)) {
    Write-Err "El proceso iniciado no corresponde al runtime incluido."
    Write-Host "  Esperado: $NodeExe" -ForegroundColor Yellow
    if ($serverProc -ne $null) {
        Stop-Process -Id $serverProc.Id -Force -ErrorAction SilentlyContinue
    }
    Clear-ServerState
    Show-ErrorLogTail
    exit 1
}

$serverProc.Id | Out-File $PidFile -Encoding ascii -NoNewline
"$selectedPort" | Out-File $PortFile -Encoding ascii -NoNewline

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
        Show-ErrorLogTail
        Clear-ServerState
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
    Clear-ServerState
    Show-ErrorLogTail
    exit 1
}

Write-Ok "Servidor listo en http://127.0.0.1:$selectedPort"

# - Abrir navegador -----------------------------
if (-not $SkipBrowser) {
    Write-Step "Abriendo navegador..."
    Start-Process "http://127.0.0.1:$selectedPort"
}

Write-Host ""
Write-Host "  Anclora FileStudio esta ejecutandose en http://127.0.0.1:$selectedPort" -ForegroundColor Green
Write-Host "  Para cerrar la aplicacion: doble clic en CERRAR_ANCLORA_FILESTUDIO.bat" -ForegroundColor White
if ($missingTools.Count -gt 0) {
    Write-Host ""
    Write-Host "  Herramientas no disponibles: $($missingTools -join ', ')" -ForegroundColor Yellow
    Write-Host "  Algunas conversiones no estaran disponibles." -ForegroundColor Yellow
}
Write-Host ""
