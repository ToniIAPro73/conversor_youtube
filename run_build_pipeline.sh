#!/usr/bin/env bash
# run_build_pipeline.sh — Ejecuta el pipeline completo de build (no modifica Git).
# Uso: bash run_build_pipeline.sh [--linux | --windows | --all]
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec bash "$SCRIPT_DIR/scripts/build-portables.sh" "$@"
