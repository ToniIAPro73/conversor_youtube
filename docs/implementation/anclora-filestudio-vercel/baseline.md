# Baseline Vercel Web

## Decision

Anclora FileStudio on Vercel is a `vercel-web` target. It serves the public UI, the
format catalog, honest health/capabilities endpoints, and browser-only structured
data conversions. It is not a universal conversion runtime.

## Runtime Constraints

Vercel Functions cannot be treated as the Desktop runtime:

- local filesystem persistence is unavailable outside temporary request scope;
- SQLite/WAL is not valid shared persistence;
- worker processes and long-running queues are unavailable;
- external binaries such as FFmpeg, LibreOffice, Pandoc, QPDF, 7-Zip, Calibre,
  Tesseract, Poppler and yt-dlp must not be assumed;
- server bundle size and duration limits make the full engine registry unsuitable;
- uploads to serverless functions are not enabled for Web mode.

## Area Classification

| Area | Classification | Notes |
| --- | --- | --- |
| `README.md` | VERCEL_SAFE | Needs copy that Web is limited. |
| `next.config.ts` | VERCEL_SAFE | Must avoid externalizing Desktop-only packages in Vercel build. |
| `package.json` | VERCEL_SAFE | Needs Vercel scripts and fixed pnpm version. |
| `pnpm-workspace.yaml` | DESKTOP_ONLY | Native dependency build policy remains for Desktop. |
| `.env.example` | VERCEL_SAFE | Needs explicit deployment target variables. |
| `src/app/page.tsx` | VERCEL_SAFE | Must branch UI for `vercel-web`. |
| `src/app/api/health` | VERCEL_SAFE | Must not import probes or engine registry in Vercel. |
| `src/app/api/capabilities` | VERCEL_SAFE | Must return browser/desktop-required/future-service states. |
| `src/app/api/batch` | DESKTOP_ONLY | Blocked with `DESKTOP_REQUIRED` on Vercel. |
| `src/app/api/download` | DESKTOP_ONLY | Requires SQLite/local artifacts. |
| `src/app/api/history` | DESKTOP_ONLY | Requires SQLite. |
| `src/app/api/inputs/analyze` | DESKTOP_ONLY | Requires upload storage, detection and often probes. |
| `src/app/api/jobs` | DESKTOP_ONLY | Requires SQLite, engines and job processor. |
| `src/app/api/metadata` | DESKTOP_ONLY | Requires yt-dlp. |
| `src/lib/config.ts` | DESKTOP_ONLY | Resolves local paths and binaries. |
| `src/lib/env.ts` | VERCEL_SAFE | Can parse Vercel flags without importing Node-only modules. |
| `src/lib/runtime-platform.ts` | VERCEL_SAFE | Kept for OS display; not sufficient for deployment target. |
| `src/lib/domain/format-catalog.ts` | VERCEL_SAFE | Pure catalog, safe to import in browser. |
| `src/lib/engines/**` | DESKTOP_ONLY | Uses binaries, Sharp, temp files or runtime probes. |
| `src/lib/jobs/**` | DESKTOP_ONLY | Uses DB, processors, cleanup and local state. |
| `src/lib/infrastructure/db/**` | DESKTOP_ONLY | Imports `better-sqlite3`. |
| `apps/api/**` | VPS_ONLY | Service API profile for future VPS. |
| `apps/worker/**` | VPS_ONLY | Persistent worker profile. |
| `apps/local-agent/**` | FUTURE_LOCAL_AGENT | Private execution bridge, not Vercel. |
| `packages/core/**` | VPS_ONLY | Shared service contracts/storage. |
| `packages/sdk/**` | VERCEL_SAFE | Client SDK only if not bundled into Web runtime unnecessarily. |
| `docs/implementation/anclora-filestudio-service-api/**` | VERCEL_SAFE | Reference for future VPS. |
| `scripts/acceptance/**` | DESKTOP_ONLY | Portable acceptance harness. |
| `.github/workflows/**` | VERCEL_SAFE | CI definitions only. |

## Blockers Found

- `src/app/api/health/route.ts` imports `diagnoseAllEngines` and
  `toolchainProbe` at module load.
- `src/app/api/capabilities/route.ts` imports `fs`, `CONFIG`,
  `MediaDescriptor`, and `getCapabilities` at module load.
- Desktop routes import DB/job modules at module load and need a Vercel guard
  before those imports are evaluated.
- The current UI posts files to `/api/inputs/analyze`; Web mode needs a
  browser-only path with no upload.
