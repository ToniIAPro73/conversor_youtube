# Vercel Web Architecture

## Profiles

`vercel-web` is separate from `desktop` and `service-vps`.

- Vercel Web: static/Next UI, browser-only conversions, public health and
  capabilities, Desktop download CTAs.
- Desktop: complete local conversion runtime with SQLite, local temp storage and
  external tools.
- Service VPS: future API/worker deployment with PostgreSQL, Redis and object
  storage.
- Local Agent: future private execution bridge for user-owned machines.

## Runtime Boundary

`src/lib/deployment-target.ts` is the canonical runtime switch. Vercel mode is
enabled with:

```text
ANCLORA_FILESTUDIO_DEPLOYMENT_TARGET=vercel
NEXT_PUBLIC_ANCLORA_FILESTUDIO_MODE=vercel-web
```

Server routes must branch on this module before importing Desktop modules. Web
mode must not import:

- `better-sqlite3`;
- `child_process`;
- `src/lib/engines/**`;
- `src/lib/jobs/universal-job-processor`;
- `src/lib/infrastructure/db/database`;
- `apps/worker`;
- `apps/local-agent`;
- packaged `dist/**` or `tools/**` binaries.

## API Surface

Allowed in Vercel:

- `GET /api/health`;
- `GET|POST /api/capabilities`.

Blocked in Vercel:

- `/api/batch`;
- `/api/download`;
- `/api/history`;
- `/api/inputs/analyze`;
- `/api/jobs`;
- `/api/metadata`.

Blocked routes return `503 DESKTOP_REQUIRED` before loading Desktop-only code.

## Browser Conversion Flow

The browser reads the selected file with File APIs, validates the format, converts
with browser-safe code, creates a `Blob`, and downloads with
`URL.createObjectURL`. File bytes are not sent to `/api/*`.

Phase 1 browser tools:

- images: JPEG, PNG, WebP conversion, compression, resize, EXIF/GPS read and
  strip, batch ZIP;
- PDF: merge, split, reorder, rotate, images to PDF;
- structured data: JSON, YAML/YML, TOML, XML, CSV, TSV.

Heavy browser libraries are dynamically imported by the tool action:

- `pdf-lib`;
- `exifr`;
- `fflate`.
