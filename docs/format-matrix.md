# Link2Media Format Matrix

Complete reference of all supported conversions, organized by engine.

> **How to read this table**: Each row represents a conversion path from an input format to an output format. The "Loss Profile" indicates the expected quality impact. The "Notes" column provides additional context.

## Loss Profile Legend

| Profile | Meaning |
|---|---|
| **lossless** | No quality loss; exact data preservation |
| **metadata-risk** | Content preserved; some metadata may be lost |
| **layout-risk** | Visual layout may change |
| **lossy** | Irreversible quality loss |
| **structure-risk** | Nested structures may be flattened |

---

## Audio — FFmpeg Engine

| Input Format | Output Format | Engine | Loss Profile | Notes |
|---|---|---|---|---|
| MP3 | WAV | FFmpeg | lossless | Decompress to PCM |
| MP3 | FLAC | FFmpeg | lossless | Decompress to lossless |
| MP3 | M4A | FFmpeg | lossy | Re-encoding lossy → lossy |
| MP3 | OGG | FFmpeg | lossy | Re-encoding lossy → lossy |
| M4A | MP3 | FFmpeg | lossy | Re-encoding lossy → lossy |
| M4A | WAV | FFmpeg | lossless | Decompress to PCM |
| M4A | FLAC | FFmpeg | lossless | Decompress to lossless |
| M4A | OGG | FFmpeg | lossy | Re-encoding lossy → lossy |
| WAV | MP3 | FFmpeg | lossy | Lossless → lossy compression |
| WAV | M4A | FFmpeg | lossy | Lossless → lossy compression |
| WAV | FLAC | FFmpeg | lossless | Lossless → lossless |
| WAV | OGG | FFmpeg | lossy | Lossless → lossy compression |
| FLAC | MP3 | FFmpeg | lossy | Lossless → lossy compression |
| FLAC | M4A | FFmpeg | lossy | Lossless → lossy compression |
| FLAC | WAV | FFmpeg | lossless | Lossless → lossless |
| FLAC | OGG | FFmpeg | lossy | Lossless → lossy compression |
| OGG | MP3 | FFmpeg | lossy | Re-encoding lossy → lossy |
| OGG | M4A | FFmpeg | lossy | Re-encoding lossy → lossy |
| OGG | WAV | FFmpeg | lossless | Decompress to PCM |
| OGG | FLAC | FFmpeg | lossless | Decompress to lossless |

## Video — FFmpeg Engine

| Input Format | Output Format | Engine | Loss Profile | Notes |
|---|---|---|---|---|
| MP4 | WebM | FFmpeg | lossy | Re-encoding with VP9/Opus |
| MP4 | MKV | FFmpeg | lossless | Container remux (no re-encode when possible) |
| WebM | MP4 | FFmpeg | lossy | Re-encoding with H.264/AAC |
| WebM | MKV | FFmpeg | lossless | Container remux |
| MKV | MP4 | FFmpeg | lossy | Re-encoding (if codec not H.264/AAC) |
| MKV | WebM | FFmpeg | lossy | Re-encoding with VP9/Opus |

### FFmpeg Additional Operations

| Input | Operation | Output | Loss Profile | Notes |
|---|---|---|---|---|
| Video | Extract audio | MP3/M4A/WAV/FLAC/OGG | lossless (audio stream copy) or lossy | Extract audio track without re-encoding when possible |
| Audio/Video | Normalize audio | Same format | lossy | loudnorm filter re-encodes |
| Audio/Video | Trim/cut | Same format | lossless | Stream copy when possible |
| Video | Extract frame/thumbnail | JPEG/PNG | lossy | Single frame capture |
| Video | Create GIF | GIF | lossy | Duration limit: 300s |
| Video | Extract subtitles | SRT/ASS | lossless | Extract embedded subtitle tracks |

## Image — Sharp Engine

