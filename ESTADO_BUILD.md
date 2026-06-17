# Anclora FileStudio — Estado de Build de Portables

> Rama de trabajo: `build/anclora-filestudio-portables`
> Última actualización: 2026-06-16

## Artefactos objetivo

| Artefacto | Ruta | Estado |
|-----------|------|--------|
| Linux portable | `dist/linux/Anclora-FileStudio-Linux-x64.tar.zst` | Pendiente |
| Linux checksum | `dist/linux/Anclora-FileStudio-Linux-x64.tar.zst.sha256` | Pendiente |
| Windows Core | `dist/windows/Anclora-FileStudio-Windows-x64-Core.zip` | Pendiente |
| Windows Core checksum | `dist/windows/Anclora-FileStudio-Windows-x64-Core.zip.sha256` | Pendiente |

## Comandos de build

```bash
# Pipeline completo
bash scripts/build-portables.sh --all

# Solo Linux
pnpm build:portable:linux

# Solo Windows (desde Linux/WSL)
pnpm build:portable:windows

# Verificar artefactos
pnpm verify:portable:linux
pnpm verify:portable:windows

# Smoke tests
pnpm smoke:portable:linux
pnpm smoke:portable:windows
```

## Restricciones de seguridad (permanentes)

- La app escucha SOLO en `127.0.0.1`, nunca `0.0.0.0`.
- Sin `shell: true` en ningún spawn de proceso externo.
- ZIP/tar no incluye `.env.local`, `.git`, credenciales ni rutas del desarrollador.
- Sin binarios Linux en el paquete Windows y viceversa.
- Sin Docker, Redis ni PostgreSQL en los portables Desktop.
- Los scripts de build no modifican Git (sin `git add`, `git commit`, `git checkout`).

## Herramientas del sistema (WSL Ubuntu 22.04)

| Herramienta | Versión instalada |
|-------------|-------------------|
| Node.js | v22.22.1 (ABI 127) |
| pnpm | 10.33.2 |
| ffmpeg | 4.4.2 |
| yt-dlp | 2026.06.09 |
| qpdf | 10.6.3 |
| 7zz | 26.01 |
| zstd | 1.5.6 (compilado, en ~/.local/bin) |

## Notas

- `zstd` no está disponible vía apt sin sudo. Se ha compilado la versión 1.5.6 desde fuente
  y está instalada en `~/.local/bin/zstd`. Los scripts lo detectan automáticamente.
- Los portables Desktop NO requieren el Service (PostgreSQL, Redis, Docker, Caddy).
- El Desktop funciona offline.
