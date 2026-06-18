# Anclora FileStudio User Guide

## Table of Contents

1. [Getting Started](#getting-started)
2. [Converting a Local File](#converting-a-local-file)
3. [Converting from a YouTube URL](#converting-from-a-youtube-url)
4. [Understanding Loss Profiles](#understanding-loss-profiles)
5. [Diagnosing Tool Availability](#diagnosing-tool-availability)
6. [Batch Conversion](#batch-conversion)
7. [Troubleshooting](#troubleshooting)
8. [FAQ](#faq)

---

## Getting Started

### Web Version

The Web version runs image, PDF and structured data tools directly in your
browser:

- **Imágenes**: JPEG, PNG and WebP conversion, compression, resize, EXIF/GPS
  read and removal, batch ZIP download.
- **PDF**: merge PDFs, split by range, reorder pages, rotate pages and create a
  PDF from images.
- **Más herramientas**: JSON, YAML/YML, TOML, XML, CSV and TSV conversions.

The Web version does not upload file content to `/api/*` or any cloud storage.
Audio, video, Office, OCR, ebooks, archives and advanced PDF/image workflows
require Desktop.

### Development Mode

If you are a developer running Anclora FileStudio from source:

```bash
# Install dependencies
pnpm install

# (Optional) Check which conversion tools are available
pnpm check:deps

# Start the development server
pnpm dev
```

The application will be available at `http://localhost:3000`.

### Windows Portable

If you are using the Windows portable distribution:

1. Extract the `Anclora FileStudio-Windows-x64.zip` to a folder on your computer
2. Double-click `INICIAR_ANCLORA_FILESTUDIO.bat`
3. Your browser will open automatically at `http://127.0.0.1:3000`
4. To stop the application, double-click `CERRAR_ANCLORA_FILESTUDIO.bat`

The portable distribution includes Node.js, yt-dlp, FFmpeg, and FFprobe. For additional conversion capabilities (Pandoc, LibreOffice, QPDF, Calibre, Tesseract), install them separately.

---

## Converting a Local File

1. **Open Anclora FileStudio** in your browser
2. **Select the "Local file" tab** on the main screen
3. **Upload your file** by either:
   - Dragging and dropping the file onto the upload area, or
   - Clicking the upload area and selecting a file from your computer
4. **Wait for analysis** — Anclora FileStudio will detect the file type and category
5. **Choose an output format** from the list of available conversions:
   - Recommended formats are highlighted
   - Each option shows the conversion engine and loss profile
6. **Select a quality preset** (if available) — e.g., "Web (80%)" or "High quality (90%)"
7. **Click "Convert"** to start the conversion
8. **Monitor progress** — the progress bar shows real-time status
9. **Download** the converted file when the conversion completes

### Supported File Types

Anclora FileStudio supports files in the following categories:

- **Audio**: MP3, M4A, WAV, FLAC, OGG
- **Video**: MP4, WebM, MKV
- **Image**: JPEG, PNG, WebP, AVIF, TIFF, GIF
- **Documents**: DOCX, DOC, ODT, RTF
- **Spreadsheets**: XLSX, XLS, ODS
- **Presentations**: PPTX, PPT, ODP
- **PDF**: PDF
- **Ebooks**: EPUB, MOBI, AZW3
- **Archives**: ZIP, 7Z, TAR, GZ, RAR, BZ2
- **Structured Data**: JSON, YAML, TOML, XML, CSV, TSV
- **Plain Text**: Markdown, HTML, RST, LaTeX, TXT

Note: The available output formats depend on which conversion tools are installed on your system. Check the **Diagnostics** tab for details.

---

## Converting from a YouTube URL

1. **Select the "From URL" tab** on the main screen
2. **Paste the YouTube URL** into the input field
3. **Select the output format**:
   - **MP3** (audio only): Choose a bitrate (128kbps, 192kbps, 256kbps, 320kbps)
   - **MP4** (video): Choose a resolution (360p, 480p, 720p, 1080p)
4. **Click "Convert"**
5. **Wait for download and conversion** — this may take a while for long videos
6. **Download** the converted file

### Requirements

- **yt-dlp** must be installed on your system
- **FFmpeg** must be installed for audio/video conversion
- An internet connection is required for downloading YouTube content

### Legal Notice

Only download content that you own, is in the public domain, or has been published with download permission. You are solely responsible for complying with copyright laws and YouTube's Terms of Service.

---

## Understanding Loss Profiles

Every conversion in Anclora FileStudio is classified by a **loss profile** that tells you what kind of quality impact to expect:

| Loss Profile | Meaning | Examples |
|---|---|---|
| **Lossless** | No quality loss. The output contains exactly the same data as the input. | WAV → FLAC, JSON → YAML, PDF linearize |
| **Metadata-risk** | The content is preserved but some metadata (author, timestamps, styles) may be lost or altered. | DOCX → ODT, MOBI → EPUB |
| **Layout-risk** | The visual layout may change. Complex formatting features may not be fully preserved. | EPUB → MOBI (loses advanced CSS) |
| **Lossy** | Irreversible quality loss. The output is an approximation of the input. | WAV → MP3, PNG → JPEG, any → PDF (fixed layout) |
| **Structure-risk** | Nested or complex data structures may be flattened or simplified. | JSON → CSV (nested objects lost), XML → YAML |

### How Loss Profiles Are Determined

- **Same-category lossless formats** (e.g., WAV ↔ FLAC): Lossless
- **Compressed audio/video** (e.g., WAV → MP3): Lossy
- **Office format cross-conversion** (e.g., DOCX → ODT): Metadata-risk
- **Reflowable → fixed layout** (e.g., EPUB → PDF): Lossy
- **Structured → tabular** (e.g., JSON → CSV): Structure-risk
- **Rich → plain text** (e.g., DOCX → TXT): Lossy

### Warnings

When a conversion has potential data loss, Anclora FileStudio shows a warning. Pay attention to these warnings — they explain what specifically may be lost.

---

## Diagnosing Tool Availability

The **Diagnostics** tab shows the status of all conversion engines and their required tools.

### How to Use

1. Click the **"Diagnostics"** tab in the navigation
2. Review the status of each tool:
   - ✅ **Available** — The tool is installed and working
   - ❌ **Not found** — The tool is not installed; some conversions will be unavailable
3. Click **"Refresh"** to re-scan for tools (useful after installing new software)

### Tool Details

| Tool | Affects | Install Command (Ubuntu) |
|---|---|---|
| `ffmpeg` / `ffprobe` | Audio & video conversion | `sudo apt install ffmpeg` |
| `yt-dlp` | YouTube downloads | `pip install yt-dlp` |
| `sharp` (npm) | Image conversion | Included with Anclora FileStudio |
| `pandoc` | Document & text conversion | `sudo apt install pandoc` |
| `libreoffice` / `soffice` | Office format conversion | `sudo apt install libreoffice` |
| `qpdf` | PDF manipulation | `sudo apt install qpdf` |
| `7z` | Archive repacking | `sudo apt install p7zip-full` |
| `ebook-convert` (Calibre) | Ebook conversion | See calibre-ebook.com |
| `tesseract` | OCR (text from images) | `sudo apt install tesseract-ocr tesseract-ocr-spa tesseract-ocr-eng` |
| `pdftoppm` (Poppler) | PDF → image for OCR | `sudo apt install poppler-utils` |

### Always-Available Engines

The following engines have no external dependencies and work out of the box:

- **Sharp** (image conversion) — npm package
- **Data Engine** (structured data conversion) — pure TypeScript

---

## Batch Conversion

Batch conversion allows you to apply the same conversion to multiple files at once.

### How to Use Batch Conversion

1. Upload multiple files through the file selector
2. Select the conversion capability to apply to all files
3. Configure options (quality preset, etc.)
4. Start the batch — files are processed with configurable concurrency
5. Monitor progress — each file is tracked individually
6. Download individual results as they complete

### Batch Status

| Status | Meaning |
|---|---|
| **Pending** | Batch created, waiting to start processing |
| **Processing** | Files are being converted |
| **Completed** | All files converted successfully |
| **Partial failure** | Some files succeeded, some failed |
| **Failed** | All files failed |
| **Cancelled** | Batch was cancelled by the user |

### Concurrency

By default, batch processing runs up to 2 conversions simultaneously. This prevents overloading your system while maintaining reasonable throughput.

---

## Troubleshooting

### "Tool not available" error

**Problem**: A conversion fails with "La herramienta necesaria no está instalada" / "Tool not available".

**Solution**: Check the Diagnostics tab to see which tools are missing. Install the required tool for the conversion you want to perform.

### File upload is rejected

**Problem**: The file type is not accepted when uploading.

**Solution**: Anclora FileStudio supports 50+ file formats. If your file type is not recognized, it may be in an unsupported format. Check the format matrix in the documentation for the complete list.

### Conversion hangs or times out

**Problem**: A conversion stays at the same progress percentage for a long time.

**Solution**:
- Large files (especially video) can take a long time to convert
- Very long videos may exceed the default timeout (2 hours)
- Try converting a smaller file first to verify the tool is working
- Check the Diagnostics tab to ensure the required tool is available

### "OCR language missing" error

**Problem**: Tesseract OCR fails because the required language pack is not installed.

**Solution**: Install the appropriate Tesseract language pack:
```bash
# Spanish and English
sudo apt install tesseract-ocr-spa tesseract-ocr-eng
```

### Download link expired

**Problem**: The download link no longer works.

**Solution**: Converted files are automatically deleted after 2 hours (configurable via `JOB_TTL_MINUTES`). You need to re-convert the file.

### LibreOffice conversion fails on Linux

**Problem**: LibreOffice conversion fails even though LibreOffice is installed.

**Solution**: Ensure you are using `libreoffice` or `soffice` command. Anclora FileStudio tries both names. Also make sure no other LibreOffice instance is running (headless mode uses a profile lock).

---

## FAQ

### Is my data sent to any server?

**No.** All file processing happens locally on your machine. Files are never uploaded to any external server. The only network traffic is downloading YouTube videos when you use the URL feature.

### What happens to my files after conversion?

Converted files are stored temporarily on your machine and automatically deleted after 2 hours (configurable). The original uploaded files are also deleted after the same period.

### Can I convert DRM-protected ebooks?

**No.** If a book has DRM protection, Calibre will not be able to convert it. The conversion will fail with an error.

### Why are some conversion options greyed out?

Greyed-out or unavailable options mean the required tool is not installed on your system. Check the Diagnostics tab to see which tools are missing.

### Does Anclora FileStudio work on macOS?

The web interface works on any browser. However, the conversion tools need to be installed separately on macOS:
```bash
brew install ffmpeg yt-dlp pandoc qpdf p7zip libreoffice tesseract calibre poppler
```

### Does Anclora FileStudio work on mobile?

The UI is designed mobile-first and works in mobile browsers. However, Anclora FileStudio runs as a local server — you need to access it from a device on the same network. The Windows portable distribution is designed for desktop use.

### How do I update yt-dlp?

On the portable Windows distribution, run `ACTUALIZAR_YTDLP.bat`. On Linux:
```bash
pip install --upgrade yt-dlp
```

### Can I convert a PDF to an editable document?

PDF → DOCX conversion is available through LibreOffice, but note that this is a **lossy** conversion. Scanned PDFs (images of text) require OCR via Tesseract to extract text first.

### What is the maximum file size?

There is no fixed maximum file size. However, very large files may take a long time to convert and could fail due to timeout or disk space constraints. The ebook engine has a 50MB input limit.

### How do I report a bug?

Please open an issue on the project's repository with:
- The file type you were trying to convert
- The output format you selected
- The error message (if any)
- Your operating system and tool versions (from the Diagnostics tab)
