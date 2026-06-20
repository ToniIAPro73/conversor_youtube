# AI Agent Documentation — Anclora FileStudio Implementation

This document records the accumulated implementation process across all AI agents.

---

## Phase 1 — Initial Implementation (Gemini CLI Agent)

**Agent:** Gemini CLI Agent · **Mode:** Auto-Edit · **Role:** Full-stack Developer & Architect

### Development Process

1. **Diagnosis & Configuration:** Verified dependencies (`yt-dlp`, `ffmpeg`, `ffprobe`) and initialized the Next.js project with pnpm.
2. **Architecture & Security:** YouTube URL validation, normalization, secure process execution, and file management.
3. **Core Processing:** Metadata extraction and MP3/MP4 conversion logic using `yt-dlp` and `spawn`.
4. **Job Management:** In-memory queue system with real-time state tracking and progress reporting.
5. **User Interface:** Reactive components with Tailwind CSS and shadcn/ui, accessibility and visual feedback.
6. **QA & Refactoring:** Linting errors, types, and React hooks corrections.

### Key Technical Decisions

- `shell: false` in all external spawns (injection prevention).
- Cryptographic temporary tokens to protect file access.
- Clean Architecture Lite: domain / services / security / routes.

---

## Phase 2 — Universal Conversion Suite (Claude Sonnet 4.6)

**Agent:** Claude Sonnet 4.6 · **Branch:** `feat/claude-anclora-filestudio-smart-conversion`

### Objectives

Evolution from a simple YouTube converter to a complete local multimedia workspace.

### Sub-Phases Implemented

| Phase | Description | Status |
| --- | --- | --- |
| 0 | Baseline audit + branch creation | ✅ |
| 1 | SQLite persistence (`better-sqlite3`, WAL, versioned migrations) | ✅ |
| 2 | Local file upload + ffprobe analysis (`MediaDescriptor`) | ✅ |
| 3 | Deterministic capability engine (`getSupportedConversions`) | ✅ |
| 4 | Extended audio formats: MP3, M4A, WAV, FLAC, OGG | ✅ |
| 5 | Extended video formats: MP4, WebM, MKV | ✅ |
| 6 | Mobile-first UI: Convert / History / Diagnostics tabs | ✅ |
| 7 | Hardening: path safety (`path.resolve + path.relative`), rotating tokens (SHA-256 in DB) | ✅ |
| 8 | Windows portable: better-sqlite3 prebuilt win32-x64, ABI mapping per Node.js version | ✅ |
| 9 | Unit tests (30 cases): path-safety, capability matrix | ✅ |

### Key Technical Decisions

- **SQLite persistence**: `better-sqlite3` synchronous, WAL mode, `INSERT OR IGNORE` in migrations to tolerate parallel Next.js runtime starts (7 workers in build).
- **Rotating download tokens**: processor generates raw token; stores only SHA-256 hash. Client calls `GET /api/jobs/:id/token` for a single-use token valid 15 min. Download endpoint verifies by hashing received token.
- **Path safety**: `ensurePathSafety()` uses `path.resolve()` + `path.relative()` + prefix check for `..` or resulting absolute path. Does not use `startsWith()`.
- **Capability engine**: pure function `getSupportedConversions(descriptor, tools)` — no side effects, testable, no upscaling, GIF disabled if duration > 300s.
- **ESLint `react-hooks/set-state-in-effect`**: approved pattern: `load()` only calls `setState` in `.then()/.catch()` (async), `refresh()` can call `setState` synchronously but is invoked from button handlers, not from `useEffect`.
- **Tailwind v4**: canonical classes `bg-white/3` instead of `bg-white/[0.03]`.

---

## Phases 3–9 — Universal E2E Pipeline (Z.ai)

**Agent:** Z.ai · **Branch:** `feat/zai-anclora-filestudio-universal-e2e`

### Phase 3: Canonical Format Catalog & Unified Analysis Result

- **`src/lib/domain/format-catalog.ts`** — Single source of truth for all format definitions
  - 11 categories: audio (6), video (7), image (6), document (4), spreadsheet (3), presentation (3), pdf (1), ebook (3), archive (6), structured-data (6), plain-text (5) = **50 format definitions**
  - Derived lookups: `ALL_ALLOWED_EXTENSIONS`, `INPUT_ACCEPT_ATTR`, `FORMATS_BY_CATEGORY`, `FORMAT_BY_EXTENSION`, `MIME_TO_FORMAT`
