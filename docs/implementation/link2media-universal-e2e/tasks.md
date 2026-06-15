# Link2Media Universal E2E — Implementation Tasks

> **Branch**: `feat/zai-link2media-universal-e2e`
> **Last updated**: 2026-03-04

---

## Phase 1: Canonical Format Catalog & Unified Analysis Result

| Task ID | Description | Status | Evidence |
|---|---|---|---|
| L2M-P1-001 | FormatDefinition interface | done | `src/lib/domain/format-catalog.ts` |
| L2M-P1-002 | 50 format definitions (11 categories) | done | `src/lib/domain/format-catalog.ts` — audio(6), video(7), image(6), document(4), spreadsheet(3), presentation(3), pdf(1), ebook(3), archive(6), structured-data(6), plain-text(5) |
| L2M-P1-003 | Derived lookups (ALL_ALLOWED_EXTENSIONS, etc.) | done | `src/lib/domain/format-catalog.ts` |
| L2M-P1-004 | Unified analysis result types | done | `src/lib/domain/unified-analysis.ts` |
| L2M-P1-005 | CapabilityInfo type normalization | done | `src/lib/domain/unified-analysis.ts` |
| L2M-P1-006 | Type guards and helpers | done | `src/lib/domain/unified-analysis.ts` |
| L2M-P1-007 | Format catalog unit tests (21 tests) | done | `tests/unit/format-catalog.test.ts` |
| L2M-P1-008 | Unified analysis unit tests (20 tests) | done | `tests/unit/unified-analysis.test.ts` |

## Phase 2: Universal Processor & Engine Registry

| Task ID | Description | Status | Evidence |
|---|---|---|---|
| L2M-P2-001 | ConversionEngine interface | done | `src/lib/domain/engines.ts` |
| L2M-P2-002 | EngineId type (9 engines) | done | `src/lib/domain/engines.ts` |
| L2M-P2-003 | Engine registry with probe cache | done | `src/lib/engines/registry.ts` |
| L2M-P2-004 | Universal job processor | done | `src/lib/jobs/universal-job-processor.ts` |
| L2M-P2-005 | Deep validation (magic bytes, MIME) | done | `src/lib/jobs/universal-job-processor.ts` — `validateOutputArtifact()` |
| L2M-P2-006 | Download token generation (SHA-256) | done | `src/lib/jobs/universal-job-processor.ts` |
| L2M-P2-007 | Log redaction | done | `src/lib/jobs/universal-job-processor.ts` — `redact()` |
| L2M-P2-008 | Engine ID extraction from capability ID | done | `src/lib/jobs/universal-job-processor.ts` — `extractEngineIdFromConversionId()` |
| L2M-P2-009 | Universal job processor tests (29 tests) | done | `tests/unit/universal-job-processor.test.ts` |
| L2M-P2-010 | Engine registry tests | done | `tests/unit/engine-registry.test.ts` |

## Phase 3: FFmpeg Engine

| Task ID | Description | Status | Evidence |
|---|---|---|---|
| L2M-P3-001 | FFmpeg engine implementation | done | `src/lib/engines/media/ffmpeg-engine.ts` |
| L2M-P3-002 | Audio format conversion (MP3, M4A, WAV, FLAC, OGG) | done | `src/lib/engines/media/ffmpeg-engine.ts` — `AUDIO_FORMATS` |
| L2M-P3-003 | Video format conversion (MP4, WebM, MKV) | done | `src/lib/engines/media/ffmpeg-engine.ts` — `VIDEO_FORMATS` |
| L2M-P3-004 | Extract audio from video | done | `src/lib/engines/media/ffmpeg-engine.ts` — `extract-audio` operation |
| L2M-P3-005 | Normalize audio (loudnorm) | done | `src/lib/engines/media/ffmpeg-engine.ts` |
| L2M-P3-006 | Trim/cut operation | done | `src/lib/engines/media/ffmpeg-engine.ts` |
| L2M-P3-007 | Thumbnail/frame extraction | done | `src/lib/engines/media/ffmpeg-engine.ts` |
| L2M-P3-008 | GIF creation (with 300s limit) | done | `src/lib/engines/media/ffmpeg-engine.ts` |
| L2M-P3-009 | FFmpeg engine unit tests | done | `tests/unit/ffmpeg-engine.test.ts` |

