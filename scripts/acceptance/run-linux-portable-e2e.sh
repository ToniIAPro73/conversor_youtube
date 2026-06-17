#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
TAR_FILE="${ANCLORA_LINUX_PORTABLE:-$REPO_ROOT/dist/linux/Anclora-FileStudio-Linux-x64.tar.zst}"
WORK_BASE="${ANCLORA_ACCEPTANCE_WORKDIR:-/tmp/Anclora Acceptance Linux 東京}"
RUN_ID="$(date -u +%Y%m%d-%H%M%S)"
WORK_DIR="$WORK_BASE/$RUN_ID"
EXTRACT_DIR="$WORK_DIR/extract"
FIXTURE_DIR="$WORK_DIR/fixtures con espacios"
RUNNER_DIR="$WORK_DIR/runner"
OUT_DIR="$REPO_ROOT/artifacts/acceptance/linux"
PORT="${ANCLORA_FILESTUDIO_PORT:-3851}"

[[ -f "$TAR_FILE" ]] || { echo "Linux portable not found: $TAR_FILE" >&2; exit 1; }
command -v zstd >/dev/null 2>&1 || { echo "zstd is required to extract the Linux portable" >&2; exit 1; }

pnpm --dir "$REPO_ROOT" test:acceptance:fixtures "$FIXTURE_DIR"

mkdir -p "$EXTRACT_DIR" "$RUNNER_DIR" "$OUT_DIR"
tar --use-compress-program=zstd -xf "$TAR_FILE" -C "$EXTRACT_DIR"
PKG_DIR="$(find "$EXTRACT_DIR" -maxdepth 1 -type d -name 'Anclora-FileStudio-Linux-x64' | head -1)"
[[ -n "$PKG_DIR" ]] || { echo "Extracted Linux package not found" >&2; exit 1; }

cp "$SCRIPT_DIR"/*.mjs "$RUNNER_DIR/"

cleanup() {
  if [[ -n "${PKG_DIR:-}" && -x "$PKG_DIR/stop-anclora-filestudio.sh" ]]; then
    "$PKG_DIR/stop-anclora-filestudio.sh" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

ANCLORA_FILESTUDIO_PORT="$PORT" "$PKG_DIR/start-anclora-filestudio.sh"

"$PKG_DIR/runtime/node" "$RUNNER_DIR/run-conversion-suite.mjs" \
  --repo-root "$REPO_ROOT" \
  --base-url "http://127.0.0.1:$PORT" \
  --platform linux \
  --fixtures "$FIXTURE_DIR" \
  --out "$OUT_DIR"
