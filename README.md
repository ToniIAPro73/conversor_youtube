# Link2Media — Universal Local Converter

Link2Media is a privacy-first, 100% local file converter that runs entirely in your browser. Upload any supported file and convert it to another format — no cloud, no uploads to external servers, no data leaving your machine.

## Features

- **Universal conversion**: Convert between 50+ formats across 11 categories
- **100% local & private**: All processing happens on your machine. No files are uploaded to any server.
- **9 conversion engines**: FFmpeg, Sharp, Data Engine, QPDF, 7-Zip, Pandoc, LibreOffice, Calibre, Tesseract
- **YouTube download**: Convert YouTube videos to MP3/MP4 via yt-dlp + FFmpeg
- **Real-time progress**: Live progress bar and stage-by-stage status
- **Batch processing**: Convert multiple files at once with configurable concurrency
- **Secure downloads**: Temporary, single-use tokens protect file access
- **Responsive UI**: Mobile-first design with dark mode support
- **i18n**: English and Spanish interface
- **Diagnostics panel**: Check which conversion tools are available on your system
- **Windows portable distribution**: Self-contained ZIP with no installation required

## Supported Conversion Categories

| Category | Formats |
|---|---|
| **Audio** | MP3, M4A, WAV, FLAC, OGG |
| **Video** | MP4, WebM, MKV |
| **Image** | JPEG, PNG, WebP, AVIF, TIFF, GIF |
| **Document** | DOCX, DOC, ODT, RTF |
| **Spreadsheet** | XLSX, XLS, ODS |
| **Presentation** | PPTX, PPT, ODP |
| **PDF** | PDF (linearize, extract pages, rotate, decrypt) |
| **Ebook** | EPUB, MOBI, AZW3 |
| **Archive** | ZIP, 7Z, TAR, GZ, RAR, BZ2 |
| **Structured Data** | JSON, YAML, TOML, XML, CSV, TSV |
| **Plain Text** | Markdown, HTML, RST, LaTeX, TXT |

## Conversion Engines

| Engine | Categories | Required Tool | Notes |
|---|---|---|---|
| **FFmpeg** | Audio, Video | `ffmpeg`, `ffprobe` | Audio cross-conversion, video transcoding, extract audio, normalize, trim, thumbnails, GIF |
| **Sharp** | Image | `sharp` (npm) | Image conversion, resize, optimize, strip metadata. Always available. |
| **Data Engine** | Structured Data | `yaml`, `smol-toml`, `fast-xml-parser`, `csv-parse`, `csv-stringify` (npm) | Pure TypeScript. Always available. |
| **QPDF** | PDF | `qpdf` | Linearize, extract pages, rotate, decrypt |
| **7-Zip** | Archive | `7z` | Extract, repack (ZIP/7Z/TAR), list entries |
| **Pandoc** | Plain Text, Document | `pandoc` | Markdown/HTML/RST/DOCX/ODT/LaTeX/TXT cross-conversion |
| **LibreOffice** | Document, Spreadsheet, Presentation | `libreoffice` / `soffice` | Office formats to PDF, ODF/OOXML cross-conversion |
| **Calibre** | Ebook | `ebook-convert` | EPUB/MOBI/AZW3 cross-conversion, HTML/DOCX to EPUB |
| **Tesseract** | Image, PDF | `tesseract` | OCR: image to text, image to searchable PDF, scanned PDF to text |

## Installation

### Prerequisites

- **Node.js**: v20+ (recommended v22+)
- **pnpm**: Package manager

### System Dependencies

Link2Media gracefully degrades when tools are missing — you only need the tools for the conversions you want to perform:

- **FFmpeg & FFprobe**: Audio/video conversion, YouTube downloads
- **yt-dlp**: YouTube URL downloads
- **Pandoc**: Document and text format conversion
- **LibreOffice**: Office format conversion (DOCX, XLSX, PPTX to PDF, etc.)
- **QPDF**: PDF optimization and manipulation
- **7-Zip**: Archive repacking and extraction
- **Calibre** (`ebook-convert`): Ebook format conversion
- **Tesseract**: OCR (optical character recognition)
- **Poppler** (`pdftoppm`): PDF-to-image conversion for OCR pipeline

The Data Engine and Sharp engine have no external dependencies — they work out of the box.

### Ubuntu/WSL Setup