## Phase 4: Sharp Image Engine

| Task ID | Description | Status | Evidence |
|---|---|---|---|
| L2M-P4-001 | Sharp engine implementation | done | `src/lib/engines/image/sharp-engine.ts` |
| L2M-P4-002 | JPEG/PNG/WebP/AVIF/TIFF/GIF output | done | `src/lib/engines/image/sharp-engine.ts` — `SUPPORTED_OUTPUT_FORMATS` |
| L2M-P4-003 | Resize with fit modes | done | `src/lib/engines/image/sharp-engine.ts` — resize in `execute()` |
| L2M-P4-004 | Quality presets | done | `src/lib/engines/image/sharp-engine.ts` — `buildPresets()` |
| L2M-P4-005 | Metadata stripping | done | `src/lib/engines/image/sharp-engine.ts` — `stripMetadata` option |
| L2M-P4-006 | Alpha handling (transparency → white for JPEG) | done | `src/lib/engines/image/sharp-engine.ts` |
| L2M-P4-007 | Safety limits (256 MP, 200 frames) | done | `src/lib/engines/image/sharp-engine.ts` — `MAX_MEGAPIXELS`, `MAX_ANIMATED_FRAMES` |
| L2M-P4-008 | Sharp engine unit tests (15 tests) | done | `tests/unit/sharp-engine.test.ts` |

## Phase 5: Data Engine

| Task ID | Description | Status | Evidence |
|---|---|---|---|
| L2M-P5-001 | Data engine implementation | done | `src/lib/engines/data/data-engine.ts` |
| L2M-P5-002 | JSON/YAML/TOML/XML/CSV/TSV conversion | done | `src/lib/engines/data/data-engine.ts` — `ALL_FORMATS` |
| L2M-P5-003 | Lossless/structure-risk matrix | done | `src/lib/engines/data/data-engine.ts` — `LOSSLESS` map |
| L2M-P5-004 | Loss warnings per conversion path | done | `src/lib/engines/data/data-engine.ts` — `lossWarning()` |
| L2M-P5-005 | XML entity expansion disabled (XXE prevention) | done | `src/lib/engines/data/data-engine.ts` — `processEntities: false` |
| L2M-P5-006 | Data engine unit tests | done | `tests/unit/data-engine.test.ts` |

## Phase 6: QPDF Engine

| Task ID | Description | Status | Evidence |
|---|---|---|---|
| L2M-P6-001 | QPDF engine implementation | done | `src/lib/engines/pdf/qpdf-engine.ts` |
| L2M-P6-002 | Linearize operation | done | `src/lib/engines/pdf/qpdf-engine.ts` |
| L2M-P6-003 | Extract pages operation | done | `src/lib/engines/pdf/qpdf-engine.ts` |
| L2M-P6-004 | Rotate operation | done | `src/lib/engines/pdf/qpdf-engine.ts` |
| L2M-P6-005 | Decrypt operation | done | `src/lib/engines/pdf/qpdf-engine.ts` |
| L2M-P6-006 | PDF magic bytes validation | done | `src/lib/engines/pdf/qpdf-engine.ts` — `validate()` |
| L2M-P6-007 | Portable binary discovery (tools/qpdf/) | done | `src/lib/engines/pdf/qpdf-engine.ts` — `findQpdfBinary()` |

## Phase 7: 7-Zip Engine

