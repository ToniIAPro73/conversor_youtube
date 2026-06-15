# Link2Media — Universal Conversion Baseline Audit

**Date:** 2026-06-15  
**Branch base:** feat/claude-link2media-smart-conversion (c2c4b9c)  
**New branch:** feat/claude-link2media-universal-conversion-suite

---

## Git State

- Clean working tree on new branch
- 6 commits ahead of `main` on Phase 2 implementation
- Remote: GitHub ToniIAPro73/conversor_youtube

## Architecture Real (Phase 2)

### API Routes
| Route | Method | Purpose |
|---|---|---|
| /api/inputs/analyze | POST | URL + local file analysis |
| /api/capabilities | POST | Conversion capabilities |
| /api/jobs | POST/GET | Create/list jobs |
| /api/jobs/[id] | GET/DELETE | Job status / cancel |
| /api/jobs/[id]/token | GET | One-time download token |
| /api/download/[id] | GET | Authenticated download |
| /api/history | GET | Job history |
| /api/health | GET | Tool health check |
| /api/metadata | GET | YouTube metadata |

### SQLite Schema (v1)
- `jobs`: All conversion jobs (remote-url + local-file)
- `tool_versions`: FFmpeg, ffprobe, yt-dlp versions
- `schema_migrations`: Applied migrations

### Conversions Working (Phase 2)
**Audio:** MP3, M4A, WAV, FLAC, OGG (via FFmpeg)  
**Video:** MP4, WebM, MKV (via FFmpeg)  
**Source:** YouTube URL + local audio/video files

### Tests Passing
- 74 unit tests across 10 test files
- `tests/unit/path-safety.test.ts` (7 cases)
- `tests/unit/supported-conversions.test.ts` (14 cases)
- `tests/youtube-normalize-url.test.ts` (existing)
- 7 more test files (pre-existing)

### npm Dependencies (Phase 2)
- `better-sqlite3` — SQLite
- `next`, `react`, `react-dom` — framework
- `zod` — validation
- `lucide-react`, `shadcn`, `sonner` — UI
- `tailwind-merge`, `tw-animate-css` — styles

## Conversions Declared But Missing
- Images: no engine
- Documents: no engine
- PDFs: no engine
- Ebooks: no engine
- Archives: no engine
- Structured data: no engine
- OCR: no engine

## Herramientas en el Sistema (Linux/WSL)
| Tool | Status | Notes |
|---|---|---|
| ffmpeg | ✅ /usr/bin/ffmpeg | v6.x |
| ffprobe | ✅ /usr/bin/ffprobe | v6.x |
| sharp | ✅ npm v0.35.1 | installed this session |
| qpdf | ❌ not installed | needs sudo apt |
| 7-Zip | ❌ not installed | needs sudo apt |
| pandoc | ❌ not installed | |
| tesseract | ❌ not installed | |
| libreoffice | ❌ not installed | |
| calibre | ❌ not installed | |

## Deuda Técnica Identificada
- Job table has no `category` or `engine_id` column — needs migration
- `supported-conversions.ts` is not modular (single file, not engine-based)
- No universal file detector
- No batch system
- No artifact table independent of jobs
- ProcessRunner is inline in `processor.ts` — should be extracted

## Revisión MEMORY.md
- Memory system: MEMANTO (external) — no MEMORY.md in repo
- No contamination from other projects detected

## Riesgos
- qpdf/7-Zip unavailable in dev (Linux without sudo); engines must degrade gracefully
- Sharp Windows portable: needs `@img/sharp-win32-x64` prebuilt in build script
- File-type v22 is ESM-only — requires dynamic import in CJS context

## Decisiones para esta Fase
- qpdf + 7-Zip: engines que reportan `unavailable-tool` si no hay binario
- Sharp: funcional en Linux; portable Windows via build script
- Data engine: puro TypeScript, sin binarios
- file-type v22: usar `await import('file-type')` dinámico
