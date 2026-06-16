#!/usr/bin/env bash
# =============================================================================
# run_build_pipeline.sh — Ejecuta el pipeline completo de build para la
# distribución portable de Windows.
# =============================================================================
set -euo pipefail

LOG_FILE="/tmp/anclora-filestudio-build-$(date +%Y%m%d-%H%M%S).log"
exec > >(tee -a "$LOG_FILE") 2>&1

echo "============================================================="
echo "  Anclora FileStudio — Windows Portable Build Pipeline"
echo "  $(date)"
echo "============================================================="
echo "  Log: $LOG_FILE"
echo "============================================================="
echo ""

REPO_DIR="/home/toni/projects/convertidor_youtube_mp3"
cd "$REPO_DIR"

echo "=== [1/8] Git: crear/resetear rama feature ==="
git checkout -B feat/claude-windows-portable-distribution
echo ""

echo "=== [2/8] Staging de archivos modificados ==="
git add -A
git status --short
echo ""

echo "=== [3/8] pnpm install --frozen-lockfile ==="
pnpm install --frozen-lockfile
echo ""

echo "=== [4/8] pnpm lint ==="
pnpm lint
echo ""

echo "=== [5/8] pnpm typecheck ==="
pnpm typecheck
echo ""

echo "=== [6/8] vitest run --passWithNoTests ==="
./node_modules/.bin/vitest run --passWithNoTests
echo ""

echo "=== [7/8] pnpm build (Next.js standalone) ==="
pnpm build
echo ""

echo "=== [7b/8] Asegurar herramienta zip instalada ==="
if ! command -v zip >/dev/null 2>&1; then
  echo "  zip no encontrado, instalando..."
  sudo apt-get install -y zip
fi
echo "  zip disponible: $(zip --version | head -1)"
echo ""

echo "=== [8a/8] build-windows-portable.sh ==="
chmod +x scripts/build-windows-portable.sh
bash scripts/build-windows-portable.sh
echo ""

echo "=== [8b/8] verify-windows-portable.sh ==="
chmod +x scripts/verify-windows-portable.sh
bash scripts/verify-windows-portable.sh
echo ""

echo "============================================================="
echo "  PIPELINE COMPLETO — ahora haciendo commits git"
echo "============================================================="

# Commit 1: UI premium selectors + código de build
git add -A
git diff --cached --stat

git commit -m "feat: premium format/quality selectors UI + Next.js standalone config

- FormatSelector: gradientes cyan/violet, iconos animados, pulse dot
- QualitySelector: barras de calidad, acentos por formato, glassmorphism
- next.config.ts: output standalone + images unoptimized
- processor/probe/metadata: spawn shell:false windowsHide:true, fix proc shadowing
- api/health: endpoint de diagnóstico de dependencias" || echo "(nada que commitear)"

git add scripts/
git commit -m "feat(dist): Windows portable distribution pipeline

- scripts/build-windows-portable.sh: descarga Node.js/yt-dlp/FFmpeg Windows
- scripts/verify-windows-portable.sh: verifica ZIP antes de distribuir
- scripts/windows-portable/*.ps1: launchers PowerShell seguros
- scripts/INICIAR/CERRAR/ACTUALIZAR_YTDLP.bat: launchers de usuario
- api/health/route.ts: endpoint salud para startup check
- .gitignore: excluye caché y artefactos de build
Security: shell:false, windowsHide:true, 127.0.0.1 only" || echo "(nada que commitear)"

echo ""
echo "=== Informe final ==="
echo ""

ZIP="$REPO_DIR/scripts/Anclora FileStudio-Windows-x64.zip"
if [ -f "$ZIP" ]; then
    SIZE=$(du -sh "$ZIP" | cut -f1)
    SHA256=$(sha256sum "$ZIP" | awk '{print $1}')
    echo "  ZIP generado: scripts/Anclora FileStudio-Windows-x64.zip"
    echo "  Tamaño:       $SIZE"
    echo "  SHA256:       $SHA256"
else
    echo "  [WARN] ZIP no encontrado en $ZIP"
fi

echo ""
echo "  Git log:"
git log --oneline -5

echo ""
echo "============================================================="
echo "  BUILD PIPELINE EXITOSO"
echo "  Log completo en: $LOG_FILE"
echo "============================================================="
