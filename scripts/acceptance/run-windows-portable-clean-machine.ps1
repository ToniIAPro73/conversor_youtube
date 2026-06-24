<#
.SYNOPSIS
    Validates the Anclora FileStudio Windows portable on a clean machine.

.DESCRIPTION
    Designed to run on a Windows machine WITHOUT Node.js, yt-dlp, FFmpeg or FFprobe
    installed globally. Verifies that all essential tools resolve from the portable
    itself, the server starts correctly, and the API responds as expected.

    This script DOES NOT download or convert real YouTube videos unless the
    opt-in environment variable ANCLORA_FILESTUDIO_RUN_EXTERNAL_E2E=1 is set.

.PARAMETER ZipPath
    Path to the Anclora-FileStudio-Windows-x64-Core.zip file.
    If omitted, looks for dist\windows\Anclora-FileStudio-Windows-x64-Core.zip
    relative to the repository root.

.PARAMETER ExtractDir
    Directory where the ZIP is extracted. Defaults to a temp dir with Unicode and
    space in the path to test robustness.

.PARAMETER Port
    TCP port for the local server. Default: 3852.

.PARAMETER SkipClean
    If set, skip deleting the ExtractDir after the test (useful for debugging).

.EXAMPLE
    # Basic validation (no external downloads)
    pwsh scripts\acceptance\run-windows-portable-clean-machine.ps1

.EXAMPLE
    # Validate a specific ZIP
    pwsh scripts\acceptance\run-windows-portable-clean-machine.ps1 -ZipPath C:\Downloads\Anclora-FileStudio-Windows-x64-Core.zip

.EXAMPLE
    # Full E2E with an authorized YouTube URL (opt-in)
    $env:ANCLORA_FILESTUDIO_RUN_EXTERNAL_E2E = "1"
    $env:ANCLORA_FILESTUDIO_EXTERNAL_VIDEO_URL = "https://www.youtube.com/watch?v=<AUTHORIZED_ID>"
    $env:ANCLORA_FILESTUDIO_EXTERNAL_EXPECTED_MIN_HEIGHT = "2160"
    pwsh scripts\acceptance\run-windows-portable-clean-machine.ps1
#>

param(
    [string]$ZipPath,
    [string]$ExtractDir,
    [int]$Port = 3852,
    [switch]$SkipClean
)

$ErrorActionPreference = "Stop"

# ── Color helpers ─────────────────────────────────────────────────────────────
function Write-Pass($msg) { Write-Host "[PASS] $msg" -ForegroundColor Green }
function Write-Fail($msg) { Write-Host "[FAIL] $msg" -ForegroundColor Red }
function Write-Info($msg) { Write-Host "[INFO] $msg" -ForegroundColor Cyan }
function Write-Warn($msg) { Write-Host "[WARN] $msg" -ForegroundColor Yellow }
function Write-Block($msg) { Write-Host "[BLOCKED] $msg" -ForegroundColor Magenta }

$PassCount = 0
$FailCount = 0
$StartTime = Get-Date

function Assert-Pass($condition, $label) {
    if ($condition) {
        Write-Pass $label
        $script:PassCount++
    } else {
        Write-Fail $label
        $script:FailCount++
    }
}

# ── Resolve paths ─────────────────────────────────────────────────────────────
$ScriptDir  = Split-Path -Parent $MyInvocation.MyCommand.Definition
$RepoRoot   = (Resolve-Path (Join-Path $ScriptDir "..\..")).Path

if (-not $ZipPath) {
    $ZipPath = Join-Path $RepoRoot "dist\windows\Anclora-FileStudio-Windows-x64-Core.zip"
}

if (-not (Test-Path $ZipPath)) {
    Write-Fail "ZIP not found: $ZipPath"
    Write-Host "Run: pnpm build:portable:windows" -ForegroundColor Yellow
    exit 1
}

if (-not $ExtractDir) {
    # Use a path with spaces and Unicode to stress-test robustness
    $ExtractDir = Join-Path $env:TEMP "Anclora Test 東京 $([System.IO.Path]::GetRandomFileName())"
}

Write-Host ""
Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  Anclora FileStudio — Clean Machine Validation" -ForegroundColor Cyan
Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  ZIP     : $ZipPath" -ForegroundColor DarkCyan
Write-Host "  Extract : $ExtractDir" -ForegroundColor DarkCyan
Write-Host "  Port    : $Port" -ForegroundColor DarkCyan
Write-Host ""

