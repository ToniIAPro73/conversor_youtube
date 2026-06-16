# Baseline — Fase 5: Anclora FileStudio Service

## Estado al inicio de la fase

- **Fecha:** 2026-06-16
- **Rama base:** `main`
- **Commit inicial:** `fd234ca` — fix: resolve duplicate key warning in ToolStatusPanel
- **Branch creada:** `feat/anclora-filestudio-service-api`
- **Tests:** 487 passing (29 test files)
- **Lint:** limpio
- **Typecheck:** limpio

## Arquitectura existente

Aplicación Next.js 16 (App Router) monolítica con:

- `src/app/api/` — 10 rutas Next.js API (batch, capabilities, download, health, history, inputs/analyze, jobs, metadata)
- `src/lib/domain/` — tipos de dominio: descriptores, motores, catálogo de formatos, operaciones, análisis unificado
- `src/lib/engines/` — 10 motores: ffmpeg-media, sharp-image, qpdf, sevenzip, pandoc, libreoffice, calibre, tesseract, background-removal, data-ts
- `src/lib/jobs/` — JobManager (SQLite singleton), BatchProcessor, FolderWatcher, RecipeManager, cleanup, progress
- `src/lib/infrastructure/` — SQLite DB, process runner
- `src/lib/security/` — path-safety, filename-sanitizer
- `src/lib/diagnostics/` — toolchain-probe
- `src/lib/config.ts` — configuración centralizada con variables de entorno
- `src/components/` — UI React: converter, diagnostics, history, shadcn/ui
- `src/i18n/` — catálogos en/es

## Dependencias clave

| Paquete | Versión | Uso |
|---|---|---|
| next | 16.2.9 | Framework Desktop |
| react | 19.2.4 | UI |
| better-sqlite3 | 12.10.1 | Persistencia Desktop |
| sharp | 0.35.1 | Procesamiento imagen |
| zod | 4.4.3 | Validación |
| yaml | 2.9.0 | Engine datos |
| csv-parse/csv-stringify | 7/6 | Engine datos |
| fast-xml-parser | 5.8.0 | Engine datos |
| smol-toml | 1.6.1 | Engine datos |
| file-type | 22.0.1 | Detección MIME |

## Hallazgos de auditoría

1. `.env.example` contiene referencias obsoletas a `Link2Media` — corregir en esta fase.
2. `docs/implementation/anclora-filestudio-local-conversion-suite/` tiene referencias a `Link2Media` en spec.md, tasks.md, baseline.md — documentado, no crítico.
3. `pnpm-workspace.yaml` existe pero no declara packages — solo configuración de builds nativos.
4. `next.config.ts` usa `output: "standalone"` — compatible con contenedor Docker.
5. No existe rama `development` — rama base es `main` (documentado en ADR-007).
6. `JobManager` es singleton por proceso — incompatible con múltiples workers sin abstracción.
7. Todos los motores usan `shell: false` — postura de seguridad correcta.
8. Tokens de descarga: solo hash SHA-256 almacenado en DB — postura correcta.
9. `ensurePathSafety()` usa `path.resolve + path.relative` — postura correcta.

## Decisión de migración

La Fase 5 usa **migración incremental**:

- El Desktop (Next.js) permanece en la raíz del repositorio durante la fase.
- Se añade `packages/` para lógica compartida (core, engines, sdk).
- Se añade `apps/api/` y `apps/worker/` para el Service.
- Se añade `apps/local-agent/` para el Local Agent.
- Se añade `deploy/vps/` para Docker Compose.
- El Desktop importa de `packages/core` vía path alias o workspace link.
- No se mueve el directorio `src/` para minimizar riesgo de regresiones.
