# Link2Media Universal E2E — Implementation Specification

> **Version**: 1.0
> **Date**: 2026-03-04
> **Status**: Complete (Phases 1–9)

---

## Architecture Overview

Link2Media is a local-first universal file converter built on Next.js 16 with App Router. It follows a Clean Architecture Lite approach with clear boundaries between domain, infrastructure, and presentation layers.

```
┌─────────────────────────────────────────────────────┐
│                    Presentation                       │
│  Next.js App Router + React Components (shadcn/ui)  │
│  i18n (en, es) · Mobile-first responsive UI         │
├─────────────────────────────────────────────────────┤
│                     API Layer                        │
│  /api/inputs/analyze  ·  /api/jobs  ·  /api/batch   │
│  /api/capabilities   ·  /api/history ·  /api/health  │
│  /api/download/:id   ·  /api/metadata               │
├─────────────────────────────────────────────────────┤
│                    Domain Layer                      │
│  Format Catalog (50 formats) · UniversalFileDescriptor│
│  Engine Interface · ConversionCapability · LossProfile│
│  Error Codes (23 codes) · Unified Analysis Result    │
├─────────────────────────────────────────────────────┤
│                 Engine System (9 engines)            │
│  FFmpeg · Sharp · Data · QPDF · 7-Zip · Pandoc     │
│  LibreOffice · Calibre · Tesseract                   │
├─────────────────────────────────────────────────────┤
│                Infrastructure Layer                  │
│  SQLite (better-sqlite3, WAL) · Process Runner       │
│  Job Manager · Batch Processor · Coordinated Cleanup │
│  Path Safety · Filename Sanitization · Disk Check    │
└─────────────────────────────────────────────────────┘
```

---

## Engine System Design

### ConversionEngine Interface

All engines implement the same `ConversionEngine` interface:

```typescript
interface ConversionEngine {
  readonly id: EngineId;
  readonly supportedCategories: readonly FileCategory[];

  probe(): Promise<EngineProbeResult>;
  getCapabilities(descriptor, probeResult): ConversionCapability[];
  execute(plan, onProgress?): Promise<ExecutionResult>;
  validate(outputPath, plan): Promise<ArtifactValidation>;
}
```

### Engine Lifecycle

1. **Probe**: On startup, each engine's `probe()` method checks if its required binary is available (version, path). Results are cached for 5 minutes.
2. **Capability Resolution**: When a file is analyzed, the engine registry queries all matching engines for capabilities based on the file's category and format.
3. **Execution**: When a conversion is started, the universal job processor resolves the engine, builds a `ConversionPlan`, and calls `engine.execute()`.
4. **Validation**: After execution, the engine validates the output artifact (file exists, non-zero size, format-specific checks like magic bytes).
5. **Deep Validation**: The universal job processor additionally performs deep validation (magic bytes, MIME type match).

### Engine Registry

The engine registry (`src/lib/engines/registry.ts`) is the single point of access:

- `getCapabilities(descriptor)`: Returns all capabilities for a given file descriptor across all matching engines.
- `getEngine(engineId)`: Returns a specific engine instance.
- `probeEngine(engineId)`: Returns cached probe results for a specific engine.
- `diagnoseAllEngines()`: Returns probed status of all engines (for diagnostics UI).

### Engine Probe Cache

Probe results are cached in memory with a 5-minute TTL. This avoids repeatedly checking binary availability on every request. The cache can be invalidated with `invalidateProbeCache()`.

### Capability ID Convention

Capability IDs follow the pattern: `{engineId}-{inputId}-{fromFormat}-{toFormat}`

Examples:
- `sharp-image-abc123-jpeg` → Sharp converts input abc123 to JPEG
- `data-ts-def456-json-yaml` → Data Engine converts input def456 from JSON to YAML
- `qpdf-ghi789-linearize` → QPDF linearizes PDF ghi789

---

## Job Processing Flow

### Single Job

```
1. User submits conversion request
   ↓
2. API route creates job in DB (status: queued)
   ↓
3. Universal job processor picks up job
   ↓
4. Resolve engine from conversion_id
   ↓
5. Probe engine availability
   ↓
6. Check disk space (2x input size estimate)
   ↓
7. Build ConversionPlan
   ↓
8. Execute engine (with progress callbacks)
   ↓
9. Engine validation (format-specific checks)
   ↓
10. Deep validation (magic bytes, MIME, size)
   ↓
11. Generate download token (SHA-256 hashed)
   ↓
12. Update job as completed
   ↓
13. Trigger coordinated cleanup (async)
```

### Batch Job

```
1. User submits batch request (multiple files, one capability)
   ↓
2. Create batch record in DB
   ↓
3. Create individual jobs linked to batch
   ↓
4. Process jobs with concurrency control (default: 2)
   ↓
5. Each job follows the single job flow
   ↓
6. Update batch counters after each job
   ↓
7. Final batch status: completed / partial-failure / failed / cancelled
```

### Job States

| State | Description |
|---|---|
| `queued` | Job created, waiting for processing |
| `processing` | Engine is executing the conversion |
| `verifying` | Output artifact is being validated |
| `completed` | Conversion successful, output ready for download |
| `failed` | Conversion failed (error_code + error_message stored) |
| `cancelled` | Job was cancelled by user |

---

## Security Measures

### Process Execution