| Task ID | Description | Status | Evidence |
|---|---|---|---|
| L2M-P7-001 | 7-Zip engine implementation | done | `src/lib/engines/archive/sevenzip-engine.ts` |
| L2M-P7-002 | Repack to ZIP/7Z/TAR | done | `src/lib/engines/archive/sevenzip-engine.ts` |
| L2M-P7-003 | Extract operation | done | `src/lib/engines/archive/sevenzip-engine.ts` |
| L2M-P7-004 | Path traversal detection | done | `src/lib/engines/archive/sevenzip-engine.ts` — `hasDangerousPaths` check |
| L2M-P7-005 | Expansion ratio limit (100x) | done | `src/lib/engines/archive/sevenzip-engine.ts` — `MAX_EXPANSION_RATIO` |
| L2M-P7-006 | Entry count limit (10,000) | done | `src/lib/engines/archive/sevenzip-engine.ts` — `MAX_ENTRIES` |
| L2M-P7-007 | Compression level presets | done | `src/lib/engines/archive/sevenzip-engine.ts` — `buildPresets()` |
| L2M-P7-008 | Integrity validation with `7z test` | done | `src/lib/engines/archive/sevenzip-engine.ts` — `validate()` |

## Phase 8: Pandoc Engine

| Task ID | Description | Status | Evidence |
|---|---|---|---|
| L2M-P8-001 | Pandoc engine implementation | done | `src/lib/engines/document/pandoc-engine.ts` |
| L2M-P8-002 | Markdown/HTML/RST/DOCX/ODT/LaTeX/TXT conversion | done | `src/lib/engines/document/pandoc-engine.ts` — `FORMAT_MAP`, `OUTPUT_MATRIX` |
| L2M-P8-003 | Loss profile per conversion path | done | `src/lib/engines/document/pandoc-engine.ts` — `isLossProfile()` |
| L2M-P8-004 | Conversion warnings | done | `src/lib/engines/document/pandoc-engine.ts` — `lossWarning()` |
| L2M-P8-005 | Pandoc engine unit tests (17 tests) | done | `tests/unit/pandoc-engine.test.ts` |

## Phase 9: LibreOffice Engine

| Task ID | Description | Status | Evidence |
|---|---|---|---|
| L2M-P9-001 | LibreOffice engine implementation | done | `src/lib/engines/document/libreoffice-engine.ts` |
| L2M-P9-002 | Document/Spreadsheet/Presentation → PDF | done | `src/lib/engines/document/libreoffice-engine.ts` — `OUTPUT_BY_CATEGORY` |
| L2M-P9-003 | ODF ↔ OOXML cross-conversion | done | `src/lib/engines/document/libreoffice-engine.ts` |
| L2M-P9-004 | Isolated profile directory per run | done | `src/lib/engines/document/libreoffice-engine.ts` — `profileDir` |
| L2M-P9-005 | Headless flags (no macros, no restore) | done | `src/lib/engines/document/libreoffice-engine.ts` — `--headless`, `--noevent`, `--norestore` |
| L2M-P9-006 | LibreOffice engine unit tests (19 tests) | done | `tests/unit/libreoffice-engine.test.ts` |

## Phase 10: UX & Frontend Integration

| Task ID | Description | Status | Evidence |
|---|---|---|---|
| L2M-P10-001 | Universal file selector (accept all 50+ formats) | done | `src/lib/domain/format-catalog.ts` — `INPUT_ACCEPT_ATTR` |
| L2M-P10-002 | Frontend handles `kind: "universal-file"` | done | `src/components/converter/source-selector.tsx` |
| L2M-P10-003 | Format selector shows engine and loss profile | done | `src/components/converter/format-selector.tsx` |
| L2M-P10-004 | Diagnostics panel for all 9 engines | done | `src/components/diagnostics/tool-status-panel.tsx` |
| L2M-P10-005 | Analysis card for all categories | done | `src/components/converter/input-analysis-card.tsx` |
| L2M-P10-006 | Job progress with real-time updates | done | `src/components/converter/job-progress-card.tsx` |
| L2M-P10-007 | Download card with token-based access | done | `src/components/converter/download-card.tsx` |

