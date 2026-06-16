# Anclora FileStudio Universal E2E — Test Matrix

This document defines the full test matrix for the Anclora FileStudio universal end-to-end conversion pipeline.

## Test Matrix

| ID  | Entrada | Salida/operación | Motor | Validación | Automated | Test File Location | Notes |
|-----|---------|-------------------|-------|------------|-----------|-------------------|-------|
| T01 | WAV | MP3 | FFmpeg | magic bytes + ffprobe | partial | `tests/integration/analyze-api.test.ts` (detection), `tests/unit/ffmpeg-engine.test.ts` (unit) | Requires ffmpeg binary for full E2E |
| T02 | MP4 | WebM | FFmpeg | ffprobe | partial | `tests/unit/ffmpeg-engine.test.ts` | Requires ffmpeg binary for full E2E |
| T03 | PNG | WebP | Sharp | metadata Sharp | yes | `tests/integration/capabilities-api.test.ts` (Sharp capabilities), `tests/unit/sharp-engine.test.ts` (unit) | Sharp is always available as npm dep |
| T04 | JSON | YAML | Data | parse de salida | yes | `tests/integration/capabilities-api.test.ts` (data engine caps), `tests/unit/data-engine.test.ts` (unit) | Pure TypeScript, no binary deps |
| T05 | Markdown | HTML | Pandoc | parse + contenido | partial | `tests/integration/capabilities-api.test.ts` (Pandoc capabilities) | State depends on pandoc binary availability |
| T06 | Markdown | DOCX | Pandoc | estructura ZIP DOCX | partial | `tests/unit/pandoc-engine.test.ts` | Requires pandoc binary |
| T07 | DOCX | PDF | LibreOffice | cabecera PDF | partial | `tests/unit/libreoffice-engine.test.ts` | Requires LibreOffice binary |
| T08 | PDF | linearize | QPDF | qpdf --check | partial | `tests/integration/capabilities-api.test.ts` (QPDF capabilities) | Requires qpdf binary |
| T09 | ZIP | inspección/extracción | 7-Zip | rutas y contenido | partial | `tests/integration/capabilities-api.test.ts` (7-Zip capabilities) | Requires 7z binary |
| T10 | EPUB | AZW3/MOBI | Calibre | herramienta de inspección | no | — | Calibre engine not yet implemented; deferred |
| T11 | PNG texto | TXT | Tesseract | contenido esperado | no | — | Tesseract engine not yet implemented; deferred |
| T12 | PDF texto | TXT | Poppler + Tesseract | contenido esperado | no | — | Poppler/Tesseract pipeline not yet implemented; deferred |
| T13 | 3 archivos | batch | Orquestador | estados agregados | no | — | Batch orchestrator not yet implemented; deferred |
| T14 | URL mock | MP3 | yt-dlp + FFmpeg | flujo sin red | no | — | Requires network mocking; deferred to E2E |
| T15 | UI móvil | DOCX/PDF | E2E | sin overflow | no | — | Playwright E2E; deferred |
| T16 | ZIP Windows | arranque | Portable | health + conversión | no | — | Windows portable; manual testing |

## Automated Test Status Summary

### Fully Automated (no external binary dependency)
- **T03**: PNG → WebP (Sharp) — capabilities + unit tests
- **T04**: JSON → YAML (Data engine) — capabilities + unit tests

### Partially Automated (capability lookup works; full conversion requires binary)
- **T01**: WAV → MP3 (FFmpeg) — detection and capability routing tested
- **T02**: MP4 → WebM (FFmpeg) — unit tests for command building
- **T05**: Markdown → HTML (Pandoc) — capability routing tested
- **T06**: Markdown → DOCX (Pandoc) — unit tests for command building
- **T07**: DOCX → PDF (LibreOffice) — unit tests for command building
- **T08**: PDF → linearize (QPDF) — capability routing tested
- **T09**: ZIP → inspect/extract (7-Zip) — capability routing tested

### Not Yet Automated (requires future implementation)
- **T10**: EPUB → AZW3/MOBI (Calibre) — engine not registered
- **T11**: PNG with text → TXT (Tesseract) — engine not registered
- **T12**: PDF with text → TXT (Poppler + Tesseract) — pipeline not implemented
- **T13**: Batch processing — orchestrator not implemented
- **T14**: URL mock → MP3 — requires network mocking
- **T15**: Mobile UI E2E — Playwright setup required
- **T16**: Windows portable — manual testing only

## Test Infrastructure

### Fixture Generation
- **`tests/fixtures/generate-fixtures.sh`** — Generates text-based fixtures (md, txt, html, json, yaml, csv, xml, toml)
- **`tests/fixtures/generate-binary-fixtures.mjs`** — Generates binary fixtures (png, wav) using Node.js Buffer

### Integration Tests
- **`tests/integration/analyze-api.test.ts`** — Tests the file detection pipeline with real fixture files
- **`tests/integration/capabilities-api.test.ts`** — Tests the engine registry's capability routing
- **`tests/integration/jobs-api.test.ts`** — Tests job creation validation logic

### Unit Tests (pre-existing)
- **`tests/unit/format-catalog.test.ts`** — Format catalog coverage
- **`tests/unit/engine-registry.test.ts`** — Engine registry routing
- **`tests/unit/unified-analysis.test.ts`** — Analysis result types
- **`tests/unit/ffmpeg-engine.test.ts`** — FFmpeg engine unit tests
- **`tests/unit/sharp-engine.test.ts`** — Sharp engine unit tests
- **`tests/unit/data-engine.test.ts`** — Data engine unit tests
- **`tests/unit/qpdf-engine.test.ts`** — QPDF engine (if exists)
- **`tests/unit/pandoc-engine.test.ts`** — Pandoc engine unit tests
- **`tests/unit/libreoffice-engine.test.ts`** — LibreOffice engine unit tests
- **`tests/unit/error-codes.test.ts`** — Error code system tests
- **`tests/unit/universal-job-processor.test.ts`** — Universal job processor tests
- **`tests/unit/coordinated-cleanup.test.ts`** — Cleanup coordination tests
- **`tests/unit/path-safety.test.ts`** — Path safety tests
- **`tests/unit/disk-space-check.test.ts`** — Disk space check tests
- **`tests/unit/supported-conversions.test.ts`** — Supported conversions tests
- **`tests/unit/progress-emitter.test.ts`** — Progress emitter tests

## Coverage Goals

| Category | Target | Current |
|----------|--------|---------|
| Format catalog coverage | 100% | ✅ All 50 formats tested |
| Engine capability routing | 100% | ✅ All 7 engines tested |
| File detection (magic + text) | ≥80% | ✅ All fixture types detected |
| Job creation validation | ≥90% | ✅ Valid/invalid capability, legacy compat |
| Full E2E conversion | ≥50% | ⬜ Binary-dependent conversions deferred |