- **`shell: false`**: All external processes are spawned with `shell: false` to prevent command injection.
- **No user-supplied filter strings**: FFmpeg filters, Pandoc templates, etc. are never constructed from user input.
- **Timeout**: All process executions have configurable timeouts (default: 120–300 seconds).

### Path Safety

- **`ensurePathSafety()`**: Validates all file paths using `path.resolve()` + `path.relative()` + prefix check for `..` or resulting absolute paths.
- **`sanitizeFilename()`**: Removes dangerous characters from user-supplied filenames.
- **Output isolation**: Each job gets its own subdirectory under the temp directory.

### Download Tokens

- **Raw token**: Generated with `crypto.randomBytes(32)`.
- **Storage**: Only SHA-256 hash is stored in the database.
- **Verification**: Client obtains a time-limited token via `/api/jobs/:id/token`; download endpoint verifies by hashing.
- **Single use**: Tokens are consumed after one download.

### Archive Safety

- **Path traversal**: 7-Zip engine blocks archives containing entries with `../` paths.
- **Expansion ratio**: Maximum 100x expansion ratio to prevent zip bombs.
- **Entry count**: Maximum 10,000 entries per archive.
- **Uncompressed size**: Maximum 2 GB total uncompressed.

### Image Safety

- **Mega-pixel limit**: Maximum 256 megapixels (16384×16384).
- **Animated frames**: Maximum 200 frames for animated images.
- **Metadata stripping**: EXIF and GPS metadata can be stripped for privacy.

### OCR Safety

- **Page limit**: Maximum 50 pages for PDF OCR.
- **DPI limit**: Maximum 600 DPI (default: 300).

### Disk Space

- **Pre-flight check**: Before each conversion, the processor estimates required space (2× input size) and verifies availability.

---

## i18n Approach

### Architecture

- **Message catalogs**: `src/i18n/en.ts` and `src/i18n/es.ts` contain all user-facing strings.
- **Type-safe keys**: `MessageKey` type is derived from the English catalog, ensuring all translations have the same keys.
- **Provider**: `src/i18n/index.ts` exports a context provider and `useI18n()` hook.

### Coverage

All user-facing strings in the UI are externalized:

- Navigation labels
- Source selector labels
- Analysis category names
- Loss profile labels
- Progress stage descriptions
- Error messages
- Format selector labels
- Conversion button labels
- Diagnostics panel labels
- History panel labels
- File size formatters

### Adding a New Language

1. Create `src/i18n/{lang}.ts` with the same keys as `en.ts`
2. Add the language to the provider in `src/i18n/index.ts`
3. Add a language selector to the UI

---

## Database Schema

SQLite with WAL mode, managed by `better-sqlite3`.

### Key Tables

- **`jobs`**: Conversion jobs with status, progress, input/output references, engine info, loss profile, validation results
- **`batches`**: Batch conversion records with aggregate status
- **`batch_jobs`**: Links batch records to individual jobs
- **`download_tokens`**: SHA-256 hashed tokens for secure file access

### Migration Strategy

Versioned migrations in `src/lib/infrastructure/db/database.ts` using `INSERT OR IGNORE` to tolerate parallel Next.js runtime starts.

---

## Format Catalog

The format catalog (`src/lib/domain/format-catalog.ts`) is the single source of truth for all format definitions:

- **50 format definitions** across 11 categories
- Each format defines: `id`, `category`, `inputExtensions`, `outputExtension`, `mimeTypes`, `operations`, `preferredEngineId`, `supportsPreview`, `supportsBatch`, `limits`, `mobilePortability`, `experimental`
- Derived lookups: `ALL_ALLOWED_EXTENSIONS`, `INPUT_ACCEPT_ATTR`, `FORMATS_BY_CATEGORY`, `FORMAT_BY_EXTENSION`, `MIME_TO_FORMAT`
- All other modules import from this catalog; no duplicate lists allowed

---

## Error Code System

23 error codes defined in `src/lib/errors/error-codes.ts`:

| Category | Codes |
|---|---|
| Tool availability | `TOOL_NOT_AVAILABLE`, `ENGINE_NOT_FOUND`, `ENGINE_UNAVAILABLE` |
| Input issues | `INPUT_UNSUPPORTED`, `INPUT_CORRUPTED`, `INPUT_NOT_FOUND` |
| Capability | `CAPABILITY_NOT_AVAILABLE`, `OUTPUT_FORMAT_INVALID`, `MISSING_CONVERSION_ID` |
| Process | `PROCESS_TIMEOUT`, `PROCESS_CANCELLED`, `ENGINE_EXECUTE_FAILED` |
| Validation | `ARTIFACT_VALIDATION_FAILED`, `VALIDATION_FAILED` |
| Safety | `ARCHIVE_UNSAFE`, `UNSAFE_PATH`, `INSUFFICIENT_DISK_SPACE` |
| Concurrency | `RATE_LIMITED`, `CONCURRENCY_LIMIT`, `INVALID_STATE` |
| Special | `OCR_LANGUAGE_MISSING`, `BATCH_PARTIAL_FAILURE`, `JOB_NOT_FOUND` |

Each error code has:
- A retryable classification (`isRetryable()`)
- A user-facing Spanish message (`ERROR_MESSAGES`)
- A factory function (`createAppError()`) with stage, engineId, and technicalDetail