- **`src/lib/domain/unified-analysis.ts`** — Unified analysis result types
  - Discriminated union: `RemoteUrlAnalysis | LocalMediaAnalysis | UniversalFileAnalysis`
  - `CapabilityInfo` type normalizing legacy and universal capabilities
  - Type guards and helpers

### Phase 4: Universal Processor & FFmpeg Engine

- **`src/lib/jobs/universal-job-processor.ts`** — Orchestrator for all conversion jobs
  - Recovers job from DB, resolves engine, builds plan, executes, validates, persists
  - Deep validation: magic bytes, MIME, size checks
  - Marked as completed ONLY after output validation passes
- **`src/lib/engines/media/ffmpeg-engine.ts`** — FFmpeg conversion engine
  - Audio: MP3, M4A, WAV, FLAC, OGG cross-conversion
  - Video: MP4, WebM, MKV cross-conversion
  - Extract audio from video, normalize audio (loudnorm), trim, thumbnails, GIF
- **`src/lib/engines/image/sharp-engine.ts`** — Sharp image engine
  - JPEG, PNG, WebP, AVIF, TIFF, GIF conversion
  - Resize, optimize, strip metadata
- **`src/lib/engines/data/data-engine.ts`** — Pure TypeScript data engine
  - JSON, YAML, TOML, XML, CSV, TSV cross-conversion
  - Lossless/structure-risk matrix with warnings
- **`src/lib/engines/registry.ts`** — Engine registry
  - All 9 engines registered with category routing
  - Cached probe results with 5-minute TTL
  - `getCapabilities()`, `getEngine()`, `probeEngine()`, `diagnoseAllEngines()`

### Phase 5: QPDF & 7-Zip Engines

- **`src/lib/engines/pdf/qpdf-engine.ts`** — QPDF engine
  - Linearize, extract pages, rotate, decrypt
- **`src/lib/engines/archive/sevenzip-engine.ts`** — 7-Zip engine
  - Extract, repack (ZIP/7Z/TAR), list entries
  - Safety gates: path traversal, expansion ratio, entry count limits

### Phase 6: Pandoc & LibreOffice Engines + UX

- **`src/lib/engines/document/pandoc-engine.ts`** — Pandoc engine
  - Markdown, HTML, RST, DOCX, ODT, LaTeX, plain text cross-conversion
- **`src/lib/engines/document/libreoffice-engine.ts`** — LibreOffice engine
  - Office formats → PDF, ODF ↔ OOXML cross-conversion
  - Isolated profile directory per run to avoid lockfile contention
- Universal file selector with `accept` attribute covering all 50+ formats
- Frontend handles `kind: "universal-file"` analysis results
- Diagnostics panel shows all 9 engine statuses

### Phase 7: Error Codes & i18n

- **`src/lib/errors/error-codes.ts`** — Unified error code system
  - 23 error codes with retryable classification
  - User-facing Spanish messages for all codes
- **`src/i18n/en.ts`** & **`src/i18n/es.ts`** — English and Spanish message catalogs
  - Navigation, analysis, loss profiles, progress, errors, diagnostics, history

### Phase 8: Calibre & Tesseract Engines + Batch Processing

- **`src/lib/engines/ebook/calibre-engine.ts`** — Calibre engine
  - EPUB → MOBI, AZW3, PDF; MOBI/AZW3 → EPUB; HTML/DOCX → EPUB
  - 50MB input size limit
- **`src/lib/engines/ocr/tesseract-engine.ts`** — Tesseract OCR engine
  - Image → TXT (OCR), Image → searchable PDF (OCR), PDF → TXT (via Poppler pdftoppm)
  - Language pack detection, PDF page limit (50 pages)
- **`src/lib/jobs/batch-processor.ts`** — Batch processing orchestrator
  - Configurable concurrency, partial failure handling, cancellation
  - Status tracking: pending → processing → completed/partial-failure/failed/cancelled

### Phase 9: Windows Portable & Documentation

