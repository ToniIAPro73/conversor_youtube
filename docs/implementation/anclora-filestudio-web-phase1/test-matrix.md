# Web Phase 1 Test Matrix

## Unit Tests

| Area | Cases |
| --- | --- |
| Image validation | extension/MIME/header checks, size, pixel limits |
| Image encode | JPEG/PNG/WebP naming, transparency handling, JPEG background |
| Image resize | width/height, single-axis, percentage, max side, no upscaling |
| Image compression | quality presets, target-size failure warning |
| EXIF | read summary, GPS flag, strip verification |
| Batch | concurrency, per-file status, retryable failures, ZIP manifest |
| PDF ranges | `1-3`, `1,3,5`, invalid syntax, reversed ranges, empty output |
| PDF operations | merge, split, reorder order, rotate degrees, images-to-PDF |
| Capabilities | Web metadata for images/PDF/structured data, no server conversions |

## Browser/E2E Tests

| Flow | Expected |
| --- | --- |
| JPG to WebP | local download, no file upload |
| PNG transparent to WebP | transparency preserved |
| PNG to JPEG | configured background applied |
| Resize | dimensions match options |
| Strip GPS | output has no GPS when verified |
| Batch ZIP | ZIP contains outputs and `manifest.json` |
| Merge PDFs | final page count and order match |
| Split range | outputs match requested pages |
| Reorder pages | keyboard controls alter order |
| Rotate pages | rotation is persisted |
| Images to PDF | one PDF with expected page count |
| JSON to YAML | structured data still works |
| CSV to JSON | structured data still works |

## Privacy Tests

During browser conversion, intercept these APIs and fail on content upload:

- `fetch`
- `XMLHttpRequest`
- `navigator.sendBeacon`
- `WebSocket`

## Regression Tests

- Desktop build remains available.
- Vercel build excludes native binaries and Desktop-only modules.
- Capabilities do not claim server conversion support in Web mode.
