import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function commandExists(command: string): boolean {
  try {
    execFileSync(command, ["-NoProfile", "-NonInteractive", "-Command", "$PSVersionTable.PSVersion"], {
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
}

function toWindowsPath(path: string): string {
  return execFileSync("wslpath", ["-w", path], { encoding: "utf8" }).trim();
}

const runIfPowerShell = commandExists("powershell.exe") ? it : it.skip;

describe("Windows portable tool resolution", () => {
  runIfPowerShell("resolves tools in portable, env, standard, PATH, and missing order", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "anclora-tool-resolution-"));
    const scriptPath = join(tempDir, "tool-resolution-test.ps1");
    const helperPath = toWindowsPath(join(process.cwd(), "scripts/windows-portable/tool-resolution.ps1"));

    const script = String.raw`
param([string]$HelperPath)
$ErrorActionPreference = 'Stop'
. $HelperPath

function TouchFile([string]$Path) {
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $Path) | Out-Null
  Set-Content -Path $Path -Value '' -Encoding ASCII
}

function AssertEq([string]$Label, [object]$Actual, [object]$Expected) {
  if ($Actual -ne $Expected) {
    throw "$Label expected '$Expected' but got '$Actual'"
  }
}

function ResolveTestTool([string]$PortablePath, [string]$StandardPath) {
  $params = @{
    Name = 'Tool'
    PortablePaths = @($PortablePath)
    EnvVar = 'ANCLORA_TEST_TOOL_PATH'
    StandardPaths = @($StandardPath)
    CommandNames = @('tool-from-path.exe')
  }
  Resolve-AncloraTool @params
}

$root = Join-Path $env:TEMP ('anclora-tool-resolution-' + [guid]::NewGuid().ToString('N'))
$oldPath = $env:PATH
$oldEnv = [Environment]::GetEnvironmentVariable('ANCLORA_TEST_TOOL_PATH')
try {
  $portable = Join-Path $root 'portable\tool.exe'
  $envTool = Join-Path $root 'env\tool.exe'
  $standard = Join-Path $root 'standard\tool.exe'
  $pathToolDir = Join-Path $root 'path'
  $pathTool = Join-Path $pathToolDir 'tool-from-path.exe'

  TouchFile $portable
  TouchFile $envTool
  TouchFile $standard
  TouchFile $pathTool

  [Environment]::SetEnvironmentVariable('ANCLORA_TEST_TOOL_PATH', $envTool, 'Process')
  $env:PATH = "$pathToolDir;$oldPath"

  $result = ResolveTestTool $portable $standard
  AssertEq 'portable source' $result.Source 'portable'
  AssertEq 'portable resolved' $result.Resolved $true
  $portableResult = $result

  $result = ResolveTestTool (Join-Path $root 'missing-portable.exe') $standard
  AssertEq 'env source' $result.Source 'env'
  AssertEq 'env resolved' $result.Resolved $true
  $envResult = $result

  [Environment]::SetEnvironmentVariable('ANCLORA_TEST_TOOL_PATH', (Join-Path $root 'missing-env.exe'), 'Process')
  $result = ResolveTestTool (Join-Path $root 'missing-portable.exe') $standard
  AssertEq 'standard source' $result.Source 'standard'
  AssertEq 'standard resolved' $result.Resolved $true
  $standardResult = $result

  $result = ResolveTestTool (Join-Path $root 'missing-portable.exe') (Join-Path $root 'missing-standard.exe')
  AssertEq 'path source' $result.Source 'path'
  AssertEq 'path resolved' $result.Resolved $true
  $pathResult = $result

  $env:PATH = $oldPath
  $result = ResolveTestTool (Join-Path $root 'missing-portable.exe') (Join-Path $root 'missing-standard.exe')
  AssertEq 'missing source' $result.Source 'missing'
  AssertEq 'missing resolved' $result.Resolved $false
  $missingResult = $result

  $existingWarningCount = 0
  foreach ($resolvedResult in @($portableResult, $envResult, $standardResult, $pathResult)) {
    if (-not $resolvedResult.Resolved) {
      $existingWarningCount++
    }
  }
  AssertEq 'warning count when tools exist' $existingWarningCount 0

  $missingWarningCount = 0
  if (-not $missingResult.Resolved) {
    $missingWarningCount++
  }
  AssertEq 'warning count when tools are missing' $missingWarningCount 1

  $source = Get-Content -Path $HelperPath -Raw
  foreach ($marker in @(
    'C:\Program Files\LibreOffice\program\soffice.exe',
    'C:\Program Files\Calibre2\ebook-convert.exe',
    'C:\Program Files\Tesseract-OCR\tesseract.exe',
    'C:\Program Files\Tesseract-OCR\tessdata',
    'ANCLORA_FILESTUDIO_TESSDATA_PREFIX'
  )) {
    if ($source -notlike "*$marker*") {
      throw "Missing production marker: $marker"
    }
  }

  Write-Host 'WINDOWS_TOOL_RESOLUTION_TEST_PASS'
} finally {
  $env:PATH = $oldPath
  [Environment]::SetEnvironmentVariable('ANCLORA_TEST_TOOL_PATH', $oldEnv, 'Process')
  Remove-Item -Recurse -Force $root -ErrorAction SilentlyContinue
}
`;

    writeFileSync(scriptPath, script, "utf8");

    try {
      const output = execFileSync(
        "powershell.exe",
        [
          "-NoProfile",
          "-NonInteractive",
          "-ExecutionPolicy",
          "Bypass",
          "-File",
          toWindowsPath(scriptPath),
          "-HelperPath",
          helperPath,
        ],
        { encoding: "utf8" },
      );

      expect(output).toContain("WINDOWS_TOOL_RESOLUTION_TEST_PASS");
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
