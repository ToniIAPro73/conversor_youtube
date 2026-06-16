# smoke-windows-portable.ps1
# Native acceptance test for Anclora FileStudio Windows x64 portable.
# Validates runtime, better-sqlite3, Sharp 0.35.1, libvips 8.18.3, PNG->WebP.
# Usage: powershell.exe -ExecutionPolicy Bypass -File smoke-windows-portable.ps1 -ZipPath <path>
param(
    [Parameter(Mandatory = $true)]
    [string]$ZipPath,
    [string]$TempBase = $env:TEMP
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$Id       = [System.DateTime]::UtcNow.ToString("yyyyMMddHHmmss")
$SmokeDir = Join-Path $TempBase ("Prueba Anclora FileStudio Windows " + $Id)
$ExitCode = 0
$PkgDir = $null

try {
    if (-not (Test-Path $ZipPath)) {
        throw ("ZIP not found: " + $ZipPath)
    }
    Write-Host ""
    Write-Host "=== Anclora FileStudio - Native Windows Acceptance Test ==="
    Write-Host ("ZIP  : " + $ZipPath)
    Write-Host ("TEMP : " + $SmokeDir)
    Write-Host ""

    # ── 1. Extract ────────────────────────────────────────────────────────────
    Write-Host "[INFO] Extracting ZIP to Windows TEMP..."
    New-Item -ItemType Directory -Force -Path $SmokeDir | Out-Null
    Expand-Archive -Path $ZipPath -DestinationPath $SmokeDir -Force

    $PkgDir  = Join-Path $SmokeDir "Anclora-FileStudio-Windows-x64-Core"
    $NodeExe = Join-Path $PkgDir "runtime\node.exe"
    $AppDir  = Join-Path $PkgDir "app"
    $ServerJs = Join-Path $AppDir "server.js"
    $StartScript = Join-Path $PkgDir "internal\start-anclora-filestudio.ps1"
    $StopScript = Join-Path $PkgDir "internal\stop-anclora-filestudio.ps1"
    $PidFile = Join-Path $PkgDir "data\anclora-filestudio.pid"
    $PortFile = Join-Path $PkgDir "data\anclora-filestudio.port"
    $ErrorLog = Join-Path $PkgDir "logs\error.log"

    if (-not (Test-Path $PkgDir))  { throw ("Package root not found: " + $PkgDir)  }
    if (-not (Test-Path $NodeExe)) { throw ("node.exe not found: " + $NodeExe) }
    if (-not (Test-Path $AppDir))  { throw ("app dir not found: " + $AppDir) }
    if (-not (Test-Path $ServerJs)) { throw ("server.js not found: " + $ServerJs) }
    if (-not (Test-Path $StartScript)) { throw ("start script not found: " + $StartScript) }
    if (-not (Test-Path $StopScript)) { throw ("stop script not found: " + $StopScript) }
    Write-Host "[OK]  Extracted"
    Write-Host "[PASS] server.js exists"

    # JS paths use forward slashes to avoid PS escape issues
    $AppDirFwd = $AppDir -replace "\\", "/"

    # ── Helper ────────────────────────────────────────────────────────────────
    function Run-NodeScript {
        param([string]$JsCode, [string]$Label)
        $f = Join-Path $SmokeDir "smoke_fragment.cjs"
        [System.IO.File]::WriteAllText($f, $JsCode, [System.Text.UTF8Encoding]::new($false))
        $o = & $NodeExe $f 2>&1
        $ec = $LASTEXITCODE
        Remove-Item -Path $f -Force -ErrorAction SilentlyContinue
        if ($ec -ne 0) {
            Write-Host ("[FAIL] " + $Label + " (exit " + $ec + ")")
            $o | ForEach-Object { Write-Host ("       " + $_) }
            throw ("FAIL: " + $Label)
        }
        return $o
    }
    function Get-NormalizedPath {
        param([string]$Path)
        if ([string]::IsNullOrWhiteSpace($Path)) {
            return ""
        }
        return [System.IO.Path]::GetFullPath($Path).TrimEnd("\")
    }
    function Test-TcpPortOpen {
        param([int]$Port)
        $client = New-Object System.Net.Sockets.TcpClient
        try {
            $client.Connect("127.0.0.1", $Port)
            return $true
        } catch {
            return $false
        } finally {
            if ($client.Connected) {
                $client.Close()
            }
        }
    }
    function Stop-PortableIfNeeded {
        param([string]$PackageDir)
        if ([string]::IsNullOrWhiteSpace($PackageDir)) {
            return
        }
        $stopScript = Join-Path $PackageDir "internal\stop-anclora-filestudio.ps1"
        if (Test-Path $stopScript) {
            & powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass `
                -File $stopScript -BaseDir $PackageDir | Out-Null
        }
    }

    # ── 2. Runtime ────────────────────────────────────────────────────────────
    Write-Host "[INFO] Checking Node.js runtime..."
    $js = "var p = process;" + [char]10
    $js += "process.stdout.write('platform=' + p.platform + '\n');" + [char]10
    $js += "process.stdout.write('arch=' + p.arch + '\n');" + [char]10
    $js += "process.stdout.write('node=' + p.version + '\n');" + [char]10
    $js += "process.stdout.write('abi=' + p.versions.modules + '\n');" + [char]10
    $js += "if (p.platform !== 'win32') throw new Error('Bad platform: ' + p.platform);" + [char]10
    $js += "if (p.arch !== 'x64') throw new Error('Bad arch: ' + p.arch);" + [char]10
    $js += "if (p.versions.modules !== '137') throw new Error('Bad ABI: ' + p.versions.modules);" + [char]10
    $js += "process.stdout.write('RUNTIME_OK\n');"

    $out = Run-NodeScript -JsCode $js -Label "Runtime"
    $out | ForEach-Object { Write-Host ("  " + $_) }
    $outStr = ($out -join [char]10)
    if ($outStr -notmatch "RUNTIME_OK") { throw "RUNTIME_OK missing" }
    Write-Host "[PASS] RUNTIME_OK"

    # ── 3. better-sqlite3 ─────────────────────────────────────────────────────
    Write-Host "[INFO] Checking better-sqlite3..."
    $DbPath = (Join-Path $SmokeDir "smoke.db") -replace "\\", "/"

    $js2 = "var path = require('path');" + [char]10
    $js2 += "var Database = require(path.join('" + $AppDirFwd + "', 'node_modules', 'better-sqlite3'));" + [char]10
    $js2 += "var db = new Database('" + $DbPath + "');" + [char]10
    $js2 += "db.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, val TEXT)');" + [char]10
    $js2 += "db.prepare('INSERT INTO t (val) VALUES (?)').run('hello-windows');" + [char]10
    $js2 += "var row = db.prepare('SELECT val FROM t WHERE id=1').get();" + [char]10
    $js2 += "if (!row || row.val !== 'hello-windows') throw new Error('mismatch: ' + JSON.stringify(row));" + [char]10
    $js2 += "db.close();" + [char]10
    $js2 += "process.stdout.write('SQLITE_OK\n');"

    $out2 = Run-NodeScript -JsCode $js2 -Label "SQLite"
    $out2 | ForEach-Object { Write-Host ("  " + $_) }
    $outStr2 = ($out2 -join [char]10)
    if ($outStr2 -notmatch "SQLITE_OK") { throw "SQLITE_OK missing" }
    Write-Host "[PASS] SQLITE_OK"

    # ── 4. Sharp + PNG->WebP ──────────────────────────────────────────────────
    Write-Host "[INFO] Checking Sharp 0.35.1 / libvips 8.18.3..."
    $WebpOutFwd = (Join-Path $SmokeDir "out.webp") -replace "\\", "/"
    $WebpOutReal = Join-Path $SmokeDir "out.webp"

    $js3 = "var path = require('path');" + [char]10
    $js3 += "var sharp = require(path.join('" + $AppDirFwd + "', 'node_modules', 'sharp'));" + [char]10
    $js3 += "var vs = sharp.versions;" + [char]10
    $js3 += "process.stdout.write('sharp=' + vs.sharp + '\n');" + [char]10
    $js3 += "process.stdout.write('vips=' + vs.vips + '\n');" + [char]10
    $js3 += "if (vs.sharp !== '0.35.1') throw new Error('Wrong sharp: ' + vs.sharp);" + [char]10
    $js3 += "if (vs.vips !== '8.18.3') throw new Error('Wrong vips: ' + vs.vips);" + [char]10
    $js3 += "process.stdout.write('SHARP_OK sharp=' + vs.sharp + ' vips=' + vs.vips + '\n');" + [char]10
    $js3 += "sharp({ create: { width: 4, height: 4, channels: 3, background: { r: 255, g: 0, b: 0 } } })" + [char]10
    $js3 += "  .webp({ quality: 80 })" + [char]10
    $js3 += "  .toFile('" + $WebpOutFwd + "')" + [char]10
    $js3 += "  .then(function(i) {" + [char]10
    $js3 += "    if (i.format !== 'webp') throw new Error('format: ' + i.format);" + [char]10
    $js3 += "    if (i.size === 0) throw new Error('empty output');" + [char]10
    $js3 += "    process.stdout.write('WEBP_OK size=' + i.size + '\n');" + [char]10
    $js3 += "    process.stdout.write('NATIVE_ACCEPTANCE_WINDOWS_PASS\n');" + [char]10
    $js3 += "  })" + [char]10
    $js3 += "  .catch(function(e) { process.stderr.write(e.message + '\n'); process.exit(1); });"

    $out3 = Run-NodeScript -JsCode $js3 -Label "Sharp PNG->WebP"
    $out3 | ForEach-Object { Write-Host ("  " + $_) }
    $outStr3 = ($out3 -join [char]10)
    if ($outStr3 -notmatch "SHARP_OK")   { throw "SHARP_OK missing" }
    if ($outStr3 -notmatch "WEBP_OK")    { throw "WEBP_OK missing" }
    if ($outStr3 -notmatch "NATIVE_ACCEPTANCE_WINDOWS_PASS") { throw "NATIVE_ACCEPTANCE_WINDOWS_PASS missing" }

    # Verify WebP magic bytes
    if (Test-Path $WebpOutReal) {
        $bytes = [System.IO.File]::ReadAllBytes($WebpOutReal)
        $riff  = [System.Text.Encoding]::ASCII.GetString($bytes, 0, 4)
        $webp  = [System.Text.Encoding]::ASCII.GetString($bytes, 8, 4)
        if ($riff -eq "RIFF" -and $webp -eq "WEBP") {
            Write-Host ("  Magic: RIFF=" + $riff + " WEBP=" + $webp + " size=" + $bytes.Length + " bytes")
            Write-Host "[PASS] WEBP_OK - magic bytes verified"
        } else {
            throw ("WebP magic bytes invalid: RIFF='" + $riff + "' WEBP='" + $webp + "'")
        }
    } else {
        throw ("WebP output not found: " + $WebpOutReal)
    }

    Write-Host ""
    Write-Host "[PASS] SHARP_OK sharp=0.35.1 vips=8.18.3"

    # ── 5. Launcher regression: path with spaces + relative server.js ────────
    Write-Host "[INFO] Checking launcher from a Windows-local path with spaces..."
    if ($SmokeDir -notmatch "\s.*\s") {
        throw ("Smoke path must include at least two spaces: " + $SmokeDir)
    }

    $launcherSource = [System.IO.File]::ReadAllText($StartScript)
    if ($launcherSource -match 'ArgumentList\s*=\s*@\(\s*\$ServerJs\s*\)') {
        throw "Launcher regression: ArgumentList must not pass absolute `$ServerJs"
    }
    if ($launcherSource -notmatch 'ArgumentList\s*=\s*@\(\s*\$ServerEntry\s*\)') {
        throw "Launcher regression: ArgumentList must pass `$ServerEntry"
    }
    if ($launcherSource -notmatch "\`$ServerEntry\s*=\s*'server\.js'") {
        throw "Launcher regression: `$ServerEntry must be 'server.js'"
    }
    if ($launcherSource -notmatch 'WorkingDirectory\s*=\s*\$AppDir') {
        throw "Launcher regression: WorkingDirectory must be `$AppDir"
    }
    Write-Host "[PASS] Launcher uses relative server.js with app WorkingDirectory"

    & powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass `
        -File $StartScript -BaseDir $PkgDir -SkipBrowser
    $startExit = $LASTEXITCODE
    if ($startExit -ne 0) {
        throw ("Launcher failed with exit " + $startExit)
    }

    if (-not (Test-Path $PidFile)) { throw ("PID file not found: " + $PidFile) }
    if (-not (Test-Path $PortFile)) { throw ("Port file not found: " + $PortFile) }
    $pidStr = (Get-Content $PidFile -Raw).Trim()
    $portStr = (Get-Content $PortFile -Raw).Trim()
    if ($pidStr -notmatch "^\d+$") { throw ("Invalid PID: " + $pidStr) }
    if ($portStr -notmatch "^\d+$") { throw ("Invalid port: " + $portStr) }
    $serverPid = [int]$pidStr
    $serverPort = [int]$portStr

    $serverProcess = Get-Process -Id $serverPid -ErrorAction SilentlyContinue
    if ($null -eq $serverProcess) { throw ("Server process not found: " + $serverPid) }
    $actualNode = Get-NormalizedPath $serverProcess.Path
    $expectedNode = Get-NormalizedPath $NodeExe
    if (-not $actualNode.Equals($expectedNode, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw ("PID does not belong to bundled node.exe. expected=" + $expectedNode + " actual=" + $actualNode)
    }
    Write-Host ("[PASS] PID belongs to runtime\node.exe (" + $serverPid + ")")

    $healthUrl = "http://127.0.0.1:" + $serverPort + "/api/health"
    $healthResp = Invoke-WebRequest -Uri $healthUrl -UseBasicParsing -TimeoutSec 10 -ErrorAction Stop
    if ($healthResp.StatusCode -ne 200) {
        throw ("Health status is not 200: " + $healthResp.StatusCode)
    }
    $health = $healthResp.Content | ConvertFrom-Json
    if ($health.runtime.platform -ne "win32") {
        throw ("Health runtime platform is not win32: " + $health.runtime.platform)
    }
    if ($health.runtime.arch -ne "x64") {
        throw ("Health runtime arch is not x64: " + $health.runtime.arch)
    }
    Write-Host ("[PASS] /api/health OK via " + $healthUrl)

    Start-Sleep -Seconds 2
    $serverProcess = Get-Process -Id $serverPid -ErrorAction SilentlyContinue
    if ($null -eq $serverProcess) {
        throw "Server terminated prematurely after health check"
    }
    Write-Host "[PASS] Server remains alive after health check"

    if (Test-Path $ErrorLog) {
        $errorText = Get-Content $ErrorLog -Raw -ErrorAction SilentlyContinue
        if ($errorText -match "MODULE_NOT_FOUND") {
            throw "error.log contains MODULE_NOT_FOUND"
        }
    }
    Write-Host "[PASS] error.log has no MODULE_NOT_FOUND"

    & powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass `
        -File $StopScript -BaseDir $PkgDir | Out-Null
    Start-Sleep -Seconds 2
    if (Test-TcpPortOpen -Port $serverPort) {
        throw ("Port still open after stop: " + $serverPort)
    }
    $serverProcess = Get-Process -Id $serverPid -ErrorAction SilentlyContinue
    if ($null -ne $serverProcess) {
        throw ("Server PID still alive after stop: " + $serverPid)
    }
    Write-Host "[PASS] Stop script releases port and leaves no server process"

    Write-Host ""
    Write-Host "=== NATIVE_ACCEPTANCE_WINDOWS_PASS ==="
    $ExitCode = 0
}
catch {
    Write-Error $_.Exception.Message
    Write-Host ""
    Write-Host "=== NATIVE_ACCEPTANCE_WINDOWS_FAIL ==="
    $ExitCode = 1
}
finally {
    # Avoid making best-effort temp cleanup part of the acceptance result.
    # On WSL interop, recursive deletion of a recently stopped Windows process tree
    # can keep powershell.exe alive after the smoke already printed PASS/FAIL.
}
[Environment]::Exit($ExitCode)
