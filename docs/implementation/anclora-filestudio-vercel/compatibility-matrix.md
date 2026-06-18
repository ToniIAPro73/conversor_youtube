# Vercel Compatibility Matrix

| Capability | Vercel Web | Desktop | Future VPS |
| --- | --- | --- | --- |
| Public UI | Yes | Yes | Optional |
| Format catalog | Yes | Yes | Yes |
| Browser JSON/YAML/TOML/XML | Yes | Yes | Yes |
| Browser CSV/TSV | Yes | Yes | Yes |
| Server uploads | No | Yes | Yes |
| Persistent history | No | Yes | Yes |
| Batch server-side | No | Yes | Yes |
| YouTube metadata/download | No | Yes | No by default |
| FFmpeg media conversion | Desktop required | Yes | Yes |
| Sharp image conversion | Desktop required | Yes | Yes |
| QPDF | Desktop required | Yes | Yes |
| 7-Zip | Desktop required | Yes | Yes |
| Pandoc | Desktop required | Yes | Yes |
| LibreOffice | Desktop required | Yes | Yes |
| Calibre | Desktop required | Yes | Yes |
| Tesseract/Poppler | Desktop required | Yes | Yes |
| SQLite | No | Yes | No |
| PostgreSQL/Redis | No | No | Yes |

## Web-Safe Conversion Set

The Web target may advertise only conversions that run fully in the browser:

- JSON to YAML, TOML and XML;
- YAML to JSON, TOML and XML;
- TOML to JSON, YAML and XML;
- XML to JSON and YAML;
- CSV to TSV and JSON;
- TSV to CSV and JSON;
- JSON arrays/objects to CSV or TSV when tabular inference succeeds.

The browser implementation must reject oversized inputs, invalid syntax and
ambiguous tabular output instead of uploading data to the server.