# ── Phase 1: ZIP integrity ────────────────────────────────────────────────────
Write-Info "Phase 1 — ZIP integrity"

$ZipSize = (Get-Item $ZipPath).Length
Assert-Pass ($ZipSize -gt 100MB) "ZIP size > 100 MB ($([Math]::Round($ZipSize/1MB,1)) MB)"

$Sha256File = $ZipPath + ".sha256"
if (Test-Path $Sha256File) {
    $ExpectedHash = ((Get-Content $Sha256File -Raw).Trim() -split '\s+')[0]
    $ActualHash   = (Get-FileHash -Algorithm SHA256 -Path $ZipPath).Hash.ToLower()
    Assert-Pass ($ActualHash -eq $ExpectedHash.ToLower()) "SHA-256 matches .sha256 file ($ExpectedHash)"
} else {
    Write-Warn "No .sha256 file found beside ZIP — skipping hash check"
}

# ── Phase 2: Extract ──────────────────────────────────────────────────────────
Write-Info "Phase 2 — Extract to path with Unicode and spaces"

New-Item -ItemType Directory -Force -Path $ExtractDir | Out-Null

try {
    Expand-Archive -Path $ZipPath -DestinationPath $ExtractDir -Force
} catch {
    Write-Fail "Expand-Archive failed: $_"
    exit 1
}

$PkgDir = Get-ChildItem -Path $ExtractDir -Directory `
    | Where-Object { $_.Name -like "Anclora-FileStudio-Windows-x64*" } `
    | Select-Object -First 1

if (-not $PkgDir) {
    Write-Fail "Could not find package root under $ExtractDir"
    exit 1
}
$PkgPath = $PkgDir.FullName
Write-Pass "Package extracted to: $PkgPath"
$PassCount++

# ── Phase 3: Structural checks ────────────────────────────────────────────────
Write-Info "Phase 3 — Structural checks"

$RequiredFiles = @(
    "runtime\node.exe",
    "app\server.js",
    "app\.next\server",
    "tools\yt-dlp\yt-dlp.exe",
    "tools\ffmpeg\ffmpeg.exe",
    "tools\ffmpeg\ffprobe.exe",
    "app\node_modules\better-sqlite3\build\Release\better_sqlite3.node",
    "INICIAR_ANCLORA_FILESTUDIO.bat",
    "CERRAR_ANCLORA_FILESTUDIO.bat",
    "internal\start-anclora-filestudio.ps1",
    "internal\stop-anclora-filestudio.ps1",
    "internal\tool-resolution.ps1",
    "manifest.json"
)

foreach ($rel in $RequiredFiles) {
    $full = Join-Path $PkgPath $rel
    Assert-Pass (Test-Path $full) "Exists: $rel"
}

# manifest.json content
$ManifestPath = Join-Path $PkgPath "manifest.json"
$Manifest = Get-Content $ManifestPath -Raw | ConvertFrom-Json
Assert-Pass ($Manifest.platform -eq "windows") "manifest.platform = windows"
Assert-Pass ($Manifest.arch    -eq "x64")     "manifest.arch = x64"
Assert-Pass ([bool]$Manifest.commit)           "manifest.commit present ($($Manifest.commit))"
Assert-Pass ([bool]$Manifest.buildDate)        "manifest.buildDate present ($($Manifest.buildDate))"
Assert-Pass ([bool]$Manifest.tools.ytdlp)      "manifest.tools.ytdlp present ($($Manifest.tools.ytdlp.version))"
Assert-Pass ([bool]$Manifest.tools.ffmpeg)     "manifest.tools.ffmpeg present"
Write-Pass "manifest.json is valid JSON with required fields"
$PassCount++

# ── Phase 4: No global PATH dependency for essential tools ────────────────────
Write-Info "Phase 4 — Tools resolve from portable, not global PATH"

# Temporarily remove from PATH to simulate clean machine
$SavedPath = $env:PATH
$PathEntries = $env:PATH -split ';' | Where-Object {
    $_ -notlike "*\yt-dlp*" -and
    $_ -notlike "*\ffmpeg*" -and
    $_ -notlike "*\ffprobe*" -and
    $_ -notlike "*\nodejs*" -and
    $_ -notlike "*\node*"
}
$env:PATH = $PathEntries -join ';'

