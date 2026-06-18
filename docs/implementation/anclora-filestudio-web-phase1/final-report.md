# Web Phase 1 Final Report

## Branch

`feat/vercel-web-phase1-images-pdf`

## Summary

Implemented Phase 1 Web foundations for browser-local image and PDF tools:

- Images first in the Web product surface.
- PDF second in the Web product surface.
- Structured data preserved under "Más herramientas".
- `/api/capabilities` now reports image/PDF/structured-data Web capabilities
  with `execution: "browser"`, `uploads: false`, and
  `serverConversions: false`.
- Browser tool code lives under `src/lib/browser-tools` and
  `src/components/web-tools`.

## Dependencies

| Package | Version | License | Use |
| --- | ---: | --- | --- |
| `pdf-lib` | 1.17.1 | MIT | Browser-local PDF creation/modification. |
| `exifr` | 7.1.3 | MIT | EXIF/GPS/orientation reading and strip verification. |
| `fflate` | 0.8.3 | MIT | Browser-local ZIP exports. |

## Implemented Operations

Images:

- JPG/PNG/WebP input validation by MIME/extension/header.
- JPG/PNG/WebP output through Canvas encoding.
- Quality control.
- Resize by width, height, max side, or percentage.
- JPEG background color for transparent sources.
- EXIF/GPS summary.
- Default "Eliminar EXIF y ubicación".
- Re-read verification after Canvas re-encode.
- Batch processing and ZIP export with `manifest.json`.

PDF:

- Merge multiple PDFs.
- Split by page/range syntax.
- Reorder pages with keyboard-accessible move buttons.
- Rotate all pages.
- Create PDF from images.
- Clear error for protected/unreadable PDF.
- Warning that modifying signed PDFs can invalidate signatures.

Structured data:

- JSON, YAML/YML, TOML, XML, CSV, TSV preserved.
- Moved to secondary "Más herramientas" tab.

## Limits

Image limits:

- max files: 50
- max bytes per file: 25 MB
- max total bytes: 150 MB
- max pixels per image: 40,000,000
- concurrency target: 2

PDF limits:

- max files: 10
- max bytes per file: 50 MB
- max total bytes: 200 MB
- max total pages: 300

## Validation

Local gates:

- `pnpm install --frozen-lockfile`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm test:vercel`
- `pnpm test:web-phase1`
- `pnpm build:vercel`
- `pnpm verify:vercel`
- `pnpm build:desktop`
- `git diff --check`
- `npx vercel build --yes`

Preview:

- URL: `https://anclora-filestudio-6yn0bm02y-pmi140979-6354s-projects.vercel.app`
- Deployment id: `dpl_AS4JnuVAZb9AgHAdM7YjvZ2h8u6c`
- `/api/health` via `vercel curl`: `status: "web-preview"`,
  `serverConversions: false`, `cloudUploads: false`.
- `/api/capabilities` via `vercel curl`: image/PDF/structured browser
  capabilities, `uploads: false`, `serverConversions: false`.
- Preview HTML via `vercel curl`: contains "Preparar imágenes",
  "Organizar PDF", "Más herramientas", and "Versión Web".

Browser validation:

- Public browser access to Preview is blocked by Vercel Deployment Protection
  with HTTP 401.
- Real browser validation was run locally in `vercel-web` mode against
  `http://localhost:3010` using Playwright.
- Flows validated: image processing/download, PDF merge/download,
  JSON to YAML/download.
- Network observation: 37 requests, 0 non-GET/HEAD file upload requests.

## Known Limitations

- PDF thumbnails via `pdfjs-dist` are deferred.
- AVIF encode detection is not exposed yet.
- EXIF orientation fixtures 1-8 were not generated in this change.
- Image target-size compression search is not implemented.
- PDF split currently returns a single range output for the entered expression.
- Signed PDF detection is surfaced as a warning, not cryptographic detection.
- Portable Linux/Windows acceptance suites were not re-run in this pass.

## Production

Production was not deployed. PR merge and Production promotion require explicit
authorization after Preview review.