| Input Format | Output Format | Engine | Loss Profile | Notes |
|---|---|---|---|---|
| JPEG | PNG | Sharp | lossless | Lossy → lossless (no quality gain) |
| JPEG | WebP | Sharp | lossy | Better compression than JPEG |
| JPEG | AVIF | Sharp | lossy | Best compression, limited browser support |
| JPEG | TIFF | Sharp | lossless | Uncompressed output |
| JPEG | GIF | Sharp | lossy | 256-color palette limitation |
| PNG | JPEG | Sharp | lossy | Lossless → lossy; alpha replaced with white |
| PNG | WebP | Sharp | lossy | Supports transparency |
| PNG | AVIF | Sharp | lossy | Best compression with transparency |
| PNG | TIFF | Sharp | lossless | Lossless → lossless |
| PNG | GIF | Sharp | lossy | 256-color palette limitation |
| WebP | JPEG | Sharp | lossy | Transparency replaced with white |
| WebP | PNG | Sharp | lossless | Preserves transparency |
| WebP | AVIF | Sharp | lossy | Modern format conversion |
| WebP | TIFF | Sharp | lossless | Uncompressed output |
| WebP | GIF | Sharp | lossy | 256-color palette limitation |
| AVIF | JPEG | Sharp | lossy | Lossy → lossy |
| AVIF | PNG | Sharp | lossless | Preserves transparency |
| AVIF | WebP | Sharp | lossy | Modern format conversion |
| AVIF | TIFF | Sharp | lossless | Uncompressed output |
| AVIF | GIF | Sharp | lossy | 256-color palette limitation |
| TIFF | JPEG | Sharp | lossy | Lossless → lossy |
| TIFF | PNG | Sharp | lossless | Lossless → lossless |
| TIFF | WebP | Sharp | lossy | Better compression |
| TIFF | AVIF | Sharp | lossy | Best compression |
| TIFF | GIF | Sharp | lossy | 256-color palette limitation |
| GIF | JPEG | Sharp | lossy | Alpha replaced with white |
| GIF | PNG | Sharp | lossless | Preserves transparency |
| GIF | WebP | Sharp | lossy | Better compression for animations |
| GIF | AVIF | Sharp | lossy | Best compression |
| GIF | TIFF | Sharp | lossless | Uncompressed output |

### Sharp Additional Operations

| Operation | Notes |
|---|---|
| Resize | Width/height with fit modes (cover, contain, fill, inside, outside) |
| Rotate | 90°, 180°, 270° |
| Flip | Horizontal and/or vertical |
| Strip metadata | Remove EXIF, GPS, and other metadata (privacy feature) |
| Quality presets | Web (80%), High (90%), Maximum (95%) for JPEG/WebP |

## Structured Data — Data Engine (Pure TypeScript)

| Input Format | Output Format | Engine | Loss Profile | Notes |
|---|---|---|---|---|
| JSON | YAML | Data | lossless | Full structure preservation |
| JSON | TOML | Data | lossless | Full structure preservation |
| JSON | XML | Data | structure-risk | Attributes/namespaces may be lost |
| JSON | CSV | Data | structure-risk | Nested structures flattened |
| JSON | TSV | Data | structure-risk | Nested structures flattened |
| YAML | JSON | Data | lossless | Full structure preservation |
| YAML | TOML | Data | lossless | Full structure preservation |
| YAML | XML | Data | structure-risk | Attributes/namespaces may be lost |
| YAML | CSV | Data | structure-risk | Nested structures flattened |
| YAML | TSV | Data | structure-risk | Nested structures flattened |
| TOML | JSON | Data | lossless | Full structure preservation |
| TOML | YAML | Data | lossless | Full structure preservation |
| TOML | XML | Data | structure-risk | Attributes/namespaces may be lost |
| TOML | CSV | Data | structure-risk | Nested structures flattened |
| TOML | TSV | Data | structure-risk | Nested structures flattened |
| XML | JSON | Data | lossless | Attributes preserved with prefix notation |
| XML | YAML | Data | structure-risk | Attributes/namespaces may be lost |
| XML | TOML | Data | structure-risk | Attributes/namespaces may be lost |
| XML | CSV | Data | structure-risk | Nested structures and attributes lost |
| XML | TSV | Data | structure-risk | Nested structures and attributes lost |
| CSV | JSON | Data | lossless | Tabular data fully preserved |
| CSV | YAML | Data | structure-risk | Tabular data preserved; nested structures not expected |
| CSV | TOML | Data | structure-risk | Tabular data preserved; nested structures not expected |
| CSV | XML | Data | structure-risk | Simple XML output; attributes not generated |
| CSV | TSV | Data | lossless | Delimiter change only |
| TSV | JSON | Data | lossless | Tabular data fully preserved |
| TSV | YAML | Data | structure-risk | Tabular data preserved |
| TSV | TOML | Data | structure-risk | Tabular data preserved |
| TSV | XML | Data | structure-risk | Simple XML output |
| TSV | CSV | Data | lossless | Delimiter change only |