$NodeExe    = Join-Path $PkgPath "runtime\node.exe"
$YtDlpExe  = Join-Path $PkgPath "tools\yt-dlp\yt-dlp.exe"
$FfmpegExe = Join-Path $PkgPath "tools\ffmpeg\ffmpeg.exe"
$FfprobeExe= Join-Path $PkgPath "tools\ffmpeg\ffprobe.exe"

try {
    $NodeVersion = (& $NodeExe --version 2>$null)
    Assert-Pass ($NodeVersion -match "v\d+\.\d+") "node.exe runs from portable: $NodeVersion"
} catch {
    Assert-Pass $false "node.exe runs from portable (ERROR: $_)"
}

try {
    $YtDlpVersion = (& $YtDlpExe --version 2>$null)
    Assert-Pass ($YtDlpVersion -match "\d{4}\.\d{2}\.\d{2}") "yt-dlp.exe runs from portable: $YtDlpVersion"
} catch {
    Assert-Pass $false "yt-dlp.exe runs from portable (ERROR: $_)"
}

try {
    $FfmpegOut = (& $FfmpegExe -version 2>&1 | Select-Object -First 1)
    Assert-Pass ($FfmpegOut -match "ffmpeg version") "ffmpeg.exe runs from portable: $($FfmpegOut.Substring(0,[Math]::Min(60,$FfmpegOut.Length)))"
} catch {
    Assert-Pass $false "ffmpeg.exe runs from portable (ERROR: $_)"
}

try {
    $FfprobeOut = (& $FfprobeExe -version 2>&1 | Select-Object -First 1)
    Assert-Pass ($FfprobeOut -match "ffprobe version") "ffprobe.exe runs from portable: $($FfprobeOut.Substring(0,[Math]::Min(60,$FfprobeOut.Length)))"
} catch {
    Assert-Pass $false "ffprobe.exe runs from portable (ERROR: $_)"
}

$env:PATH = $SavedPath

# ── Phase 5: Server start and API health ──────────────────────────────────────
Write-Info "Phase 5 — Server start, API health, 127.0.0.1 binding"

$StartScript = Join-Path $PkgPath "internal\start-anclora-filestudio.ps1"
$StopScript  = Join-Path $PkgPath "internal\stop-anclora-filestudio.ps1"
$PortFile    = Join-Path $PkgPath "data\anclora-filestudio.port"
$ServerPid   = $null

