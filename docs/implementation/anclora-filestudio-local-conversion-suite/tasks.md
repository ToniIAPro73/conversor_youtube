# Tareas — Anclora FileStudio Local Conversion Suite

## Fase 0 — Saneamiento y rebranding

- [x] Crear rama `feat/anclora-filestudio-local-conversion-suite` desde `main`
- [x] Publicar rama remota con seguimiento
- [x] Crear estructura SDD `docs/implementation/anclora-filestudio-local-conversion-suite/`
- [x] Renombrar archivos bat/ps1 con nombre canónico (`git mv`)
- [x] Renombrar directorio `link2media-universal-e2e` → migrando contenido al nuevo
- [x] Renombrar docs con nombre antiguo (`git mv`)
- [x] Reemplazar todas las referencias `Link2Media`/`link2media`/`LINK2MEDIA` en código
- [x] Migrar variables de entorno `LINK2MEDIA_*` → `ANCLORA_FILESTUDIO_*` en env.ts y config.ts
- [x] Actualizar `package.json` (`name: "anclora-filestudio"`)
- [x] Verificación final: 0 referencias residuales en archivos git-tracked
- [ ] Gate: lint + typecheck + test + build
- [ ] Commit y push de Fase 0

## Fase 1 — Fiabilidad, diagnóstico y toolchain reproducible

- [ ] Crear `scripts/toolchain.lock.json` con versiones y SHA256 de todas las herramientas
- [ ] Refactorizar probes en `registry.ts` para ejecutar binarios reales
- [ ] Añadir probe explícito para Poppler/pdftoppm
- [ ] Añadir estados: available, missing, version-mismatch, broken, timeout
- [ ] Refactorizar `/api/health` con versión, plataforma, arch, build ID
- [ ] Refactorizar `/api/capabilities` para publicar solo operaciones con deps resueltas
- [ ] Actualizar `ToolStatusPanel` con agrupación: Runtime/Motores/Herramientas/Paquetes/Capacidades
- [ ] Reescribir `scripts/setup-ubuntu.sh` idempotente y consciente de versiones
- [ ] Añadir scripts `pnpm test:integration`, `test:engines`, `test:security` en `package.json`
- [ ] Implementar tests de integración con binarios reales (mínimo 11 casos)
- [ ] Crear `docs/toolchain.md` y `docs/security.md`
- [ ] Gate: lint + typecheck + test + test:integration + test:engines + test:security + build
- [ ] Commit y push de Fase 1

## Fase 2 — Distribución Windows y Linux

- [ ] Reescribir `scripts/build-windows-portable.sh` con identidad canónica
- [ ] Crear `scripts/build-linux-portable.sh`
- [ ] Crear scripts `pnpm build:portable:windows`, `verify:portable:windows`, `smoke:portable:windows`
- [ ] Crear scripts `pnpm build:portable:linux`, `verify:portable:linux`, `smoke:portable:linux`
- [ ] Crear template `manifest.json` con schema completo
- [ ] Crear `THIRD_PARTY_NOTICES.txt` con todas las licencias de terceros
- [ ] Añadir script `pnpm generate:sbom` (CycloneDX JSON)
- [ ] Añadir script `pnpm audit:licenses`
- [ ] Actualizar scripts PS1 con identidad canónica
- [ ] Crear `docs/portable-windows.md` y `docs/portable-linux.md`
- [ ] Gate: todos los anteriores + distribuciones verificadas
- [ ] Commit y push de Fase 2

## Fase 3 — Toolkit avanzado y automatización

- [ ] Crear `src/lib/domain/operations.ts` con `OperationDefinition` interface
- [ ] Ampliar motor QPDF: fusionar, dividir, extraer páginas, rotar, redacción permanente
- [ ] Ampliar motor Sharp: SVG→PNG/PDF, favicon, resize/crop/rotate, batch
- [ ] Ampliar motor FFmpeg: corte, normalización EBU R128, subtítulos, tamaño objetivo
- [ ] Crear `src/lib/jobs/recipe-manager.ts` — sistema de recetas versionadas
- [ ] Crear `src/lib/jobs/watcher.ts` — carpetas vigiladas sin bucles
- [ ] Actualizar UI: flujo Origen → Operación → Opciones → Vista previa → Ejecutar → Resultado
- [ ] Añadir scripts `pnpm test:operations` y `test:automation` en package.json
- [ ] Crear tests por cada nueva operación
- [ ] Actualizar `docs/format-matrix.md` y `docs/user-guide.md`
- [ ] Gate: lint + typecheck + todos los tests + build + check:deps
- [ ] Commit y push de Fase 3

## Fase 4 — Background removal y canal alfa real

- [ ] Crear `src/lib/engines/background/background-removal-engine.ts`
- [ ] Implementar modo determinista: BFS flood fill, protección de interiores, eliminación de halos
- [ ] Seleccionar modelo ONNX con licencia compatible (verificar: licencia, tamaño, redistribución)
- [ ] Implementar modo IA local con fallback al modo determinista
- [ ] Validación post-job: alpha existe, píxel transparente, magic bytes, no-tablero
- [ ] Crear editor de máscara en UI (pincel conservar/eliminar, zoom, undo/redo)
- [ ] Implementar batch: múltiples imágenes, ZIP de resultados, informe de confianza
- [ ] Añadir scripts `pnpm test:background-removal`, `test:alpha-channel`, `test:vision-pack`
- [ ] Crear fixtures de test: tablero 8×8, 16×16, logotipo, cabello, sombras, PNG con alfa existente
- [ ] Actualizar distribuciones de Fase 2 para incluir Vision Pack
- [ ] Actualizar SBOM y licencias
- [ ] Gate: todos los tests + distribuciones + smoke tests
- [ ] Commit y push de Fase 4
