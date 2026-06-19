// Universal file detector — resolves FileCategory from content, not just extension.
// Chain: magic bytes → MIME type → structure probe → extension fallback.

import fs from "fs";
import path from "path";
import crypto from "crypto";
import type {
  FileCategory,
  UniversalFileDescriptor,
  FileAttributes,
  InputSource,
  DescriptorWarning,
} from "../domain/descriptors";

// ── Extension → category fallback map ──────────────────────────────────────

const EXT_CATEGORY: Record<string, FileCategory> = {
  // Audio
  mp3: "audio",
  m4a: "audio",
  wav: "audio",
  flac: "audio",
  ogg: "audio",
  opus: "audio",
  aiff: "audio",
  aac: "audio",
  wma: "audio",
  alac: "audio",
  // Video
  mp4: "video",
  webm: "video",
  mkv: "video",
  avi: "video",
  mov: "video",
  wmv: "video",
  flv: "video",
  m4v: "video",
  ts: "video",
  mts: "video",
  // Image
  jpg: "image",
  jpeg: "image",
  png: "image",
  gif: "image",
  webp: "image",
  avif: "image",
  tiff: "image",
  tif: "image",
  bmp: "image",
  ico: "image",
  svg: "image",
  heic: "image",
  heif: "image",
  // Document/markup
  md: "plain-text",
  markdown: "plain-text",
  txt: "plain-text",
  rtf: "document",
  html: "plain-text",
  htm: "plain-text",
  doc: "document",
  docx: "document",
  odt: "document",
  // Spreadsheet
  xls: "spreadsheet",
  xlsx: "spreadsheet",
  ods: "spreadsheet",
  csv: "structured-data",
  tsv: "structured-data",
  // Presentation
  ppt: "presentation",
  pptx: "presentation",
  odp: "presentation",
  // PDF
  pdf: "pdf",
  // Ebook
  epub: "ebook",
  mobi: "ebook",
  azw: "ebook",
  azw3: "ebook",
  fb2: "ebook",
  // Archive
  zip: "archive",
  "7z": "archive",
  tar: "archive",
  gz: "archive",
  bz2: "archive",
  xz: "archive",
  rar: "archive",
  wim: "archive",
  lz4: "archive",
  // Structured data
  json: "structured-data",
  jsonl: "structured-data",
  yaml: "structured-data",
  yml: "structured-data",
  toml: "structured-data",
  xml: "structured-data",
};

// ── MIME → category ─────────────────────────────────────────────────────────

