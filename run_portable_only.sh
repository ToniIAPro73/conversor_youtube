#!/usr/bin/env bash
# =============================================================================
# run_portable_only.sh — Solo ejecuta el paso portable (8a/8b) + commits.
# Úsalo cuando lint/typecheck/test/build ya pasaron y solo falló el ZIP.
# =============================================================================
set -euo pipefail

LOG_FILE="/tmp/anclora-filestudio-portable-$(date +%Y%m%d-%H%M%S).log"
exec > >(tee -a "$LOG_FILE") 2>&1

REPO_DIR="/home/toni/projects/convertidor_youtube_mp3"
cd "$REPO_DIR"

echo "============================================================="
echo "  Anclora FileStudio — Portable Build Only"
echo "  $(date)"
echo "  Log: $LOG_FILE"
echo "============================================================="
echo ""

# Verificar que el build de Next.js ya existe
if [ ! -f ".next/standalone/server.js" ]; then
  echo "[ERROR] .next/standalone/server.js no encontrado."
  echo "        Ejecuta run_build_pipeline.sh primero."
  exit 1
fi
echo "[OK] .next/standalone/server.js encontrado — saltando pnpm build"
echo ""

echo "=== [8a/8] build-windows-portable.sh ==="
chmod +x scripts/build-windows-portable.sh
bash scripts/build-windows-portable.sh
echo ""

echo "=== [8b/8] verify-windows-portable.sh ==="
chmod +x scripts/verify-windows-portable.sh
bash scripts/verify-windows-portable.sh
echo ""

echo "=== Commits git ==="
git add -A
git commit -m "feat: premium format/quality selectors UI + Next.js standalone config

- FormatSelector: gradientes cyan/violet, iconos animados, pulse dot
- QualitySelector: barras de calidad, acentos por formato, glassmorphism
- next.config.ts: output standalone + images unoptimized
- processor/probe/metadata: spawn shell:false windowsHide:true
- api/health: endpoint de diagnóstico de dependencias" || echo "(nada que commitear en src)"

git add scripts/ run_build_pipeline.sh run_portable_only.sh ESTADO_BUILD.md
git commit -m "feat(dist): Windows portable distribution pipeline

- scripts/build-windows-portable.sh: descarga Node.js/yt-dlp/FFmpeg Windows
- scripts/verify-windows-portable.sh: verifica ZIP antes de distribuir
- scripts/windows-portable/*.ps1: launchers PowerShell seguros
- scripts/INICIAR/CERRAR/ACTUALIZAR_YTDLP.bat: launchers de usuario
- api/health/route.ts: endpoint salud para startup check
- .gitignore: excluye caché y artefactos de build
Security: shell:false, windowsHide:true, 127.0.0.1 only" || echo "(nada que commitear en scripts)"

echo ""
echo "=== Informe final ==="
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
echo "  Git log (últimos 5):"
git log --oneline -5

echo ""
echo "============================================================="
echo "  PORTABLE BUILD EXITOSO"
echo "  Log: $LOG_FILE"
echo "============================================================="