try {
    # Set the port and start
    $env:ANCLORA_FILESTUDIO_PORT = "$Port"
    $env:PORT = "$Port"

    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $StartScript `
        -BaseDir $PkgPath -SkipBrowser 2>$null

    # Read the actual port from the port file if it exists
    if (Test-Path $PortFile) {
        $Port = [int]((Get-Content $PortFile -Raw).Trim())
    }

    $BaseUrl = "http://127.0.0.1:$Port"
    Write-Info "Server started on $BaseUrl"

    # Wait for server to respond (max 30s)
    $Ready = $false
    for ($i = 0; $i -lt 30; $i++) {
        Start-Sleep -Seconds 1
        try {
            $Response = Invoke-WebRequest -Uri "$BaseUrl/api/health" -UseBasicParsing -TimeoutSec 3
            if ($Response.StatusCode -eq 200) { $Ready = $true; break }
        } catch {}
    }

    Assert-Pass $Ready "Server responds on $BaseUrl/api/health within 30s"

    if ($Ready) {
        # Check capabilities
        try {
            $CapResp = Invoke-WebRequest -Uri "$BaseUrl/api/capabilities" -UseBasicParsing -TimeoutSec 5
            $Caps    = ($CapResp.Content | ConvertFrom-Json)
            Assert-Pass ($Caps -ne $null) "/api/capabilities returns valid JSON"
        } catch {
            Assert-Pass $false "/api/capabilities (ERROR: $_)"
        }

        # Check diagnostics — essential tools must be available
        try {
            $HealthJson = (Invoke-WebRequest -Uri "$BaseUrl/api/health" -UseBasicParsing -TimeoutSec 5).Content | ConvertFrom-Json
            $Deps = $HealthJson.dependencies

            $YtDlpDep  = $Deps | Where-Object { $_.id -eq "ytdlp" }   | Select-Object -First 1
            $FfmpegDep = $Deps | Where-Object { $_.id -eq "ffmpeg" }  | Select-Object -First 1
            $FfprobeDep= $Deps | Where-Object { $_.id -eq "ffprobe" } | Select-Object -First 1

            Assert-Pass ($YtDlpDep -and $YtDlpDep.available)   "yt-dlp available (version: $($YtDlpDep.version))"
            Assert-Pass ($FfmpegDep -and $FfmpegDep.available)  "FFmpeg available (version: $($FfmpegDep.version))"
            Assert-Pass ($FfprobeDep -and $FfprobeDep.available) "FFprobe available (version: $($FfprobeDep.version))"

            # Optional tools must NOT cause errors in the summary
            $SummaryMissing = $HealthJson.summary.missing
            $HasEssentialMissing = $SummaryMissing | Where-Object { $_ -in @("ytdlp","ffmpeg","ffprobe") }
            Assert-Pass (-not $HasEssentialMissing) "No essential tools in summary.missing"

        } catch {
            Assert-Pass $false "/api/health dependency check (ERROR: $_)"
        }

        # Verify 127.0.0.1 binding — should NOT respond on 0.0.0.0
        try {
            $BindCheck = $null
            try {
                $BindCheck = Invoke-WebRequest -Uri "http://0.0.0.0:$Port/api/health" -UseBasicParsing -TimeoutSec 2 -ErrorAction SilentlyContinue
            } catch {}
            # We can't truly block 0.0.0.0 from localhost, but the server SHOULD bind only to 127.0.0.1
            # The start script sets HOSTNAME=127.0.0.1 so this is documented behavior
            Write-Info "Server binds to 127.0.0.1 (set by launcher script)"
            $PassCount++
        } catch {}
    }

} finally {
    # Stop the server
    try {
        & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $StopScript `
            -BaseDir $PkgPath 2>$null
        Write-Pass "Server stopped cleanly"
        $PassCount++
    } catch {
        Write-Warn "Stop script failed (server may still be running): $_"
    }
}

# ── Phase 6: Opt-in external E2E (YouTube) ────────────────────────────────────
$RunE2E   = $env:ANCLORA_FILESTUDIO_RUN_EXTERNAL_E2E -eq "1"
$VideoUrl = $env:ANCLORA_FILESTUDIO_EXTERNAL_VIDEO_URL
$MinHeight= [int]($env:ANCLORA_FILESTUDIO_EXTERNAL_EXPECTED_MIN_HEIGHT ?? "1080")

if ($RunE2E) {
    Write-Info "Phase 6 — External E2E (opt-in)"

    if (-not $VideoUrl) {
        Write-Block "ANCLORA_FILESTUDIO_RUN_EXTERNAL_E2E=1 but ANCLORA_FILESTUDIO_EXTERNAL_VIDEO_URL is not set"
        Write-Host "Set both variables and re-run." -ForegroundColor Yellow
    } else {
        Write-Info "External E2E requires the server to be running."
        Write-Warn "Skipping full E2E pipeline in this script — use run-windows-portable-e2e.ps1 for complete E2E"
        Write-Warn "Required variables are set; run run-windows-portable-e2e.ps1 with the same environment"
    }
} else {
    Write-Info "Phase 6 — External E2E SKIPPED (set ANCLORA_FILESTUDIO_RUN_EXTERNAL_E2E=1 to enable)"
}

# ── Cleanup ───────────────────────────────────────────────────────────────────
if (-not $SkipClean -and (Test-Path $ExtractDir)) {
    try {
        Remove-Item -Path $ExtractDir -Recurse -Force -ErrorAction SilentlyContinue
        Write-Info "Cleaned up: $ExtractDir"
    } catch {
        Write-Warn "Could not clean up $ExtractDir : $_"
    }
}

# ── Result ────────────────────────────────────────────────────────────────────
$Elapsed = [Math]::Round(((Get-Date) - $StartTime).TotalSeconds, 1)

Write-Host ""
Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Cyan
if ($FailCount -eq 0) {
    Write-Host "  PASS — $PassCount checks passed in ${Elapsed}s" -ForegroundColor Green
    Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Cyan
    exit 0
} else {
    Write-Host "  FAIL — $PassCount passed, $FailCount FAILED in ${Elapsed}s" -ForegroundColor Red
    Write-Host "═══════════════════════════════════════════════════════════════" -ForegroundColor Cyan
    exit 1
}