const MIME_CATEGORY: [RegExp, FileCategory][] = [
  [/^audio\//, "audio"],
  [/^video\//, "video"],
  [/^image\/svg/, "image"],
  [/^image\//, "image"],
  [/^application\/pdf/, "pdf"],
  [/^application\/epub\+zip/, "ebook"],
  [/^application\/x-mobipocket-ebook/, "ebook"],
  [/^application\/vnd\.oasis\.opendocument\.text/, "document"],
  [/^application\/vnd\.oasis\.opendocument\.spreadsheet/, "spreadsheet"],
  [/^application\/vnd\.oasis\.opendocument\.presentation/, "presentation"],
  [
    /^application\/vnd\.openxmlformats-officedocument\.wordprocessingml/,
    "document",
  ],
  [
    /^application\/vnd\.openxmlformats-officedocument\.spreadsheetml/,
    "spreadsheet",
  ],
  [
    /^application\/vnd\.openxmlformats-officedocument\.presentationml/,
    "presentation",
  ],
  [/^application\/msword/, "document"],
  [/^application\/vnd\.ms-excel/, "spreadsheet"],
  [/^application\/vnd\.ms-powerpoint/, "presentation"],
  [/^application\/json/, "structured-data"],
  [/^application\/(xml|xhtml\+xml|atom\+xml)/, "structured-data"],
  [/^text\/xml/, "structured-data"],
  [/^text\/csv/, "structured-data"],
  [/^text\/tab-separated-values/, "structured-data"],
  [/^text\//, "plain-text"],
  [/^application\/(zip|x-7z-compressed|x-tar|gzip|x-bzip2|x-xz)/, "archive"],
];

function mimeToCategory(mime: string): FileCategory | null {
  for (const [pattern, cat] of MIME_CATEGORY) {
    if (pattern.test(mime)) return cat;
  }
  return null;
}

// ── Magic bytes detection ────────────────────────────────────────────────────

interface MagicEntry {
  offset: number;
  bytes: Buffer;
  mime: string;
  format: string;
}

const MAGIC_TABLE: MagicEntry[] = [
  // Images
  {
    offset: 0,
    bytes: Buffer.from([0xff, 0xd8, 0xff]),
    mime: "image/jpeg",
    format: "jpeg",
  },
  {
    offset: 0,
    bytes: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
    mime: "image/png",
    format: "png",
  },
  {
    offset: 0,
    bytes: Buffer.from([0x47, 0x49, 0x46]),
    mime: "image/gif",
    format: "gif",
  },
  {
    offset: 0,
    bytes: Buffer.from([0x52, 0x49, 0x46, 0x46]),
    mime: "image/webp",
    format: "webp",
  }, // RIFF
  {
    offset: 8,
    bytes: Buffer.from([0x57, 0x45, 0x42, 0x50]),
    mime: "image/webp",
    format: "webp",
  },
  {
    offset: 0,
    bytes: Buffer.from([0x49, 0x49, 0x2a, 0x00]),
    mime: "image/tiff",
    format: "tiff",
  },
  {
    offset: 0,
    bytes: Buffer.from([0x4d, 0x4d, 0x00, 0x2a]),
    mime: "image/tiff",
    format: "tiff",
  },
  // PDF
  {
    offset: 0,
    bytes: Buffer.from([0x25, 0x50, 0x44, 0x46]),
    mime: "application/pdf",
    format: "pdf",
  },
  // ZIP-based (DOCX, XLSX, EPUB, etc.) — detected by structure after
  {
    offset: 0,
    bytes: Buffer.from([0x50, 0x4b, 0x03, 0x04]),
    mime: "application/zip",
    format: "zip",
  },
  {
    offset: 0,
    bytes: Buffer.from([0x50, 0x4b, 0x05, 0x06]),
    mime: "application/zip",
    format: "zip",
  },
  // 7-Zip
  {
    offset: 0,
    bytes: Buffer.from([0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c]),
    mime: "application/x-7z-compressed",
    format: "7z",
  },
  // gzip
  {
    offset: 0,
    bytes: Buffer.from([0x1f, 0x8b]),
    mime: "application/gzip",
    format: "gz",
  },
  // bzip2
  {
    offset: 0,
    bytes: Buffer.from([0x42, 0x5a, 0x68]),
    mime: "application/x-bzip2",
    format: "bz2",
  },
  // xz
  {
    offset: 0,
    bytes: Buffer.from([0xfd, 0x37, 0x7a, 0x58, 0x5a, 0x00]),
    mime: "application/x-xz",
    format: "xz",
  },
  // OGG
  {
    offset: 0,
    bytes: Buffer.from([0x4f, 0x67, 0x67, 0x53]),
    mime: "audio/ogg",
    format: "ogg",
  },
  // FLAC
  {
    offset: 0,
    bytes: Buffer.from([0x66, 0x4c, 0x61, 0x43]),
    mime: "audio/flac",
    format: "flac",
  },
  // MP3 (ID3)
  {
    offset: 0,
    bytes: Buffer.from([0x49, 0x44, 0x33]),
    mime: "audio/mpeg",
    format: "mp3",
  },
  // WAV (RIFF....WAVE)
  {
    offset: 0,
    bytes: Buffer.from([0x52, 0x49, 0x46, 0x46]),
    mime: "audio/wav",
    format: "wav",
  },
  // Windows PE (executables — should be rejected)
  {
    offset: 0,
    bytes: Buffer.from([0x4d, 0x5a]),
    mime: "application/x-dosexec",
    format: "exe",
  },
];

async function detectByMagic(
  filePath: string,
): Promise<{ mime: string; format: string } | null> {
  const fd = fs.openSync(filePath, "r");
  try {
    const headerBuf = Buffer.alloc(16);
    fs.readSync(fd, headerBuf, 0, 16, 0);
    for (const entry of MAGIC_TABLE) {
      const slice = headerBuf.slice(
        entry.offset,
        entry.offset + entry.bytes.length,
      );
      if (slice.equals(entry.bytes)) {
        // For RIFF, distinguish WAV from WebP by checking bytes 8-11
        if (entry.format === "webp" || entry.format === "wav") {
          const riffBuf = Buffer.alloc(12);
          fs.readSync(fd, riffBuf, 0, 12, 0);
          const typeBytes = riffBuf.slice(8, 12).toString("ascii");
          if (typeBytes === "WEBP")
            return { mime: "image/webp", format: "webp" };
          if (typeBytes === "WAVE") return { mime: "audio/wav", format: "wav" };
          // Unknown RIFF
          continue;
        }
        return { mime: entry.mime, format: entry.format };
      }
    }
    const bmffBuf = Buffer.alloc(64);
    fs.readSync(fd, bmffBuf, 0, 64, 0);
    if (bmffBuf.slice(4, 8).toString("ascii") === "ftyp") {
      const majorBrand = bmffBuf.slice(8, 12).toString("ascii");
      const brands = bmffBuf.toString("ascii");
      if (
        majorBrand === "avif" ||
        majorBrand === "avis" ||
        brands.includes("avif") ||
        brands.includes("avis")
      ) {
        return { mime: "image/avif", format: "avif" };
      }
    }
    // Check for TAR (ustar magic at offset 257)
    const tarBuf = Buffer.alloc(8);
    fs.readSync(fd, tarBuf, 0, 6, 257);
    if (tarBuf.slice(0, 6).toString("ascii") === "ustar ") {
      return { mime: "application/x-tar", format: "tar" };
    }
  } finally {
    fs.closeSync(fd);
  }
  return null;
}

// ── ZIP structure probe (DOCX, XLSX, EPUB, PPTX, ODT…) ─────────────────────

const ODF_BY_EXTENSION: Record<string, { mime: string; format: string }> = {
  odt: { mime: "application/vnd.oasis.opendocument.text", format: "odt" },
  ods: {
    mime: "application/vnd.oasis.opendocument.spreadsheet",
    format: "ods",
  },
  odp: {
    mime: "application/vnd.oasis.opendocument.presentation",
    format: "odp",
  },
};

const ODF_BY_MIMETYPE: Record<string, { mime: string; format: string }> = {
  "application/vnd.oasis.opendocument.text": ODF_BY_EXTENSION.odt,
  "application/vnd.oasis.opendocument.spreadsheet": ODF_BY_EXTENSION.ods,
  "application/vnd.oasis.opendocument.presentation": ODF_BY_EXTENSION.odp,
};

function probeZipContents(
  filePath: string,
  ext: string | null,
): { mime: string; format: string } {
  try {
    const buf = fs.readFileSync(filePath);
    const str = buf.toString("binary");
    // Look for characteristic filenames in the ZIP central directory
    if (str.includes("word/document.xml"))
      return {
        mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        format: "docx",
      };
    if (str.includes("xl/workbook.xml"))
      return {
        mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        format: "xlsx",
      };
    if (str.includes("ppt/presentation.xml"))
      return {
        mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        format: "pptx",
      };
    if (str.includes("META-INF/container.xml") && str.includes("epub"))
      return { mime: "application/epub+zip", format: "epub" };
    if (str.includes("content.xml") && str.includes("manifest.xml")) {
      if (str.includes("Writer"))
        return {
          mime: "application/vnd.oasis.opendocument.text",
          format: "odt",
        };
      if (str.includes("Calc"))
        return {
          mime: "application/vnd.oasis.opendocument.spreadsheet",
          format: "ods",
        };
      if (str.includes("Impress"))
        return {
          mime: "application/vnd.oasis.opendocument.presentation",
          format: "odp",
        };
    }
    if (str.includes("mimetype")) {
      const mimetypeMatch = str.match(/mimetype([a-z/+.-]{10,60})/);
      const odf = mimetypeMatch ? ODF_BY_MIMETYPE[mimetypeMatch[1]] : null;
      if (odf) return odf;
      if (mimetypeMatch && ext && ODF_BY_EXTENSION[ext])
        return ODF_BY_EXTENSION[ext];
      if (mimetypeMatch) return { mime: mimetypeMatch[1], format: "odf" };
    }
  } catch {
    /* ignore */
  }
  if (ext && ODF_BY_EXTENSION[ext]) return ODF_BY_EXTENSION[ext];
  return { mime: "application/zip", format: "zip" };
}

// ── Text structure probe ────────────────────────────────────────────────────

function probeTextStructure(
  filePath: string,
): { mime: string; format: string } | null {
  try {
    const sample = fs
      .readFileSync(filePath, { encoding: "utf8", flag: "r" })
      .slice(0, 4096);
    const trimmed = sample.trimStart();
    if (trimmed.startsWith("{\\rtf"))
      return { mime: "application/rtf", format: "rtf" };
    if (trimmed.startsWith("{") || trimmed.startsWith("["))
      return { mime: "application/json", format: "json" };
    if (
      trimmed.match(/^---\s*\n/) ||
      trimmed.match(/^[a-zA-Z_][a-zA-Z0-9_]*:\s/m)
    )
      return { mime: "application/yaml", format: "yaml" };
    if (trimmed.match(/^\[.*\]\s*\n/m) || trimmed.match(/^[a-zA-Z_]+\s*=\s*/m))
      return { mime: "application/toml", format: "toml" };
    if (trimmed.startsWith("<!DOCTYPE html") || trimmed.startsWith("<html"))
      return { mime: "text/html", format: "html" };
    if (trimmed.startsWith("<?xml") || trimmed.startsWith("<"))
      return { mime: "text/xml", format: "xml" };
    if (trimmed.match(/^#\s+.+/m) || trimmed.match(/\*\*.+\*\*/))
      return { mime: "text/markdown", format: "markdown" };
    // CSV/TSV heuristic: consistent delimiter
    const firstLine = trimmed.split("\n")[0] ?? "";
    if ((firstLine.match(/,/g) ?? []).length >= 2)
      return { mime: "text/csv", format: "csv" };
    if ((firstLine.match(/\t/g) ?? []).length >= 1)
      return { mime: "text/tab-separated-values", format: "tsv" };
    return { mime: "text/plain", format: "txt" };
  } catch {
    return null;
  }
}

// ── Compute SHA-256 ──────────────────────────────────────────────────────────

function computeSha256(filePath: string): string {
  const hash = crypto.createHash("sha256");
  const buf = fs.readFileSync(filePath);
  hash.update(buf);
  return hash.digest("hex");
}

// ── Dangerous file check ────────────────────────────────────────────────────

const DANGEROUS_MIMES = new Set([
  "application/x-dosexec",
  "application/x-msdownload",
  "application/x-msdos-program",
]);

const DANGEROUS_EXTENSIONS = new Set([
  "exe",
  "dll",
  "msi",
  "bat",
  "cmd",
  "com",
  "ps1",
  "vbs",
  "js",
  "jar",
  "scr",
  "pif",
  "hta",
  "wsf",
  "reg",
  "lnk",
]);

// ── Extension vs content probe reconciliation ────────────────────────────────

/**
 * When the file extension is a well-known text format, it overrides the content
 * heuristic to prevent common misdetections:
 * - .md/.markdown with YAML frontmatter → should stay markdown, not yaml
 * - .html with JSON-LD script blocks → should stay html, not json
 * - .txt with key:value lines → should stay txt, not yaml/toml
 *
 * Returns corrected {mime, format} if the extension should win, null otherwise.
 */
const EXTENSION_AUTHORITATIVE_FORMATS: Record<
  string,
  { mime: string; format: string }
> = {
  md: { mime: "text/markdown", format: "markdown" },
  markdown: { mime: "text/markdown", format: "markdown" },
  html: { mime: "text/html", format: "html" },
  htm: { mime: "text/html", format: "html" },
  rst: { mime: "text/x-rst", format: "rst" },
  tex: { mime: "application/x-latex", format: "latex" },
  latex: { mime: "application/x-latex", format: "latex" },
};

function reconcileExtensionVsProbe(
  ext: string,
  probeFormat: string,
): { mime: string; format: string } | null {
  const authoritative = EXTENSION_AUTHORITATIVE_FORMATS[ext];
  if (!authoritative) return null;

  // If the probe agrees with the extension, no override needed
  if (probeFormat === authoritative.format) return null;

  // Extension is authoritative — override the probe
  return authoritative;
}

// ── Main detector ─────────────────────────────────────────────────────────────

export interface DetectionResult {
  category: FileCategory;
  detectedMimeType: string | null;
  detectedFormat: string | null;
  attributes: FileAttributes;
  warnings: DescriptorWarning[];
}

export async function detectFile(filePath: string): Promise<DetectionResult> {
  const warnings: DescriptorWarning[] = [];
  const ext = path.extname(filePath).replace(".", "").toLowerCase();
  let mime: string | null = null;
  let format: string | null = null;

  // 1. Magic bytes
  const magic = await detectByMagic(filePath);
  if (magic) {
    mime = magic.mime;
    format = magic.format;
  }

  // 2. For ZIP: probe internal structure
  if (format === "zip") {
    const zipProbe = probeZipContents(filePath, ext || null);
    mime = zipProbe.mime;
    format = zipProbe.format;
  }

  // 3. Text structure probe when no binary magic found
  if (!mime) {
    const textProbe = probeTextStructure(filePath);
    if (textProbe) {
      mime = textProbe.mime;
      format = textProbe.format;
    }
  }

  // 3b. Extension override: when the file extension is a well-known text format,
  // the extension takes priority over content heuristics. This prevents files
  // like .md with YAML frontmatter being misdetected as YAML.
  if (ext && format) {
    const corrected = reconcileExtensionVsProbe(ext, format);
    if (corrected) {
      mime = corrected.mime;
      format = corrected.format;
    }
  }

  // 4. Extension fallback
  const extCategory = ext ? (EXT_CATEGORY[ext] ?? null) : null;

  // 5. Derive category
  let category: FileCategory = "unknown";
  if (mime) {
    category = mimeToCategory(mime) ?? extCategory ?? "unknown";
  } else if (extCategory) {
    category = extCategory;
    warnings.push({
      code: "MIME_FROM_EXTENSION",
      message: "Tipo MIME derivado solo de la extensión",
      severity: "info",
    });
  }

  // 6. Warn on executable
  if (mime && DANGEROUS_MIMES.has(mime)) {
    warnings.push({
      code: "EXECUTABLE_REJECTED",
      message: "El archivo es un ejecutable y no puede convertirse",
      severity: "danger",
    });
    category = "unknown";
  }
  if (ext && DANGEROUS_EXTENSIONS.has(ext)) {
    warnings.push({
      code: "DANGEROUS_EXTENSION",
      message: `Extensión peligrosa detectada: .${ext}`,
      severity: "danger",
    });
  }

  // 7. Extension / MIME mismatch warning
  if (ext && mime && extCategory && extCategory !== category) {
    warnings.push({
      code: "MIME_EXTENSION_MISMATCH",
      message: `La extensión ".${ext}" no coincide con el tipo detectado (${mime})`,
      severity: "warning",
    });
  }

  // 8. Build basic attributes
  const attributes: FileAttributes = buildAttributes(category, format);

  return {
    category,
    detectedMimeType: mime,
    detectedFormat: format,
    attributes,
    warnings,
  };
}

function buildAttributes(
  category: FileCategory,
  format: string | null,
): FileAttributes {
  switch (category) {
    case "audio":
    case "video":
      return {
        kind: "media",
        durationSeconds: null,
        bitrate: null,
        hasAudio: category === "audio",
        hasVideo: category === "video",
        hasSubtitles: false,
        audioCodec: null,
        videoCodec: null,
        width: null,
        height: null,
        fps: null,
      };
    case "image":
      return {
        kind: "image",
        width: 0,
        height: 0,
        channels: null,
        hasAlpha: false,
        format: format,
        colorSpace: null,
        animated: false,
        frames: 1,
        densityPpi: null,
        iccProfile: null,
      };
    case "document":
      return {
        kind: "document",
        pageCount: null,
        wordCount: null,
        hasMacros: false,
        hasEmbeddedMedia: false,
        encoding: null,
        language: null,
      };
    case "spreadsheet":
      return {
        kind: "spreadsheet",
        sheetCount: null,
        rowCount: null,
        columnCount: null,
        hasMacros: false,
        hasFormulas: false,
        hasCharts: false,
      };
    case "presentation":
      return {
        kind: "presentation",
        slideCount: null,
        hasMacros: false,
        hasEmbeddedMedia: false,
        hasAnimations: false,
      };
    case "pdf":
      return {
        kind: "pdf",
        pageCount: null,
        isEncrypted: false,
        isLinearized: false,
        pdfVersion: null,
        hasAnnotations: false,
        hasForms: false,
        hasEmbeddedFiles: false,
      };
    case "ebook":
      return {
        kind: "ebook",
        hasDrm: false,
        pageCount: null,
        title: null,
        author: null,
        language: null,
        publisher: null,
        ebookFormat: format,
      };
    case "archive":
      return {
        kind: "archive",
        entryCount: null,
        uncompressedBytes: null,
        expansionRatio: null,
        isEncrypted: false,
        maxDepth: null,
        hasDangerousPaths: false,
        archiveFormat: format,
      };
    case "structured-data":
      return {
        kind: "structured-data",
        format: format ?? "unknown",
        rowCount: null,
        columnCount: null,
        encoding: "utf-8",
        isTabular: ["csv", "tsv"].includes(format ?? ""),
        hasNestedStructures: false,
        hasXmlEntities: false,
      };
    case "plain-text":
      return {
        kind: "text",
        encoding: "utf-8",
        lineCount: null,
        format: format ?? "txt",
      };
    default:
      return { kind: "unknown" };
  }
}

// ── Build full descriptor ────────────────────────────────────────────────────

export async function buildDescriptor(
  filePath: string,
  source: InputSource,
  id: string,
): Promise<UniversalFileDescriptor> {
  const stat = fs.statSync(filePath);
  const originalName =
    source.kind === "local-upload"
      ? source.originalName
      : path.basename(filePath);
  const ext = path.extname(originalName).replace(".", "").toLowerCase() || null;

  const detection = await detectFile(filePath);
  const sha256 = computeSha256(filePath);

  return {
    id,
    category: detection.category,
    originalName,
    extension: ext,
    detectedMimeType: detection.detectedMimeType,
    detectedFormat: detection.detectedFormat,
    sizeBytes: stat.size,
    sha256,
    source,
    attributes: detection.attributes,
    warnings: detection.warnings,
    analyzedBy: ["file-detector"],
    analyzedAt: new Date().toISOString(),
  };
}
