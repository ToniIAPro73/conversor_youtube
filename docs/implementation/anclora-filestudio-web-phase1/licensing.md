# Web Phase 1 Licensing

## Selected Dependencies

| Package | License | Runtime | Reason |
| --- | --- | --- | --- |
| `pdf-lib` | MIT | Browser dynamic import | Pure JavaScript PDF creation and modification. |
| `exifr` | MIT | Browser dynamic import | EXIF, GPS, orientation and verification reads from `File`/`Blob`. |
| `fflate` | MIT | Browser dynamic import | Small browser ZIP generation for batch exports. |

## Deferred Dependencies

| Package | License | Reason |
| --- | --- | --- |
| `pdfjs-dist` | Apache-2.0 | Useful for thumbnails, but deferred if worker setup or bundle impact conflicts with the first Preview gate. |
| `@dnd-kit/*` | MIT | Native buttons and explicit order controls are enough for first accessible reorder implementation. |

## Rejected Approaches

- Native Sharp, QPDF, Poppler, LibreOffice, Pandoc, Calibre, Tesseract, FFmpeg:
  Desktop-only and prohibited in the Vercel Web graph.
- Cloud conversion APIs or storage buckets: prohibited because Phase 1 requires
  local browser processing and zero file uploads.
- SVG-active processing: out of scope because active SVG content is not accepted
  in this phase.
