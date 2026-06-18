import type { BrowserStructuredFormat } from "./types";

/** Single source of truth for all 17 browser-safe conversion routes. */
export const BROWSER_CONVERSION_MATRIX = {
  json: ["yaml", "toml", "xml", "csv", "tsv"],
  yaml: ["json", "toml", "xml"],
  toml: ["json", "yaml", "xml"],
  xml: ["json", "yaml"],
  csv: ["tsv", "json"],
  tsv: ["csv", "json"],
} as const satisfies Record<BrowserStructuredFormat, readonly BrowserStructuredFormat[]>;

export type BrowserConversionMatrix = typeof BROWSER_CONVERSION_MATRIX;

/** Returns all target formats for a given source format, or [] if not supported. */
export function getTargetsForFormat(source: BrowserStructuredFormat): readonly BrowserStructuredFormat[] {
  return BROWSER_CONVERSION_MATRIX[source] ?? [];
}

/** Total number of conversion routes (17). */
export const BROWSER_ROUTE_COUNT = Object.values(BROWSER_CONVERSION_MATRIX).reduce(
  (sum, targets) => sum + targets.length,
  0
);

/** Human-readable display table for the conversion matrix. */
export const BROWSER_MATRIX_DISPLAY: Array<{ input: string; outputs: string[] }> = [
  { input: "JSON", outputs: ["YAML", "TOML", "XML", "CSV", "TSV"] },
  { input: "YAML / YML", outputs: ["JSON", "TOML", "XML"] },
  { input: "TOML", outputs: ["JSON", "YAML", "XML"] },
  { input: "XML", outputs: ["JSON", "YAML"] },
  { input: "CSV", outputs: ["TSV", "JSON"] },
  { input: "TSV", outputs: ["CSV", "JSON"] },
];

/** Categories that require the Desktop app (for the UI section). */
export const DESKTOP_REQUIRED_CATEGORIES = [
  {
    label: "Audio",
    formats: ["MP3", "M4A", "WAV", "FLAC", "OGG"],
  },
  {
    label: "Vídeo",
    formats: ["MP4", "WebM", "MKV", "GIF", "extracción de audio", "recorte", "miniaturas"],
  },
  {
    label: "Imágenes avanzadas",
    formats: ["AVIF no soportado por el navegador", "TIFF", "GIF animado", "HEIC", "RAW", "eliminación de fondo"],
  },
  {
    label: "Documentos y Office",
    formats: ["DOCX", "DOC", "ODT", "RTF", "XLSX", "XLS", "ODS", "PPTX", "PPT", "ODP"],
  },
  {
    label: "PDF avanzado y OCR",
    formats: ["OCR", "PDF a Word", "Office a PDF", "descifrar PDF", "optimización avanzada"],
  },
  {
    label: "Ebooks",
    formats: ["EPUB", "MOBI", "AZW3"],
  },
  {
    label: "Archivos comprimidos",
    formats: ["ZIP", "7Z", "TAR", "GZ", "RAR", "BZ2"],
  },
  {
    label: "YouTube y funciones avanzadas",
    formats: ["URL de YouTube", "procesamiento por lotes", "historial"],
  },
] as const;
