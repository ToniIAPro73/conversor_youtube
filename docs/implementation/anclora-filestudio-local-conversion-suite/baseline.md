# Baseline — Anclora FileStudio Local Conversion Suite

## Rama base

- **Rama base usada:** `main`
- **Motivo:** No existe rama `development` ni `staging` en este repositorio. La única rama
  remota disponible es `main`.
- **Rama feature:** `feat/anclora-filestudio-local-conversion-suite`
- **Commit inicial (base):** `21ce651`

## Estructura del proyecto

```text
anclora-fileStudio/
├── src/
│   ├── app/                    # Next.js App Router (page.tsx, layout.tsx, api/)
│   ├── components/             # UI components (converter, diagnostics, history, ui/)
│   ├── i18n/                   # Mensajes ES/EN
│   └── lib/
│       ├── domain/             # Tipos canónicos (descriptors, engines, format-catalog)
│       ├── engines/            # 9 motores de conversión
│       │   ├── archive/        # 7-Zip
│       │   ├── data/           # Data Engine (TypeScript puro)
│       │   ├── document/       # Pandoc + LibreOffice
│       │   ├── ebook/          # Calibre
│       │   ├── image/          # Sharp
│       │   ├── media/          # FFmpeg/FFprobe
│       │   ├── ocr/            # Tesseract + Poppler
│       │   ├── pdf/            # QPDF
│       │   └── registry.ts     # Registro centralizado de motores
│       ├── errors/             # Códigos de error unificados (23 códigos)
│       ├── infrastructure/     # DB (better-sqlite3, WAL), process runner
│       ├── jobs/               # JobManager, batch-processor, cleanup, progress-emitter
│       ├── media/              # Procesamiento multimedia legacy
│       └── security/           # Path safety, sanitización de nombres
├── scripts/
│   ├── build-windows-portable.sh
│   ├── run_build_pipeline.sh / run_portable_only.sh
│   ├── setup-ubuntu.sh
│   ├── check-dependencies.mjs
│   ├── tool-versions.json
│   ├── INICIAR_ANCLORA_FILESTUDIO.bat
│   ├── CERRAR_ANCLORA_FILESTUDIO.bat
│   ├── DIAGNOSTICO_ANCLORA_FILESTUDIO.bat
│   └── windows-portable/       # Scripts PS1 y template LEEME
├── tests/
│   ├── unit/                   # Tests unitarios
│   ├── integration/            # Tests de integración
│   ├── e2e/                    # Tests E2E (Playwright)
│   └── fixtures/               # Archivos de muestra
├── docs/
│   ├── format-matrix.md
│   ├── user-guide.md
│   ├── third-party-licenses.md
│   └── implementation/anclora-filestudio-local-conversion-suite/
└── public/brand/               # Logo PNG + WebP con transparencia real
```

## Motores existentes

| Motor | Binario | Categorías |
|---|---|---|
| FFmpeg | `ffmpeg` + `ffprobe` | audio, video, gif, thumbnail |
| Sharp | Node.js nativo (libvips) | image |
| Data Engine | TypeScript puro | json, yaml, toml, xml, csv, tsv |
| QPDF | `qpdf` | pdf |
| 7-Zip | `7z` | archive |
| Pandoc | `pandoc` | document (md, html, rst, docx, odt) |
| LibreOffice | `libreoffice` | office → pdf, odf ↔ ooxml |
| Calibre | `ebook-convert` | epub, mobi, azw3 |
| Tesseract + Poppler | `tesseract` + `pdftoppm` | ocr |

## Formatos registrados

50 definiciones en `format-catalog.ts`:
audio (6), video (7), image (6), document (4), spreadsheet (3),
presentation (3), pdf (1), ebook (3), archive (6), structured-data (6), plain-text (5).

## Scripts disponibles

```bash
pnpm dev          # Desarrollo
pnpm build        # Build Next.js
pnpm lint         # ESLint
pnpm typecheck    # TypeScript noEmit
pnpm test         # Vitest (unitarios)
pnpm test:e2e     # Playwright
pnpm check        # lint + typecheck + test + build
pnpm check:deps   # Verificación de dependencias
pnpm cleanup      # Limpieza de temporales
```

