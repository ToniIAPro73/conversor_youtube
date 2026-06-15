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