## Phase 11: Error Codes

| Task ID | Description | Status | Evidence |
|---|---|---|---|
| L2M-P11-001 | 23 error codes defined | done | `src/lib/errors/error-codes.ts` |
| L2M-P11-002 | Retryable classification | done | `src/lib/errors/error-codes.ts` — `RETRYABLE_CODES` |
| L2M-P11-003 | User-facing Spanish messages | done | `src/lib/errors/error-codes.ts` — `ERROR_MESSAGES` |
| L2M-P11-004 | AppError factory with stage/engineId/technicalDetail | done | `src/lib/errors/error-codes.ts` — `createAppError()` |
| L2M-P11-005 | Error codes unit tests (34 tests) | done | `tests/unit/error-codes.test.ts` |

## Phase 12: i18n

| Task ID | Description | Status | Evidence |
|---|---|---|---|
| L2M-P12-001 | English message catalog | done | `src/i18n/en.ts` |
| L2M-P12-002 | Spanish message catalog | done | `src/i18n/es.ts` |
| L2M-P12-003 | Type-safe MessageKey | done | `src/i18n/en.ts` — `MessageKey` type |
| L2M-P12-004 | i18n provider and hook | done | `src/i18n/index.ts` |

## Phase 13: Calibre Engine

| Task ID | Description | Status | Evidence |
|---|---|---|---|
| L2M-P13-001 | Calibre engine implementation | done | `src/lib/engines/ebook/calibre-engine.ts` |
| L2M-P13-002 | EPUB → MOBI/AZW3/PDF conversion | done | `src/lib/engines/ebook/calibre-engine.ts` — `CONVERSION_MATRIX` |
| L2M-P13-003 | MOBI/AZW3 → EPUB conversion | done | `src/lib/engines/ebook/calibre-engine.ts` |
| L2M-P13-004 | HTML/DOCX → EPUB conversion | done | `src/lib/engines/ebook/calibre-engine.ts` |
| L2M-P13-005 | Loss profiles per conversion path | done | `src/lib/engines/ebook/calibre-engine.ts` — `resolveLossProfile()` |
| L2M-P13-006 | 50MB input size limit | done | `src/lib/engines/ebook/calibre-engine.ts` — `MAX_INPUT_SIZE_BYTES` |
| L2M-P13-007 | EPUB/PDF magic bytes validation | done | `src/lib/engines/ebook/calibre-engine.ts` — `validate()` |
| L2M-P13-008 | Calibre engine unit tests (27 tests) | done | `tests/unit/calibre-engine.test.ts` |

## Phase 14: Tesseract OCR Engine

| Task ID | Description | Status | Evidence |
|---|---|---|---|
| L2M-P14-001 | Tesseract engine implementation | done | `src/lib/engines/ocr/tesseract-engine.ts` |
| L2M-P14-002 | Image → TXT (OCR) | done | `src/lib/engines/ocr/tesseract-engine.ts` |
| L2M-P14-003 | Image → searchable PDF (OCR) | done | `src/lib/engines/ocr/tesseract-engine.ts` |
| L2M-P14-004 | PDF → TXT via Poppler pdftoppm (experimental) | done | `src/lib/engines/ocr/tesseract-engine.ts` — `executePdfOcr()` |
| L2M-P14-005 | Language pack detection | done | `src/lib/engines/ocr/tesseract-engine.ts` — `detectLanguages()` |
| L2M-P14-006 | Page/DPI limits | done | `src/lib/engines/ocr/tesseract-engine.ts` — `MAX_PAGES_PDF_OCR`, `MAX_DPI` |
| L2M-P14-007 | Tesseract engine unit tests (27 tests) | done | `tests/unit/tesseract-engine.test.ts` |

