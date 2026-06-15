# AI Agent Documentation - Link2Media Implementation

Este documento registra el proceso de implementación acumulado.

---

## Fase 1 — Implementación inicial (Gemini CLI Agent)

**Agente:** Gemini CLI Agent · **Modo:** Auto-Edit · **Rol:** Full-stack Developer & Architect

### Proceso de Desarrollo

1. **Diagnóstico y Configuración:** Verificación de dependencias (`yt-dlp`, `ffmpeg`, `ffprobe`) e inicialización del proyecto Next.js con pnpm.
2. **Arquitectura y Seguridad:** Validación de URLs de YouTube, normalización, ejecución segura de procesos y gestión de archivos.
3. **Core de Procesamiento:** Extracción de metadatos y lógica de conversión MP3/MP4 usando `yt-dlp` y `spawn`.
4. **Gestión de Trabajos:** Sistema de cola en memoria con seguimiento de estados y progreso en tiempo real.
5. **Interfaz de Usuario:** Componentes reactivos con Tailwind CSS y shadcn/ui, accesibilidad y respuesta visual.
6. **QA y Refactorización:** Corrección de errores de linting, tipos y hooks de React.

### Decisiones Técnicas

- `shell: false` en todos los spawns externos (prevención de inyección).
- Tokens criptográficos temporales para proteger acceso a archivos.
- Clean Architecture Lite: dominio / servicios / seguridad / rutas.

---

## Fase 2 — Link2Media Desktop Conversion Workspace (Claude Sonnet 4.6)

**Agente:** Claude Sonnet 4.6 · **Rama:** `feat/claude-link2media-smart-conversion`

### Objetivos

Evolución de un conversor YouTube simple a un workspace multimedia local completo.

### Fases Implementadas

| Fase | Descripción | Estado |
| --- | --- | --- |
| 0 | Auditoría baseline + creación de rama | ✅ |
| 1 | Persistencia SQLite (`better-sqlite3`, WAL, migraciones versionadas) | ✅ |
| 2 | Upload de archivos locales + ffprobe analysis (`MediaDescriptor`) | ✅ |
| 3 | Motor de capacidades determinista (`getSupportedConversions`) | ✅ |
| 4 | Formatos audio extendidos: MP3, M4A, WAV, FLAC, OGG | ✅ |
| 5 | Formatos vídeo extendidos: MP4, WebM, MKV | ✅ |
| 6 | UI mobile-first: tabs Convertir / Historial / Diagnóstico | ✅ |
| 7 | Hardening: path safety (`path.resolve + path.relative`), tokens rotativos (SHA-256 en DB) | ✅ |
| 8 | Portable Windows: better-sqlite3 prebuilt win32-x64, ABI mapping por versión Node.js | ✅ |
| 9 | Tests unitarios (30 casos): path-safety, capability matrix | ✅ |

### Decisiones Técnicas Clave

- **SQLite persistence**: `better-sqlite3` síncrono, WAL mode, `INSERT OR IGNORE` en migraciones para tolerar arranques paralelos del runtime Next.js (7 workers en build).
- **Tokens de descarga rotativos**: el procesador genera un token raw; almacena sólo el hash SHA-256. El cliente llama a `GET /api/jobs/:id/token` para obtener un token de un uso válido 15 min. El endpoint de descarga verifica hasheando el token recibido.
- **Path safety**: `ensurePathSafety()` usa `path.resolve()` + `path.relative()` + comprobación de prefijo `..` o ruta absoluta resultante. No usa `startsWith()`.
- **Motor de capacidades**: función pura `getSupportedConversions(descriptor, tools)` — sin side effects, testeable, sin upscaling, GIF desactivado si duración > 300s.
- **ESLint `react-hooks/set-state-in-effect`**: patrón aprobado: `load()` solo llama `setState` en `.then()/.catch()` (async), `refresh()` puede llamar `setState` síncronamente pero se invoca desde handlers de botón, no desde `useEffect`.
- **Tailwind v4**: clases canónicas `bg-white/3` en vez de `bg-white/[0.03]`.

### Notas para Futuros Agentes

- `JobManager` es un Singleton de proceso. Si se escala a múltiples instancias (k8s), migrar a Redis o al modo WAL + exclusive lock de SQLite.
- El directorio `data/` guarda el archivo SQLite; **no borrar** entre actualizaciones. El ZIP portable incluye el directorio vacío como placeholder.
- `better-sqlite3` requiere recompilación nativa al cambiar versión de Node.js. El script `build-windows-portable.sh` descarga el prebuilt correcto usando la tabla ABI (20→115, 22→127, 23→131, 24→137).
- Mantener `yt-dlp` actualizado: YouTube cambia su API con frecuencia. La versión portable se actualiza vía `ACTUALIZAR_YTDLP.bat`.
- No usar `--passWithNoTests` en el script `test`. Si se añaden features, añadir tests primero.
