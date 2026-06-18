# Privacy Validation

## Design

All Web Phase 1 conversion paths run in the browser:

```text
File -> browser memory -> Blob -> local download
```

No file content is posted to `/api/*`, Vercel Blob, object storage, or a remote
conversion service.

## Automated Checks

`tests/vercel/web-phase1-privacy.test.ts` validates that Web Phase 1 source code:

- does not import Desktop-only modules;
- keeps `pdf-lib`, `exifr`, and `fflate` behind dynamic imports;
- does not call `fetch`, `XMLHttpRequest`, `sendBeacon`, or `WebSocket`.

## Browser Observation

Playwright local Web-mode run:

- image processing/download: passed;
- PDF merge/download: passed;
- JSON to YAML/download: passed;
- observed requests: 37;
- non-GET/HEAD file upload requests: 0.

## Preview API Evidence

`/api/capabilities` on Preview returns:

- `execution: "browser"`;
- `uploads: false`;
- `serverConversions: false`;
- image/PDF/structured data browser capabilities.
