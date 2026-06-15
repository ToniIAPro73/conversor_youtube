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
