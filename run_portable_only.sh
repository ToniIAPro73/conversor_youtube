#!/usr/bin/env bash
# run_portable_only.sh — Empaqueta usando el build Next.js existente (no modifica Git).
# Uso: bash run_portable_only.sh [--linux | --windows | --all]
# Requiere: .next/standalone/server.js ya existe (pnpm build:desktop previo).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ ! -f "$SCRIPT_DIR/.next/standalone/server.js" ]]; then
  echo "[ERROR] .next/standalone/server.js no encontrado."
  echo "        Ejecuta: pnpm build:desktop"
  exit 1
fi

echo "[OK] .next/standalone presente — ejecutando solo paso portable"
exec bash "$SCRIPT_DIR/scripts/build-portables.sh" "${@:---linux}"
