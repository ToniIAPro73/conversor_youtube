# Performance Report

## Bundle Strategy

- `pdf-lib`, `exifr`, and `fflate` are used through dynamic `import()` inside
  execution functions.
- Native Desktop engines remain outside Web Phase 1 components.
- `pnpm verify:vercel` passed and found no forbidden native binaries in the
  Vercel bundle.

## Observed Build Data

Vercel Preview deployment:

- Deployment: `dpl_AS4JnuVAZb9AgHAdM7YjvZ2h8u6c`
- Preview route lambda reported by `vercel inspect`: `index` 989.7 KB.
- Preview HTML fetched through `vercel curl /`: 21,880 bytes.

## Runtime Limits

The implementation uses conservative limits:

- image max total bytes: 150 MB;
- image max pixels per file: 40 MP;
- PDF max total bytes: 200 MB;
- PDF max total pages: 300.

Batch image processing yields back to the event loop between files. Worker-based
processing remains a follow-up.