```bash
# System dependencies
sudo apt update
sudo apt install -y ffmpeg python3-pip qpdf p7zip-full libreoffice tesseract-ocr tesseract-ocr-spa tesseract-ocr-eng poppler-utils
pip install yt-dlp

# Optional: Pandoc and Calibre
sudo apt install -y pandoc
# Calibre: see https://calibre-ebook.com/download_linux

# Project setup
pnpm install
cp .env.example .env.local
pnpm check:deps   # Verify tool availability
pnpm dev          # Start development server
```

### Development

```bash
pnpm install      # Install Node.js dependencies
pnpm dev          # Start Next.js development server
pnpm lint         # Check code style
pnpm typecheck    # TypeScript type checking
pnpm test         # Run unit/integration tests
pnpm build        # Production build
```

## Usage

### Convert a Local File

1. Open Link2Media in your browser
2. Click **"Local file"** tab
3. Drag and drop a file or click to browse
4. Select the output format from the available options
5. Optionally choose a quality preset
6. Click **"Convert"**
7. Download the converted file

### Convert from a YouTube URL

1. Click **"From URL"** tab
2. Paste a YouTube video URL
3. Select MP3 (audio) or MP4 (video) and quality
4. Click **"Convert"**
5. Download the converted file

### Batch Conversion

Upload multiple files and apply the same conversion to all of them. Batch processing supports configurable concurrency and partial failure handling.

### Diagnose Tool Availability

Go to the **"Diagnostics"** tab to see which conversion engines and tools are available on your system. Missing tools will be listed with recommended installation instructions.

## Environment Variables

| Variable | Description | Default |
|---|---|---|
| `MEDIA_TEMP_DIR` | Directory for temporary files | `./data/temp` |
| `MAX_VIDEO_DURATION_SECONDS` | Maximum video duration | `7200` (2h) |
| `MAX_CONCURRENT_JOBS` | Maximum simultaneous conversions | `2` |
| `JOB_TTL_MINUTES` | Time before converted files are deleted | `120` |

## Windows Portable Distribution

Link2Media includes a build script that creates a self-contained Windows x64 ZIP package:

```bash
bash scripts/build-windows-portable.sh
```

The ZIP includes:
- Node.js runtime
- Pre-built Next.js application
- yt-dlp, FFmpeg, FFprobe binaries
- `better-sqlite3` native module for Windows
- Start/stop scripts (`INICIAR_LINK2MEDIA.bat`, `CERRAR_LINK2MEDIA.bat`)
- `ACTUALIZAR_YTDLP.bat` for yt-dlp updates

To use the portable distribution:
1. Extract the ZIP to a local folder
2. Double-click `INICIAR_LINK2MEDIA.bat`
3. The browser opens automatically at `http://127.0.0.1:3000`
4. To stop: double-click `CERRAR_LINK2MEDIA.bat`

Note: The portable distribution includes yt-dlp and FFmpeg but not Pandoc, LibreOffice, QPDF, Calibre, or Tesseract. Those tools need to be installed separately on Windows if needed.

## Architecture

- **Framework**: Next.js 16 with App Router, TypeScript 5
- **UI**: Tailwind CSS 4, shadcn/ui, Lucide icons
- **Database**: SQLite via `better-sqlite3` (WAL mode)
- **Processing**: Secure child process execution (`shell: false`), path traversal protection
- **Security**: Token-based download protection (SHA-256 hashed), file path safety validation
- **Cleanup**: Automatic expiration of temporary files with coordinated cleanup
- **i18n**: Message catalogs for English and Spanish

## Loss Profiles

Each conversion is classified by its loss profile:

| Profile | Meaning |
|---|---|
| **Lossless** | No quality loss. Exact data preservation (e.g., WAV → FLAC, JSON → YAML) |
| **Metadata-risk** | Content preserved but some metadata may be lost (e.g., DOCX → ODT) |
| **Layout-risk** | Layout may change (e.g., EPUB → MOBI loses advanced CSS features) |
| **Lossy** | Irreversible quality loss (e.g., WAV → MP3, image format changes with compression) |
| **Structure-risk** | Nested structures may be flattened (e.g., JSON → CSV loses nesting) |

## Legal Notice

This tool is designed exclusively for content that is:
- Owned by the user
- Published with download permission
- In the public domain or under a compatible license

The user is solely responsible for respecting copyright, licenses, and terms of service of the original platform.

## License

MIT
