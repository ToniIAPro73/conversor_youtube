# Native Windows validation for LibreOffice/Poppler portable regressions.
param(
    [Parameter(Mandatory = $true)]
    [string]$ZipPath,
    [string]$TempBase = $env:TEMP
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$id = [System.DateTime]::UtcNow.ToString("yyyyMMddHHmmss")
$workDir = Join-Path $TempBase ("Anclora Office Validation " + $id)
$pkgDir = Join-Path $workDir "Anclora-FileStudio-Windows-x64-Core"
$serverPort = $null

function Invoke-JsonPost {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Uri,
        [Parameter(Mandatory = $true)]
        [object]$Body
    )

    $json = $Body | ConvertTo-Json -Depth 100
    return Invoke-RestMethod -Uri $Uri -Method Post -ContentType "application/json" -Body $json -TimeoutSec 60
}

function New-MinimalDocx {
    param([Parameter(Mandatory = $true)][string]$Path)

    Add-Type -AssemblyName System.IO.Compression
    Add-Type -AssemblyName System.IO.Compression.FileSystem

    $contentTypes = @'
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>
'@

    $rels = @'
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>
'@

    $document = @'
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>Anclora FileStudio Windows LibreOffice validation</w:t></w:r></w:p>
    <w:sectPr/>
  </w:body>
</w:document>
'@

    if (Test-Path $Path) {
        Remove-Item -Force $Path
    }

    $zip = [System.IO.Compression.ZipFile]::Open($Path, [System.IO.Compression.ZipArchiveMode]::Create)
    try {
        foreach ($entry in @(
            @{ Name = "[Content_Types].xml"; Content = $contentTypes },
            @{ Name = "_rels/.rels"; Content = $rels },
            @{ Name = "word/document.xml"; Content = $document }
        )) {
            $zipEntry = $zip.CreateEntry($entry.Name)
            $writer = [System.IO.StreamWriter]::new($zipEntry.Open(), [System.Text.UTF8Encoding]::new($false))
            try {
                $writer.Write($entry.Content)
            } finally {
                $writer.Dispose()
            }
        }
    } finally {
        $zip.Dispose()
    }
}

function New-DocxWithLibreOffice {
    param(
        [Parameter(Mandatory = $true)]
        [string]$LibreOfficePath,
        [Parameter(Mandatory = $true)]
        [string]$OutputPath
    )

    $sourceHtml = Join-Path (Split-Path -Parent $OutputPath) "docx-source.html"
    [System.IO.File]::WriteAllText($sourceHtml, @'
<!doctype html>
<html>
  <head><meta charset="utf-8"><title>Anclora validation</title></head>
  <body><p>Anclora FileStudio Windows LibreOffice validation</p></body>
</html>
'@, [System.Text.UTF8Encoding]::new($false))

    $profileDir = Join-Path (Split-Path -Parent $OutputPath) ("lo-profile-" + [guid]::NewGuid().ToString("N"))
    New-Item -ItemType Directory -Force -Path $profileDir | Out-Null

    $outDir = Split-Path -Parent $OutputPath
    $expected = Join-Path $outDir "docx-source.docx"
    if (Test-Path $expected) { Remove-Item -Force $expected }
    if (Test-Path $OutputPath) { Remove-Item -Force $OutputPath }

    $args = @(
        "-env:UserInstallation=file:///$($profileDir -replace '\\','/')",
        "--headless",
        "--convert-to",
        "docx",
        "--outdir",
        $outDir,
        $sourceHtml
    )
    $output = & $LibreOfficePath @args 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "LibreOffice DOCX fixture generation failed: $output"
    }
    if (-not (Test-Path $expected)) {
        throw "LibreOffice did not generate DOCX fixture: $expected output=$output"
    }
    Move-Item -Path $expected -Destination $OutputPath -Force
    Remove-Item -Recurse -Force $profileDir -ErrorAction SilentlyContinue
}