## PDF — QPDF Engine

| Input Format | Output Format | Engine | Loss Profile | Notes |
|---|---|---|---|---|
| PDF | PDF (linearized) | QPDF | lossless | Optimized for web/fast loading |
| PDF | PDF (extract pages) | QPDF | lossless | Extract page range |
| PDF | PDF (rotated) | QPDF | lossless | Rotate all pages 90°/180°/270° |
| PDF | PDF (decrypted) | QPDF | metadata-risk | Remove password protection (owner password only) |

## Archive — 7-Zip Engine

| Input Format | Output Format | Engine | Loss Profile | Notes |
|---|---|---|---|---|
| ZIP | 7Z | 7-Zip | lossless | Repack with better compression |
| ZIP | TAR | 7-Zip | lossless | TAR has no built-in compression |
| 7Z | ZIP | 7-Zip | lossless | Repack to more compatible format |
| 7Z | TAR | 7-Zip | lossless | TAR has no built-in compression |
| TAR | ZIP | 7-Zip | lossless | Add compression |
| TAR | 7Z | 7-Zip | lossless | Add compression |
| GZ | ZIP | 7-Zip | lossless | Repack |
| GZ | 7Z | 7-Zip | lossless | Repack |
| RAR | ZIP | 7-Zip | lossless | Repack (read-only RAR support) |
| RAR | 7Z | 7-Zip | lossless | Repack (read-only RAR support) |
| BZ2 | ZIP | 7-Zip | lossless | Repack |
| BZ2 | 7Z | 7-Zip | lossless | Repack |
| Any archive | Extract | 7-Zip | lossless | Extract to directory |

### 7-Zip Safety Limits

- Maximum 10,000 entries per archive
- Maximum expansion ratio: 100x
- Path traversal entries are blocked

## Document — Pandoc Engine

| Input Format | Output Format | Engine | Loss Profile | Notes |
|---|---|---|---|---|
| Markdown | HTML | Pandoc | lossless | Full structure preservation |
| Markdown | DOCX | Pandoc | lossless | Rich document output |
| Markdown | ODT | Pandoc | lossless | ODF document output |
| Markdown | RST | Pandoc | lossless | reStructuredText output |
| Markdown | LaTeX | Pandoc | lossless | LaTeX source output |
| Markdown | TXT | Pandoc | lossy | Plain text loses all formatting |
| HTML | Markdown | Pandoc | metadata-risk | HTML → MD may lose some formatting |
| HTML | DOCX | Pandoc | lossless | Rich document output |
| HTML | ODT | Pandoc | lossless | ODF document output |
| HTML | RST | Pandoc | lossless | reStructuredText output |
| HTML | TXT | Pandoc | lossy | Plain text loses all formatting |
| RST | Markdown | Pandoc | lossless | Full structure preservation |
| RST | HTML | Pandoc | lossless | HTML output |
| RST | DOCX | Pandoc | lossless | Rich document output |
| RST | ODT | Pandoc | lossless | ODF document output |
| RST | LaTeX | Pandoc | lossless | LaTeX source output |
| RST | TXT | Pandoc | lossy | Plain text loses all formatting |
| DOCX | Markdown | Pandoc | metadata-risk | Complex Word formatting may be lost |
| DOCX | HTML | Pandoc | lossless | HTML output |
| DOCX | ODT | Pandoc | metadata-risk | Cross-office format conversion |
| DOCX | RST | Pandoc | lossless | reStructuredText output |
| DOCX | TXT | Pandoc | lossy | Plain text loses all formatting |
| ODT | Markdown | Pandoc | metadata-risk | Complex ODT formatting may be lost |
| ODT | HTML | Pandoc | lossless | HTML output |
| ODT | DOCX | Pandoc | metadata-risk | Cross-office format conversion |
| ODT | RST | Pandoc | lossless | reStructuredText output |
| ODT | TXT | Pandoc | lossy | Plain text loses all formatting |
| LaTeX | Markdown | Pandoc | lossless | Full structure preservation |
| LaTeX | HTML | Pandoc | lossless | HTML output |
| LaTeX | TXT | Pandoc | lossy | Plain text loses all formatting |
| TXT | Markdown | Pandoc | metadata-risk | Plain → rich: formatting inferred |
| TXT | HTML | Pandoc | metadata-risk | Plain → rich: formatting inferred |

## Office — LibreOffice Engine

