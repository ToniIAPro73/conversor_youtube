# Baseline Web Phase 1

## Scope

Phase 1 promotes Anclora FileStudio Web from structured-data-only conversion to
browser-local image and PDF tools. The Desktop and portable runtimes remain the
owners of native engines, SQLite history, background jobs, and binary toolchains.

## Current State Before Implementation

- `src/components/converter/web-mode-converter.tsx` is a single structured data
  converter for JSON, YAML, TOML, XML, CSV, and TSV.
- `src/components/converter/web-file-dropzone.tsx` accepts one structured data
  file and enforces the existing 1 MB data limit.
- `src/lib/browser-conversion/**` contains browser-safe structured data parsing
  and conversion.
- `/api/health` already returns a Vercel Web health payload without native engine
  diagnostics.
- `/api/capabilities` returns browser categories for structured data only; image
  and PDF remain listed as desktop-required.
- Vercel bundle verification blocks native binaries and top-level server-only
  imports in Web API routes.

## Gaps Against Phase 1 Prompt

- Images are not the first product surface.
- PDF tools are not present in Web mode.
- Structured data is presented as the main converter instead of a secondary tool.
- No Web capability model exists for image/PDF operations.
- No browser-only limits for image/PDF size, pixels, page count, or batch count.
- No batch ZIP export or manifest exists for Web results.
- No EXIF/GPS read or strip verification exists.
- No PDF merge, split, reorder, rotate, or images-to-PDF implementation exists.
- No Phase 1 privacy tests intercept file upload channels during conversion.

## Implementation Constraints

- Web tools must process `File`, `Blob`, `ArrayBuffer`, object URLs, Canvas, and
  browser memory only.
- Web tools must not post file contents to `/api/*` or any cloud endpoint.
- Web client code must not import `better-sqlite3`, `fs`, `child_process`, native
  Sharp, FFmpeg, QPDF, LibreOffice, Pandoc, Calibre, Tesseract, Poppler, or
  `src/server/desktop-routes`.
- Heavy libraries must be dynamically imported from tool handlers, not loaded by
  the initial home bundle.
- Production deployment and PR merge require explicit authorization after Preview
  validation.

## Dependency Findings

| Package | Version Checked | License | Decision |
| --- | ---: | --- | --- |
| `pdf-lib` | 1.17.1 | MIT | Use for PDF creation/modification. |
| `exifr` | 7.1.3 | MIT | Use for EXIF/GPS/orientation reads and verification. |
| `fflate` | 0.8.3 | MIT | Use for local ZIP exports and manifests. |
| `pdfjs-dist` | 6.0.227 | Apache-2.0 | Defer in first implementation pass unless thumbnail preview can be added without destabilizing bundle/runtime. |

## Baseline Risk

The full prompt requests a broad production-grade tool suite including workers,
thumbnail rendering, fixtures for all EXIF orientations, portable regression
suites, and real Preview validation. The first implementation must keep the Web
surface honest: expose only operations backed by browser-local code and document
limitations when a prompt item cannot be fully completed in one change.
