# =============================================================================
# diagnose-anclora-filestudio.ps1 - Diagnostico completo de Anclora FileStudio (Windows)
# Invocado por DIAGNOSTICO_ANCLORA_FILESTUDIO.bat
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
Write-Host "    Anclora FileStudio - Diagnostico completo" -ForegroundColor Cyan
Write-Host "  ══════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""

$failures = 0

function Resolve-ToolPath([string[]]$Candidates) {
    foreach ($candidate in $Candidates) {
        if (Test-Path $candidate) {
            return $candidate
        }
    }
    return $Candidates[0]
}

# - 1. Archivos criticos ------------------------------------
Write-Host "  [1] Archivos criticos" -ForegroundColor White
$criticalFiles = @(
    @{ Name = 'node.exe'; Path = (Join-Path $BaseDir 'runtime\node.exe') },
    @{ Name = 'server.js'; Path = (Join-Path $BaseDir 'app\server.js') },
    @{ Name = 'start-anclora-filestudio.ps1'; Path = (Join-Path $BaseDir 'internal\start-anclora-filestudio.ps1') },
    @{ Name = 'stop-anclora-filestudio.ps1'; Path = (Join-Path $BaseDir 'internal\stop-anclora-filestudio.ps1') },
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
    @{ Name = 'yt-dlp'; Path = (Join-Path $BaseDir 'tools\yt-dlp\yt-dlp.exe'); EnvVar = 'ANCLORA_FILESTUDIO_YTDLP_PATH' },
    @{ Name = 'FFmpeg'; Path = (Resolve-ToolPath @((Join-Path $BaseDir 'tools\ffmpeg\ffmpeg.exe'), (Join-Path $BaseDir 'tools\ffmpeg\bin\ffmpeg.exe'))); EnvVar = 'ANCLORA_FILESTUDIO_FFMPEG_PATH' },
    @{ Name = 'FFprobe'; Path = (Resolve-ToolPath @((Join-Path $BaseDir 'tools\ffmpeg\ffprobe.exe'), (Join-Path $BaseDir 'tools\ffmpeg\bin\ffprobe.exe'))); EnvVar = 'ANCLORA_FILESTUDIO_FFPROBE_PATH' },
    @{ Name = 'QPDF'; Path = (Resolve-ToolPath @((Join-Path $BaseDir 'tools\qpdf\qpdf.exe'), (Join-Path $BaseDir 'tools\qpdf\bin\qpdf.exe'))); EnvVar = 'ANCLORA_FILESTUDIO_QPDF_PATH' },
    @{ Name = '7-Zip'; Path = (Resolve-ToolPath @((Join-Path $BaseDir 'tools\sevenzip\7z.exe'), (Join-Path $BaseDir 'tools\sevenzip\7za.exe'), (Join-Path $BaseDir 'tools\sevenzip\7zr.exe'))); EnvVar = 'ANCLORA_FILESTUDIO_7ZIP_PATH' },
    @{ Name = 'Pandoc'; Path = (Join-Path $BaseDir 'tools\pandoc\pandoc.exe'); EnvVar = 'ANCLORA_FILESTUDIO_PANDOC_PATH' },
    @{ Name = 'LibreOffice'; Path = (Join-Path $BaseDir 'tools\libreoffice\program\soffice.exe'); EnvVar = 'ANCLORA_FILESTUDIO_LIBREOFFICE_PATH' },
    @{ Name = 'Calibre'; Path = (Join-Path $BaseDir 'tools\calibre\ebook-convert.exe'); EnvVar = 'ANCLORA_FILESTUDIO_CALIBRE_PATH' },
    @{ Name = 'Tesseract'; Path = (Join-Path $BaseDir 'tools\tesseract\tesseract.exe'); EnvVar = 'ANCLORA_FILESTUDIO_TESSERACT_PATH' },
    @{ Name = 'Poppler'; Path = (Join-Path $BaseDir 'tools\poppler\pdftoppm.exe'); EnvVar = 'ANCLORA_FILESTUDIO_POPPLER_PATH' }
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
$pidFile = Join-Path $BaseDir 'data\anclora-filestudio.pid'
$portFile = Join-Path $BaseDir 'data\anclora-filestudio.port'

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
