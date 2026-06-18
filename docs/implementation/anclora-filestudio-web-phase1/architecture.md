# Web Phase 1 Architecture

## Runtime Split

Anclora FileStudio has two execution profiles:

- Web: browser-only tools, Vercel-safe API metadata, no uploads, no server
  conversion runtime.
- Desktop/portable: native engines, SQLite, job history, diagnostics, binary
  probes, and acceptance suites.

The Web Phase 1 modules live under `src/lib/browser-tools` and
`src/components/web-tools`. They are client-only and must not import Desktop
modules.

## Browser Tool Layers

```text
src/lib/browser-tools/
├── common/      shared limits, file names, downloads, object URLs, ZIP helpers
├── images/      MIME checks, decode/encode/resize/compress/EXIF/batch
└── pdf/         PDF parsing, ranges, merge/split/reorder/rotate/images-to-PDF
```

```text
src/components/web-tools/
├── web-tools-shell.tsx
├── images/image-tool.tsx
├── pdf/pdf-tool.tsx
└── structured/structured-data-tool.tsx
```

## Data Flow

```text
File input -> browser validation -> in-memory transform -> Blob -> local download
```

No file content is sent to `/api/*`. API routes expose health and capability
metadata only.

## Lazy Loading

- `pdf-lib` loads only when a PDF operation runs.
- `exifr` loads only when metadata is read or verified.
- `fflate` loads only when downloading batch results as ZIP.
- Structured data libraries remain in the secondary structured tool chunk.

## Image Operations

Supported initial inputs: JPEG, PNG, WebP.

Supported initial outputs: JPEG, PNG, WebP, with AVIF detected at runtime but not
promised as universal support.

Canvas re-encoding is the metadata stripping boundary. The result is re-read with
`exifr` to verify GPS/EXIF removal when metadata stripping is requested.

## PDF Operations

`pdf-lib` is used for modification:

- merge PDFs;
- split by page/range;
- reorder pages through explicit page order;
- rotate pages;
- create PDF from images.

PDF.js thumbnail rendering is a follow-up if it cannot be introduced without
loading `pdfjs-dist` on the initial route.

## Privacy Boundary

The browser tool components must never call `fetch`, `XMLHttpRequest`,
`sendBeacon`, or `WebSocket` with file content. Tests enforce that the Phase 1
conversion path can run with those APIs intercepted.