function New-DocxWithPandoc {
    param(
        [Parameter(Mandatory = $true)]
        [string]$PandocPath,
        [Parameter(Mandatory = $true)]
        [string]$OutputPath
    )

    $sourceMarkdown = Join-Path (Split-Path -Parent $OutputPath) "docx-source.md"
    [System.IO.File]::WriteAllText($sourceMarkdown, @'
# Anclora FileStudio

Windows LibreOffice DOCX to PDF validation.
'@, [System.Text.UTF8Encoding]::new($false))

    if (Test-Path $OutputPath) { Remove-Item -Force $OutputPath }
    $output = & $PandocPath $sourceMarkdown "-o" $OutputPath 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw "Pandoc DOCX fixture generation failed: $output"
    }
    if (-not (Test-Path $OutputPath)) {
        throw "Pandoc did not generate DOCX fixture: $OutputPath output=$output"
    }
}

function Stop-Portable {
    if (-not [string]::IsNullOrWhiteSpace($pkgDir)) {
        $stopScript = Join-Path $pkgDir "internal\stop-anclora-filestudio.ps1"
        if (Test-Path $stopScript) {
            & powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $stopScript -BaseDir $pkgDir | Out-Null
        }
    }
}

try {
    Write-Host "=== Anclora FileStudio Windows Office Validation ==="
    Write-Host ("ZIP  : " + $ZipPath)
    Write-Host ("TEMP : " + $workDir)

    New-Item -ItemType Directory -Force -Path $workDir | Out-Null
    Expand-Archive -Path $ZipPath -DestinationPath $workDir -Force

    $startScript = Join-Path $pkgDir "internal\start-anclora-filestudio.ps1"
    $toolResolution = Join-Path $pkgDir "internal\tool-resolution.ps1"
    $portFile = Join-Path $pkgDir "data\anclora-filestudio.port"

    if (-not (Test-Path $startScript)) { throw "Missing start script: $startScript" }
    if (-not (Test-Path $toolResolution)) { throw "Missing tool-resolution.ps1: $toolResolution" }

    $toolSource = Get-Content -Path $toolResolution -Raw
    $sofficeComIndex = $toolSource.IndexOf("soffice.com")
    $sofficeExeIndex = $toolSource.IndexOf("soffice.exe")
    if ($sofficeComIndex -lt 0) { throw "tool-resolution.ps1 does not mention soffice.com" }
    if ($sofficeExeIndex -lt 0) { throw "tool-resolution.ps1 does not keep soffice.exe fallback" }
    if ($sofficeComIndex -gt $sofficeExeIndex) { throw "soffice.com is not prioritized before soffice.exe" }
    Write-Host "[PASS] tool-resolution prioritizes soffice.com"

    & powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $startScript -BaseDir $pkgDir -SkipBrowser
    if ($LASTEXITCODE -ne 0) { throw "Launcher failed with exit $LASTEXITCODE" }
    if (-not (Test-Path $portFile)) { throw "Port file not found: $portFile" }

    $serverPort = [int](Get-Content $portFile -Raw).Trim()
    $baseUrl = "http://127.0.0.1:$serverPort"
    $health = Invoke-RestMethod -Uri "$baseUrl/api/health" -TimeoutSec 30

    if ($health.runtime.platform -ne "win32") { throw "Expected win32 runtime, got $($health.runtime.platform)" }
    if ($health.runtime.effectivePlatform -ne "windows") {
        throw "Expected effectivePlatform=windows, got $($health.runtime.effectivePlatform)"
    }

    $healthText = $health | ConvertTo-Json -Depth 100
    if ($healthText -match "sudo apt") { throw "Windows health contains sudo apt recommendation" }

    $libreOffice = $health.dependencies | Where-Object { $_.id -eq "libreoffice" } | Select-Object -First 1
    if ($null -eq $libreOffice) { throw "LibreOffice dependency missing from health" }
    if (-not $libreOffice.available) { throw "LibreOffice is not available: $($libreOffice.error)" }
    if ([string]::IsNullOrWhiteSpace($libreOffice.version)) { throw "LibreOffice version is empty" }
    if ($libreOffice.path -notmatch "soffice\.com$") { throw "LibreOffice path is not soffice.com: $($libreOffice.path)" }
    Write-Host ("[PASS] LibreOffice available via soffice.com version " + $libreOffice.version)

    $poppler = $health.dependencies | Where-Object { $_.id -eq "poppler" } | Select-Object -First 1
    if ($null -eq $poppler) { throw "Poppler dependency missing from health" }
    if ($poppler.available) { throw "Poppler should be missing while it is not bundled" }
    if ($poppler.status -ne "missing") { throw "Expected Poppler missing, got $($poppler.status)" }
    if ($poppler.path -notmatch "pdftoppm\.exe$") { throw "Poppler path must target pdftoppm.exe on Windows: $($poppler.path)" }
    if ($poppler.recommendedAction -match "sudo apt") { throw "Poppler Windows recommendation contains sudo apt" }
    Write-Host "[PASS] Poppler missing with Windows recommendation"

    $docxPath = Join-Path $workDir "sample.docx"
    $pandocPath = Join-Path $pkgDir "tools\pandoc\pandoc.exe"
    if (-not (Test-Path $pandocPath)) { throw "Pandoc not found in portable: $pandocPath" }
    New-DocxWithPandoc -PandocPath $pandocPath -OutputPath $docxPath

    Add-Type -AssemblyName System.Net.Http
    $client = [System.Net.Http.HttpClient]::new()
    $multipart = [System.Net.Http.MultipartFormDataContent]::new()
    $stream = [System.IO.File]::OpenRead($docxPath)
    $fileContent = [System.Net.Http.StreamContent]::new($stream)
    $fileContent.Headers.ContentType = [System.Net.Http.Headers.MediaTypeHeaderValue]::Parse("application/vnd.openxmlformats-officedocument.wordprocessingml.document")
    $multipart.Add($fileContent, "file", "sample.docx")
    $analyzeResp = $client.PostAsync("$baseUrl/api/inputs/analyze", $multipart).Result
    $analyzeText = $analyzeResp.Content.ReadAsStringAsync().Result
    $stream.Dispose()
    if (-not $analyzeResp.IsSuccessStatusCode) { throw "Analyze failed: $analyzeText" }
    $analysis = $analyzeText | ConvertFrom-Json

    $capabilities = Invoke-JsonPost -Uri "$baseUrl/api/capabilities" -Body @{
        universalDescriptor = $analysis.universalDescriptor
    }
    $pdfCap = $capabilities.capabilities |
        Where-Object { $_.engineId -eq "libreoffice" -and $_.outputFormat -eq "pdf" -and $_.state -eq "available" } |
        Select-Object -First 1
    if ($null -eq $pdfCap) {
        Write-Host ("Analysis category=" + $analysis.category + " format=" + $analysis.detectedFormat)
        Write-Host ($capabilities | ConvertTo-Json -Depth 100)
        throw "No available LibreOffice DOCX to PDF capability"
    }

    $job = Invoke-JsonPost -Uri "$baseUrl/api/jobs" -Body @{
        inputId = $analysis.inputId
        capabilityId = $pdfCap.id
        format = "pdf"
        rightsConfirmed = $true
    }
    $jobId = $job.jobId
    if ([string]::IsNullOrWhiteSpace($jobId)) { throw "Job ID missing" }

    $finalStatus = $null
    for ($i = 0; $i -lt 60; $i++) {
        Start-Sleep -Seconds 1
        $finalStatus = Invoke-RestMethod -Uri "$baseUrl/api/jobs/$jobId" -TimeoutSec 10
        if ($finalStatus.status -in @("completed", "failed", "cancelled")) { break }
    }
    if ($finalStatus.status -ne "completed") {
        throw "DOCX to PDF job did not complete. status=$($finalStatus.status) error=$($finalStatus.error)"
    }

    $token = Invoke-RestMethod -Uri "$baseUrl/api/jobs/$jobId/token" -TimeoutSec 10
    $pdfPath = Join-Path $workDir "converted.pdf"
    Invoke-WebRequest -Uri ($baseUrl + $token.downloadUrl) -OutFile $pdfPath -TimeoutSec 60 | Out-Null
    $bytes = [System.IO.File]::ReadAllBytes($pdfPath)
    $magic = [System.Text.Encoding]::ASCII.GetString($bytes, 0, 5)
    if ($magic -ne "%PDF-") { throw "Downloaded conversion is not a PDF: $magic" }

    Write-Host ("[PASS] DOCX_TO_PDF_OK bytes=" + $bytes.Length)
    Write-Host "=== WINDOWS_OFFICE_VALIDATION_PASS ==="
} finally {
    Stop-Portable
}