Scripts de distribución pendientes de formalizar:

```bash
pnpm build:portable:windows   # pendiente
pnpm verify:portable:windows  # pendiente
pnpm smoke:portable:windows   # pendiente
pnpm build:portable:linux     # pendiente
pnpm verify:portable:linux    # pendiente
pnpm smoke:portable:linux     # pendiente
pnpm generate:sbom            # pendiente
pnpm audit:licenses           # pendiente
pnpm test:integration         # pendiente
pnpm test:engines             # pendiente
pnpm test:security            # pendiente
pnpm test:operations          # pendiente
pnpm test:automation          # pendiente
pnpm test:background-removal  # pendiente
pnpm test:alpha-channel       # pendiente
pnpm test:vision-pack         # pendiente
```

## Tests existentes

- `tests/unit/` — Tests unitarios con Vitest (path-safety, capability matrix)
- `tests/integration/` — Esqueleto de integración
- `tests/e2e/` — Playwright (esqueleto)
- `tests/fixtures/` — Archivos de muestra JSON, YAML; script generate-fixtures.sh

## Deuda técnica identificada

1. **Nombre anterior** — Referencias a `Link2Media` en todo el repo (resueltas en Fase 0).
2. **Variables de entorno** — Prefijo `LINK2MEDIA_` en uso (resueltas en Fase 0).
3. **Scripts de distribución** — Scripts bat/ps1 con nombre `link2media` (resueltos en Fase 0).
4. **toolchain.lock.json ausente** — Las versiones de herramientas no están fijadas con hash.
5. **Probes simulados** — El diagnóstico de algunos motores no ejecuta el binario real.
6. **Poppler no visible** — No hay probe explícito para Poppler/pdftoppm en el panel.
7. **Tests de integración vacíos** — Los tests de motores reales están pendientes.
8. **Scripts de build** mezclan Git con construcción de artefactos.
9. **Sin SBOM** — No se genera Software Bill of Materials.
10. **Sin pnpm scripts** para integración, motores, seguridad, operaciones, etc.

## Estado de dependencias

Dependencias presentes (package.json):

- `better-sqlite3` — DB local
- `sharp` — Procesamiento de imágenes
- `yt-dlp-exec` — Descarga YouTube (wrapper)
- `zod` — Validación de esquemas
- `next` 15.x — Framework
- `vitest` — Tests unitarios
- `playwright` — Tests E2E

Dependencias externas (binarios del sistema):

- `ffmpeg`/`ffprobe` — ✅ instalados vía apt/sistema
- `qpdf` — ✅
- `7z` — ✅
- `pandoc` — ✅
- `libreoffice` — ✅
- `ebook-convert` (Calibre) — verificar
- `tesseract` — ✅
- `pdftoppm` (Poppler) — verificar

## Riesgos de seguridad identificados

- Paths de herramientas deben validarse con `path.resolve` + comprobación de prefix.
- Todos los `spawn` usan `shell: false` — correcto.
- Tokens de descarga rotativos con SHA-256 — correcto.
- Necesario revisar: ratio de expansión en archives, límites de páginas PDF, timeouts.

## Riesgos de licencias

- LibreOffice: LGPL v3 — redistribución debe incluir código fuente o enlace.
- Calibre: GPL v3 — redistribución como binario separado (pack opcional).
- Tesseract: Apache 2.0 — redistribuible.
- 7-Zip: LGPL v2.1 + unRAR restriction — núcleo redistribuible, código fuente disponible.
- QPDF: Apache 2.0 — redistribuible.
- Pandoc: GPL v2+ — redistribución como binario permitida con notice.

## Elementos que no deben romperse

- Arquitectura de motores con interfaz `ConversionEngine`.
- Sistema de jobs con SQLite (WAL) y `INSERT OR IGNORE` en migraciones.
- Tokens de descarga rotativos (SHA-256).
- Path safety con `path.resolve` + `path.relative`.
- Interfaz `UniversalFileDescriptor` en `domain/descriptors.ts`.
- Catálogo de formatos en `format-catalog.ts`.
- i18n en `src/i18n/es.ts` y `src/i18n/en.ts`.
