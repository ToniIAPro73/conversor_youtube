param(
    [string]$ZipPath,
    [string]$RepoRoot,
    [int]$Port = 3852
)

$ErrorActionPreference = "Stop"

if (-not $RepoRoot) {
    $RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
}
if (-not $ZipPath) {
    $ZipPath = Join-Path $RepoRoot "dist\windows\Anclora-FileStudio-Windows-x64-Core.zip"
}
if (-not (Test-Path $ZipPath)) {
    throw "Windows portable not found: $ZipPath"
}

$RunId = Get-Date -Format "yyyyMMdd-HHmmss"
$WorkBase = if ($env:ANCLORA_ACCEPTANCE_WORKDIR) { $env:ANCLORA_ACCEPTANCE_WORKDIR } else { Join-Path $env:TEMP "Anclora Acceptance Windows 東京" }
$WorkDir = Join-Path $WorkBase $RunId
$ExtractDir = Join-Path $WorkDir "extract"
$FixtureDir = Join-Path $WorkDir "fixtures con espacios"
$RunnerDir = Join-Path $WorkDir "runner"
$OutDir = Join-Path $RepoRoot "artifacts\acceptance\windows"

New-Item -ItemType Directory -Force -Path $ExtractDir, $FixtureDir, $RunnerDir, $OutDir | Out-Null

if ((Get-Command pnpm -ErrorAction SilentlyContinue) -and -not $RepoRoot.StartsWith("\\")) {
    Push-Location $RepoRoot
    try {
        pnpm test:acceptance:fixtures $FixtureDir
    }
    finally {
        Pop-Location
    }
}
else {
    $GeneratedFixtures = Join-Path $RepoRoot "tests\acceptance\fixtures\generated"
    $Manifest = Join-Path $GeneratedFixtures "fixture-manifest.json"
    if (-not (Test-Path $Manifest)) {
        throw "pnpm is not available in Windows and generated fixtures are missing: $Manifest"
    }
    Copy-Item -Path (Join-Path $GeneratedFixtures "*") -Destination $FixtureDir -Recurse -Force
}

Expand-Archive -Path $ZipPath -DestinationPath $ExtractDir -Force
$PkgDir = Get-ChildItem -Path $ExtractDir -Directory | Where-Object { $_.Name -like "Anclora-FileStudio-Windows-x64*" } | Select-Object -First 1
if (-not $PkgDir) {
    throw "Extracted Windows package not found"
}
$PkgPath = $PkgDir.FullName
$NodeExe = Join-Path $PkgPath "runtime\node.exe"
if (-not (Test-Path $NodeExe)) {
    throw "runtime\node.exe missing in extracted portable"
}

Copy-Item -Path (Join-Path $PSScriptRoot "*.mjs") -Destination $RunnerDir -Force

$env:ANCLORA_FILESTUDIO_PORT = "$Port"
$env:PORT = "$Port"
$startScript = Join-Path $PkgPath "internal\start-anclora-filestudio.ps1"
$stopScript = Join-Path $PkgPath "internal\stop-anclora-filestudio.ps1"
$portFile = Join-Path $PkgPath "data\anclora-filestudio.port"

try {
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $startScript -BaseDir $PkgPath -SkipBrowser
    if (Test-Path $portFile) {
        $Port = [int]((Get-Content $portFile -Raw).Trim())
    }
    $baseUrl = "http://127.0.0.1:$Port"
    & $NodeExe (Join-Path $RunnerDir "run-conversion-suite.mjs") `
        --repo-root $RepoRoot `
        --base-url $baseUrl `
        --platform windows `
        --fixtures $FixtureDir `
        --out $OutDir
    if ($LASTEXITCODE -ne 0) {
        throw "Windows acceptance suite failed with exit code $LASTEXITCODE"
    }
}
finally {
    if (Test-Path $stopScript) {
        & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $stopScript -BaseDir $PkgPath | Out-Null
    }
}