- **`scripts/build-windows-portable.sh`** — Builds self-contained Windows x64 ZIP
  - Includes Node.js runtime, yt-dlp, FFmpeg/FFprobe, better-sqlite3 native module
  - SHA-256 checksum generation
- **`scripts/windows-portable/`** — Start/stop scripts
  - `INICIAR_ANCLORA_FILESTUDIO.bat`, `CERRAR_ANCLORA_FILESTUDIO.bat`
  - `start-anclora-filestudio.ps1`, `stop-anclora-filestudio.ps1`
  - `ACTUALIZAR_YTDLP.bat`, `update-ytdlp.ps1`

---

## Current Architecture

```
src/
├── app/
│   ├── api/                     # API routes
│   │   ├── batch/route.ts       # Batch conversion API
│   │   ├── capabilities/route.ts# Engine capabilities
│   │   ├── download/[jobId]/    # Secure file download
│   │   ├── health/route.ts      # Health check
│   │   ├── history/route.ts     # Job history
│   │   ├── inputs/analyze/      # File analysis
│   │   ├── jobs/                # Job management
│   │   └── metadata/route.ts    # YouTube metadata
│   ├── page.tsx                 # Main application page
│   └── layout.tsx               # Root layout
├── components/
│   ├── converter/               # Conversion UI components
│   ├── diagnostics/             # Tool diagnostics panel
│   ├── history/                 # Job history panel
│   └── ui/                      # shadcn/ui components
├── i18n/                        # i18n message catalogs
│   ├── en.ts                    # English
│   ├── es.ts                    # Spanish
│   └── index.ts                 # Provider
├── lib/
│   ├── detection/               # File type detection
│   ├── domain/                  # Domain types & contracts
│   │   ├── descriptors.ts       # UniversalFileDescriptor, FileCategory, LossProfile
│   │   ├── engines.ts           # ConversionEngine interface, EngineId
│   │   ├── format-catalog.ts    # 50 format definitions
│   │   └── unified-analysis.ts  # Analysis result types
│   ├── engines/                 # 9 conversion engines
│   │   ├── archive/             # 7-Zip
│   │   ├── data/                # Data Engine (TypeScript)
│   │   ├── document/            # Pandoc, LibreOffice
│   │   ├── ebook/               # Calibre
│   │   ├── image/               # Sharp
│   │   ├── media/               # FFmpeg
│   │   ├── ocr/                 # Tesseract
│   │   ├── pdf/                 # QPDF
│   │   └── registry.ts          # Engine registry
│   ├── errors/                  # Error code system
│   ├── infrastructure/          # DB, process runner
│   ├── jobs/                    # Job management
│   │   ├── batch-processor.ts   # Batch orchestration
│   │   ├── cleanup.ts           # Temporary file cleanup
│   │   ├── coordinated-cleanup.ts
│   │   ├── disk-space-check.ts
│   │   ├── job-manager.ts       # Singleton job manager
│   │   ├── progress-emitter.ts
│   │   └── universal-job-processor.ts
│   ├── media/                   # Legacy media processing
│   └── security/                # Path safety, filename sanitization
└── tests/                       # Unit and integration tests
```

---

## Notes for Future Agents

- `JobManager` is a per-process Singleton. If scaling to multiple instances (k8s), migrate to Redis or WAL + exclusive lock of SQLite.
- The `data/` directory holds the SQLite file; **do not delete** between updates. The portable ZIP includes the empty directory as placeholder.
- `better-sqlite3` requires native recompilation when changing Node.js version. The `build-windows-portable.sh` script downloads the correct prebuilt using the ABI table (20→115, 22→127, 23→131, 24→137).
- Keep `yt-dlp` updated: YouTube changes its API frequently. The portable version updates via `ACTUALIZAR_YTDLP.bat`.
- Do not use `--passWithNoTests` in the `test` script. If adding features, add tests first.
- All external process execution uses `shell: false` to prevent injection.
- The engine registry probes binary availability on startup and caches results for 5 minutes. Missing binaries gracefully degrade — the UI shows "unavailable" for affected conversions.
- The Tesseract OCR → PDF pipeline (image → searchable PDF) requires `tesseract` binary. The PDF → text OCR pipeline additionally requires Poppler (`pdftoppm`).
