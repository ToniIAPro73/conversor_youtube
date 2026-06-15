// Universal file descriptor — the common language between engines and the UI.

export type FileCategory =
  | "audio"
  | "video"
  | "image"
  | "document"
  | "spreadsheet"
  | "presentation"
  | "pdf"
  | "ebook"
  | "archive"
  | "structured-data"
  | "plain-text"
  | "unknown";

export type InputSource =
  | { kind: "remote-url"; url: string; normalizedUrl: string }
  | { kind: "local-upload"; originalName: string; storedRelativePath: string };

export type LossProfile = "lossless" | "lossy" | "structure-risk" | "metadata-risk" | "none";

// ── Per-category attribute shapes ──────────────────────────────────────────

export interface MediaAttributes {
  kind: "media";
  durationSeconds: number | null;
  bitrate: number | null;
  hasAudio: boolean;
  hasVideo: boolean;
  hasSubtitles: boolean;
  audioCodec: string | null;
  videoCodec: string | null;
  width: number | null;
  height: number | null;
  fps: number | null;
}

export interface ImageAttributes {
  kind: "image";
  width: number;
  height: number;
  channels: number | null;
  hasAlpha: boolean;
  format: string | null;
  colorSpace: string | null;
  animated: boolean;
  frames: number;
  densityPpi: number | null;
  iccProfile: string | null;
}

export interface DocumentAttributes {
  kind: "document";
  pageCount: number | null;
  wordCount: number | null;
  hasMacros: boolean;
  hasEmbeddedMedia: boolean;
  encoding: string | null;
  language: string | null;
}

export interface SpreadsheetAttributes {
  kind: "spreadsheet";
  sheetCount: number | null;
  rowCount: number | null;
  columnCount: number | null;
  hasMacros: boolean;
  hasFormulas: boolean;
  hasCharts: boolean;
}

export interface PresentationAttributes {
  kind: "presentation";
  slideCount: number | null;
  hasMacros: boolean;
  hasEmbeddedMedia: boolean;
  hasAnimations: boolean;
}

export interface PdfAttributes {
  kind: "pdf";
  pageCount: number | null;
  isEncrypted: boolean;
  isLinearized: boolean;
  pdfVersion: string | null;
  hasAnnotations: boolean;
  hasForms: boolean;
  hasEmbeddedFiles: boolean;
}

export interface EbookAttributes {
  kind: "ebook";
  hasDrm: boolean;
  pageCount: number | null;
  title: string | null;
  author: string | null;
  language: string | null;
  publisher: string | null;
  ebookFormat: string | null;
}

export interface ArchiveAttributes {
  kind: "archive";
  entryCount: number | null;
  uncompressedBytes: number | null;
  expansionRatio: number | null;
  isEncrypted: boolean;
  maxDepth: number | null;
  hasDangerousPaths: boolean;
  archiveFormat: string | null;
}

export interface StructuredDataAttributes {
  kind: "structured-data";
  format: "json" | "yaml" | "toml" | "xml" | "csv" | "tsv" | string;
  rowCount: number | null;
  columnCount: number | null;
  encoding: string;
  isTabular: boolean;
  hasNestedStructures: boolean;
  hasXmlEntities: boolean;
}

export interface TextAttributes {
  kind: "text";
  encoding: string;
  lineCount: number | null;
  format: "markdown" | "html" | "rtf" | "txt" | string;
}

export interface UnknownAttributes {
  kind: "unknown";
}

export type FileAttributes =
  | MediaAttributes
  | ImageAttributes
  | DocumentAttributes
  | SpreadsheetAttributes
  | PresentationAttributes
  | PdfAttributes
  | EbookAttributes
  | ArchiveAttributes
  | StructuredDataAttributes
  | TextAttributes
  | UnknownAttributes;

export interface DescriptorWarning {
  code: string;
  message: string;
  severity: "info" | "warning" | "danger";
}

// ── Universal File Descriptor ───────────────────────────────────────────────

export interface UniversalFileDescriptor {
  id: string;
  category: FileCategory;
  originalName: string;
  extension: string | null;
  detectedMimeType: string | null;
  detectedFormat: string | null;
  sizeBytes: number;
  sha256: string | null;
  source: InputSource;
  attributes: FileAttributes;
  warnings: DescriptorWarning[];
  analyzedBy: string[];
  analyzedAt: string;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

export function isMediaDescriptor(d: UniversalFileDescriptor): d is UniversalFileDescriptor & { attributes: MediaAttributes } {
  return d.attributes.kind === "media";
}

export function isImageDescriptor(d: UniversalFileDescriptor): d is UniversalFileDescriptor & { attributes: ImageAttributes } {
  return d.attributes.kind === "image";
}

export function isStructuredDataDescriptor(d: UniversalFileDescriptor): d is UniversalFileDescriptor & { attributes: StructuredDataAttributes } {
  return d.attributes.kind === "structured-data";
}