## Phase 15: Batch Processing

| Task ID | Description | Status | Evidence |
|---|---|---|---|
| L2M-P15-001 | Batch processor implementation | done | `src/lib/jobs/batch-processor.ts` |
| L2M-P15-002 | Concurrency control (default: 2) | done | `src/lib/jobs/batch-processor.ts` — `DEFAULT_CONCURRENCY` |
| L2M-P15-003 | Partial failure handling | done | `src/lib/jobs/batch-processor.ts` — status: `partial-failure` |
| L2M-P15-004 | Batch cancellation | done | `src/lib/jobs/batch-processor.ts` — `cancelBatch()` |
| L2M-P15-005 | Batch API route | done | `src/app/api/batch/route.ts` |
| L2M-P15-006 | Batch processor unit tests (14 tests) | done | `tests/unit/batch-processor.test.ts` |

## Phase 16: Windows Portable Distribution

| Task ID | Description | Status | Evidence |
|---|---|---|---|
| L2M-P16-001 | Build script (build-windows-portable.sh) | done | `scripts/build-windows-portable.sh` |
| L2M-P16-002 | Start/stop PowerShell scripts | done | `scripts/windows-portable/start-link2media.ps1`, `stop-link2media.ps1` |
| L2M-P16-003 | BAT launcher scripts | done | `scripts/INICIAR_LINK2MEDIA.bat`, `CERRAR_LINK2MEDIA.bat` |
| L2M-P16-004 | yt-dlp update script | done | `scripts/ACTUALIZAR_YTDLP.bat`, `scripts/windows-portable/update-ytdlp.ps1` |
| L2M-P16-005 | SHA-256 checksum generation | done | `scripts/build-windows-portable.sh` |
| L2M-P16-006 | better-sqlite3 ABI mapping | done | `scripts/build-windows-portable.sh` |
| L2M-P16-007 | README template for ZIP | done | `scripts/windows-portable/LEEME.template.txt` |
| L2M-P16-008 | Windows smoke test | pending | Requires actual Windows machine |

## Phase 17: Infrastructure & Security

| Task ID | Description | Status | Evidence |
|---|---|---|---|
| L2M-P17-001 | Path safety validation | done | `src/lib/security/path-safety.ts` + tests (7 tests) |
| L2M-P17-002 | Filename sanitization | done | `src/lib/security/sanitize-filename.ts` |
| L2M-P17-003 | Coordinated cleanup | done | `src/lib/jobs/coordinated-cleanup.ts` + tests (6 tests) |
| L2M-P17-004 | Disk space checking | done | `src/lib/jobs/disk-space-check.ts` + tests (8 tests) |
| L2M-P17-005 | Progress emitter | done | `src/lib/jobs/progress-emitter.ts` + tests (13 tests) |
| L2M-P17-006 | File type detection | done | `src/lib/detection/file-detector.ts` |
| L2M-P17-007 | Integration tests (analyze, capabilities, jobs) | done | `tests/integration/` (42+ tests) |

## Phase 18: Documentation

| Task ID | Description | Status | Evidence |
|---|---|---|---|
| L2M-P18-001 | Updated README.md | done | `README.md` |
| L2M-P18-002 | Updated AGENTS.md | done | `AGENTS.md` |
| L2M-P18-003 | User guide | done | `docs/user-guide.md` |
| L2M-P18-004 | Format matrix | done | `docs/format-matrix.md` |
| L2M-P18-005 | Third-party licenses | done | `docs/third-party-licenses.md` |
| L2M-P18-006 | Final validation report | done | `docs/implementation/link2media-universal-e2e/final-validation.md` |
| L2M-P18-007 | Implementation spec | done | `docs/implementation/link2media-universal-e2e/spec.md` |
| L2M-P18-008 | Task list | done | `docs/implementation/link2media-universal-e2e/tasks.md` |