| Input Format | Output Format | Engine | Loss Profile | Notes |
|---|---|---|---|---|
| DOCX | PDF | LibreOffice | lossy | Reflowable → fixed layout |
| DOCX | ODT | LibreOffice | metadata-risk | Cross-office conversion; some styles may differ |
| DOC | PDF | LibreOffice | lossy | Legacy Word format → PDF |
| DOC | ODT | LibreOffice | metadata-risk | Legacy Word → ODF |
| ODT | PDF | LibreOffice | lossy | Reflowable → fixed layout |
| ODT | DOCX | LibreOffice | metadata-risk | ODF → OOXML conversion |
| RTF | PDF | LibreOffice | lossy | RTF → PDF |
| RTF | ODT | LibreOffice | metadata-risk | RTF → ODF |
| XLSX | PDF | LibreOffice | lossy | Spreadsheet → fixed layout |
| XLSX | ODS | LibreOffice | metadata-risk | OOXML → ODF |
| XLS | PDF | LibreOffice | lossy | Legacy Excel → PDF |
| XLS | ODS | LibreOffice | metadata-risk | Legacy Excel → ODF |
| ODS | PDF | LibreOffice | lossy | Spreadsheet → fixed layout |
| ODS | XLSX | LibreOffice | metadata-risk | ODF → OOXML |
| PPTX | PDF | LibreOffice | lossy | Presentation → fixed layout |
| PPTX | ODP | LibreOffice | metadata-risk | OOXML → ODF |
| PPT | PDF | LibreOffice | lossy | Legacy PowerPoint → PDF |
| PPT | ODP | LibreOffice | metadata-risk | Legacy PowerPoint → ODF |
| ODP | PDF | LibreOffice | lossy | Presentation → fixed layout |
| ODP | PPTX | LibreOffice | metadata-risk | ODF → OOXML |

## Ebook — Calibre Engine

| Input Format | Output Format | Engine | Loss Profile | Notes |
|---|---|---|---|---|
| EPUB | MOBI | Calibre | layout-risk | Advanced CSS features may be lost |
| EPUB | AZW3 | Calibre | layout-risk | Advanced CSS features may be lost |
| EPUB | PDF | Calibre | lossy | Reflowable → fixed layout |
| MOBI | EPUB | Calibre | metadata-risk | Kindle-specific features may not convert |
| AZW3 | EPUB | Calibre | metadata-risk | Kindle-specific features may not convert |
| HTML | EPUB | Calibre | metadata-risk | Some metadata may not transfer |
| DOCX | EPUB | Calibre | metadata-risk | Some document metadata may not transfer |

### Calibre Limits

- Maximum input size: 50 MB
- DRM-protected ebooks cannot be converted

## OCR — Tesseract Engine

| Input Format | Output Format | Engine | Loss Profile | Notes |
|---|---|---|---|---|
| PNG | TXT | Tesseract | lossy | OCR: image → text |
| JPEG | TXT | Tesseract | lossy | OCR: image → text |
| TIFF | TXT | Tesseract | lossy | OCR: image → text |
| WebP | TXT | Tesseract | lossy | OCR: image → text |
| PNG | PDF (searchable) | Tesseract | lossy | OCR: image → PDF with text layer |
| JPEG | PDF (searchable) | Tesseract | lossy | OCR: image → PDF with text layer |
| TIFF | PDF (searchable) | Tesseract | lossy | OCR: image → PDF with text layer |
| WebP | PDF (searchable) | Tesseract | lossy | OCR: image → PDF with text layer |
| PDF (scanned) | TXT | Tesseract + Poppler | lossy | PDF → images → OCR; max 50 pages; experimental |

### Tesseract Requirements

- Requires `tesseract` binary and language packs (`spa`, `eng`)
- PDF OCR requires Poppler (`pdftoppm`) for PDF → image conversion
- Maximum DPI: 600 (default: 300)
- Maximum pages for PDF OCR: 50

---

## YouTube — yt-dlp + FFmpeg

| Source | Output Format | Engine | Loss Profile | Notes |
|---|---|---|---|---|
| YouTube URL | MP3 | yt-dlp + FFmpeg | lossy | Audio extraction with chosen bitrate |
| YouTube URL | MP4 | yt-dlp + FFmpeg | lossy | Video download with chosen resolution |

### YouTube Quality Options

- **MP3 bitrates**: 128kbps, 192kbps, 256kbps, 320kbps
- **MP4 resolutions**: 360p, 480p, 720p, 1080p
