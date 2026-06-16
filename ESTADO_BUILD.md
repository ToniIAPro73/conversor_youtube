# Anclora FileStudio — Estado Actual de la Tarea (14/06/2026)

## Resumen ejecutivo

Se está desarrollando la **distribución portable de Windows** para Anclora FileStudio.  
El pipeline de build está listo y corregido. Falta ejecutarlo para generar el ZIP final.

---

## ✅ Tareas completadas

### 1. UI Premium — Selectores de formato y calidad
- `src/components/converter/format-selector.tsx` — Rediseño con gradientes cyan/violet, animated pulse dot, glassmorphism container.
- `src/components/converter/quality-selector.tsx` — Barras de calidad (1–3 barras), acentos cyan para MP3 / violet para MP4.

### 2. Configuración Next.js standalone
- `next.config.ts` — `output: "standalone"` + `images: { unoptimized: true }`.

### 3. Fixes de seguridad en spawn
- `src/lib/media/processor.ts` — `shell: false, windowsHide: true`; renombrado `process` → `proc`.
- `src/lib/media/probe.ts` — Mismo fix + handler `proc.on("error", ...)`.
- `src/lib/media/metadata.ts` — Mismo fix.

### 4. Health endpoint
- `src/app/api/health/route.ts` — Verifica ytdlp/ffmpeg/ffprobe en arranque.

### 5. Rama feature creada
- Rama: `feat/claude-windows-portable-distribution`

### 6. Scripts Windows portable
Todos en `scripts/`:

| Archivo | Descripción |
|---------|-------------|
| `build-windows-portable.sh` | Pipeline completo: descarga Node.js/yt-dlp/FFmpeg para Windows, crea ZIP + SHA256 |
| `verify-windows-portable.sh` | Verifica integridad del ZIP antes de distribuir |
| `windows-portable/start-anclora-filestudio.ps1` | Launcher PowerShell: port selection 3000–3010, health-check, abre browser |
| `windows-portable/stop-anclora-filestudio.ps1` | Cierre limpio leyendo PID file |
| `windows-portable/update-ytdlp.ps1` | Actualización atómica de yt-dlp.exe |
| `windows-portable/LEEME.template.txt` | Guía usuario final |
| `INICIAR_ANCLORA_FILESTUDIO.bat` | Launcher usuario → delega a PS1 |
| `CERRAR_ANCLORA_FILESTUDIO.bat` | Cierre usuario → delega a PS1 |
| `ACTUALIZAR_YTDLP.bat` | Actualización usuario → delega a PS1 |

### 7. Archivos auxiliares
- `.gitignore` — Añadidas exclusiones para `scripts/.cache/`, `scripts/.staging/`, ZIP y SHA256.
- `run_build_pipeline.sh` — Script bash completo del pipeline (con fix `--passWithNoTests`).
- `RUN_BUILD.bat` — Ejecutor Windows que lanza el pipeline en WSL con doble clic.

---

## ❌ Error encontrado y corregido

### Problema: vitest falla con "No test files found"
- **Causa**: `tests/` existe pero está vacío. `vitest run` sin tests devuelve exit code 1.
- **Síntoma**: Pipeline fallaba en el paso 6/8 con "BUILD FALLIDO - codigo de salida: 1".
- **Fix aplicado**: Cambiado en `run_build_pipeline.sh`:
  ```bash
  # ANTES (fallaba):
  pnpm test --run
  
  # DESPUÉS (correcto):
  pnpm test -- --passWithNoTests
  ```
  El `--` pasa `--passWithNoTests` directamente a vitest, que sale con code 0 cuando no hay tests.

---

## ⏳ Pendiente: Ejecutar el pipeline

### Estado actual
El CMD anterior se cerró. El fix ya está en `run_build_pipeline.sh`.  
Hay que volver a ejecutar `RUN_BUILD.bat`.

### Pasos restantes
1. Abrir File Explorer → navegar a `\\wsl.localhost\ubuntu\home\toni\projects\convertidor_youtube_mp3`
2. Doble clic en `RUN_BUILD.bat`
3. Confirmar dialogo de seguridad → "Ejecutar"
4. Esperar ~10–15 min (descarga de binarios ~150 MB: Node.js + yt-dlp + FFmpeg)
5. Al finalizar, obtenemos:
   - `scripts/Anclora FileStudio-Windows-x64.zip`
   - `scripts/Anclora FileStudio-Windows-x64.zip.sha256`
   - Informe con tamaño y SHA256

### Pasos del pipeline (`run_build_pipeline.sh`)
```
[1/8] Git: crear/resetear rama feature
[2/8] Staging de archivos
[3/8] pnpm install --frozen-lockfile
[4/8] pnpm lint
[5/8] pnpm typecheck
[6/8] pnpm test -- --passWithNoTests   ← corregido
[7/8] pnpm build (Next.js standalone)
[8a/8] build-windows-portable.sh       ← descarga binarios, crea ZIP
[8b/8] verify-windows-portable.sh      ← verifica integridad
Git commits
Informe final: tamaño + SHA256
```

---

## Estructura del ZIP objetivo

```
Anclora FileStudio-Windows-x64/
├── INICIAR_ANCLORA_FILESTUDIO.bat
├── CERRAR_ANCLORA_FILESTUDIO.bat
├── ACTUALIZAR_YTDLP.bat
├── LEEME.txt
├── runtime/
│   └── node.exe  (Node.js 20 LTS Windows x64, portable)
├── app/
│   ├── server.js
│   ├── node_modules/
│   └── .next/static/
├── tools/
│   ├── yt-dlp.exe
│   └── ffmpeg/
│       └── bin/
│           ├── ffmpeg.exe
│           └── ffprobe.exe
└── internal/
    ├── start-anclora-filestudio.ps1
    ├── stop-anclora-filestudio.ps1
    └── update-ytdlp.ps1
```

---

## Restricciones de seguridad (permanentes)

- App escucha SOLO en `127.0.0.1`, nunca `0.0.0.0`
- Sin `shell: true` en ningún spawn
- Sin argumentos arbitrarios de usuario
- Sin escritura fuera de la carpeta portable y temp aprobados
- Sin permisos admin, sin escritura en registro, sin servicios del sistema
- ZIP no incluye `.env.local`, credenciales ni `.git`
- Sin binarios Linux en el paquete portable
- Sin rutas hardcodeadas del desarrollador
- Siempre: `spawn(binaryPath, args, { shell: false, windowsHide: true })`

---

## Restricción de herramientas

`mcp__workspace__bash` no funciona (error UNC path en cada llamada).  
→ Operaciones de shell: usar computer use (File Explorer para ejecutar BAT).  
→ Operaciones de archivo: usar herramientas Read/Write/Edit.
