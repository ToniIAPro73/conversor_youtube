#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
PS1_PATH="$SCRIPT_DIR/run-windows-portable-e2e.ps1"

if command -v wslpath >/dev/null 2>&1 && command -v powershell.exe >/dev/null 2>&1; then
  powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass \
    -File "$(wslpath -w "$PS1_PATH")" \
    -RepoRoot "$(wslpath -w "$REPO_ROOT")"
else
  pwsh -NoProfile -NonInteractive -ExecutionPolicy Bypass \
    -File "$PS1_PATH" \
    -RepoRoot "$REPO_ROOT"
fi
