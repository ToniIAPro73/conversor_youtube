# =============================================================================
# stop-anclora-filestudio.ps1 - Cierra Anclora FileStudio de forma segura (Windows)
# Invocado por CERRAR_ANCLORA_FILESTUDIO.bat
# =============================================================================
[CmdletBinding()]
param(
    [Parameter(Mandatory=$true)]
    [string]$BaseDir
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$PidFile  = Join-Path $BaseDir 'data\anclora-filestudio.pid'
$PortFile = Join-Path $BaseDir 'data\anclora-filestudio.port'
$NodeExe  = Join-Path $BaseDir 'runtime\node.exe'

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

Write-Host ""
Write-Host "  Anclora FileStudio - Cerrando..." -ForegroundColor White
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

# Verificar que el proceso es el node.exe incluido en este portable.
if (-not (Test-PortableNodeProcess $proc)) {
    Write-Host "  El proceso PID $targetPid no corresponde al runtime incluido. No se cerrara." -ForegroundColor Red
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
