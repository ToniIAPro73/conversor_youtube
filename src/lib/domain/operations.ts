/**
 * Operation catalog — canonical source of truth for all supported operations.
 * The UI reads from this catalog to show only compatible operations.
 * Engines read from this catalog to map operation IDs to conversion parameters.
 */

export type LossProfile = "lossless" | "lossy" | "structural-risk" | "lossy-controlled";

export type MobilePortability =
  | "portable-domain"    // Same engine runs on mobile (browser API or WASM)
  | "replace-adapter-on-mobile"  // Mobile uses a different adapter
  | "desktop-only";      // Requires desktop binary, no mobile equivalent

export type ResourceProfile = "low" | "medium" | "high";

export interface OperationDefinition {
  id: string;
  category: string;
  labelKey: string;
  descriptionKey: string;
  inputFormats: string[];
  outputFormats: string[];
  engineId: string;
  dependencies: string[];
  optionsSchema: OperationOptionsSchema;
  lossProfile: LossProfile;
  mobilePortability: MobilePortability;
  resourceProfile: ResourceProfile;
  supportsBatch: boolean;
}

export interface OperationOptionsSchema {
  type: "object";
  properties: Record<string, OptionProperty>;
  required?: string[];
}

export interface OptionProperty {
  type: "string" | "number" | "boolean" | "enum";
  label: string;
  default?: unknown;
  enum?: string[];
  min?: number;
  max?: number;
  description?: string;
}

// ── PDF Operations ────────────────────────────────────────────────────────────

const PDF_OPERATIONS: OperationDefinition[] = [
  {
    id: "pdf:merge",
    category: "pdf",
    labelKey: "op.pdf.merge",
    descriptionKey: "op.pdf.merge.desc",
    inputFormats: ["pdf"],
    outputFormats: ["pdf"],
    engineId: "qpdf",
    dependencies: ["qpdf"],
    lossProfile: "lossless",
    mobilePortability: "desktop-only",
    resourceProfile: "low",
    supportsBatch: false,
    optionsSchema: {
      type: "object",
      properties: {
        additionalFiles: { type: "string", label: "Archivos adicionales (rutas separadas por coma)" },
      },
    },
  },
  {
    id: "pdf:split",
    category: "pdf",
    labelKey: "op.pdf.split",
    descriptionKey: "op.pdf.split.desc",
    inputFormats: ["pdf"],
    outputFormats: ["pdf"],
    engineId: "qpdf",
    dependencies: ["qpdf"],
    lossProfile: "lossless",
    mobilePortability: "desktop-only",
    resourceProfile: "low",
    supportsBatch: false,
    optionsSchema: {
      type: "object",
      properties: {
        pageRange: { type: "string", label: "Rango de páginas (ej: 1-3,5,7-9)", default: "1-1" },
      },
      required: ["pageRange"],
    },
  },
  {
    id: "pdf:linearize",
    category: "pdf",
    labelKey: "op.pdf.linearize",
    descriptionKey: "op.pdf.linearize.desc",
    inputFormats: ["pdf"],
    outputFormats: ["pdf"],
    engineId: "qpdf",
    dependencies: ["qpdf"],
    lossProfile: "lossless",
    mobilePortability: "desktop-only",
    resourceProfile: "low",
    supportsBatch: true,
    optionsSchema: { type: "object", properties: {} },
  },
  {
    id: "pdf:rotate",
    category: "pdf",
    labelKey: "op.pdf.rotate",
    descriptionKey: "op.pdf.rotate.desc",
    inputFormats: ["pdf"],
    outputFormats: ["pdf"],
    engineId: "qpdf",
    dependencies: ["qpdf"],
    lossProfile: "lossless",
    mobilePortability: "desktop-only",
    resourceProfile: "low",
    supportsBatch: false,
    optionsSchema: {
      type: "object",
      properties: {
        angle: { type: "enum", label: "Ángulo", enum: ["90", "180", "270"], default: "90" },
        pages: { type: "string", label: "Páginas (vacío = todas)", default: "" },
      },
    },
  },
  {
    id: "pdf:to-png",
    category: "pdf",
    labelKey: "op.pdf.to-png",
    descriptionKey: "op.pdf.to-png.desc",
    inputFormats: ["pdf"],
    outputFormats: ["png"],
    engineId: "qpdf",
    dependencies: ["qpdf", "pdftoppm"],
    lossProfile: "lossy-controlled",
    mobilePortability: "desktop-only",
    resourceProfile: "medium",
    supportsBatch: false,
    optionsSchema: {
      type: "object",
      properties: {
        dpi: { type: "number", label: "Resolución (DPI)", default: 150, min: 72, max: 600 },
        page: { type: "number", label: "Página (0 = todas)", default: 1, min: 0 },
      },
    },
  },
  {
    id: "pdf:ocr",
    category: "pdf",
    labelKey: "op.pdf.ocr",
    descriptionKey: "op.pdf.ocr.desc",
    inputFormats: ["pdf"],
    outputFormats: ["txt"],
    engineId: "tesseract",
    dependencies: ["tesseract", "pdftoppm"],
    lossProfile: "lossy",
    mobilePortability: "desktop-only",
    resourceProfile: "high",
    supportsBatch: false,
    optionsSchema: {
      type: "object",
      properties: {
        lang: { type: "enum", label: "Idioma OCR", enum: ["spa", "eng", "spa+eng"], default: "spa" },
        maxPages: { type: "number", label: "Máximo de páginas", default: 50, min: 1, max: 50 },
      },
    },
  },
];

// ── Image Operations ──────────────────────────────────────────────────────────

const IMAGE_OPERATIONS: OperationDefinition[] = [
  {
    id: "image:convert",
    category: "image",
    labelKey: "op.image.convert",
    descriptionKey: "op.image.convert.desc",
    inputFormats: ["jpeg", "png", "webp", "avif", "tiff", "gif"],
    outputFormats: ["jpeg", "png", "webp", "avif", "tiff"],
    engineId: "sharp-image",
    dependencies: ["sharp"],
    lossProfile: "lossy-controlled",
    mobilePortability: "replace-adapter-on-mobile",
    resourceProfile: "low",
    supportsBatch: true,
    optionsSchema: {
      type: "object",
      properties: {
        quality: { type: "number", label: "Calidad (1-100)", default: 85, min: 1, max: 100 },
        stripMetadata: { type: "boolean", label: "Eliminar metadatos", default: true },
      },
    },
  },
  {
    id: "image:resize",
    category: "image",
    labelKey: "op.image.resize",
    descriptionKey: "op.image.resize.desc",
    inputFormats: ["jpeg", "png", "webp", "avif", "tiff"],
    outputFormats: ["jpeg", "png", "webp", "avif", "tiff"],
    engineId: "sharp-image",
    dependencies: ["sharp"],
    lossProfile: "lossy-controlled",
    mobilePortability: "replace-adapter-on-mobile",
    resourceProfile: "low",
    supportsBatch: true,
    optionsSchema: {
      type: "object",
      properties: {
        width: { type: "number", label: "Ancho (px)", min: 1, max: 16000 },
        height: { type: "number", label: "Alto (px)", min: 1, max: 16000 },
        fit: { type: "enum", label: "Ajuste", enum: ["cover", "contain", "fill", "inside", "outside"], default: "inside" },
        quality: { type: "number", label: "Calidad (1-100)", default: 85, min: 1, max: 100 },
      },
    },
  },
  {
    id: "image:favicon",
    category: "image",
    labelKey: "op.image.favicon",
    descriptionKey: "op.image.favicon.desc",
    inputFormats: ["png", "svg"],
    outputFormats: ["ico"],
    engineId: "sharp-image",
    dependencies: ["sharp"],
    lossProfile: "lossy-controlled",
    mobilePortability: "desktop-only",
    resourceProfile: "low",
    supportsBatch: false,
    optionsSchema: {
      type: "object",
      properties: {
        sizes: { type: "string", label: "Tamaños (px, separados por coma)", default: "16,32,48,64,128,256" },
      },
    },
  },
  {
    id: "image:optimize",
    category: "image",
    labelKey: "op.image.optimize",
    descriptionKey: "op.image.optimize.desc",
    inputFormats: ["jpeg", "png", "webp", "gif"],
    outputFormats: ["jpeg", "png", "webp"],
    engineId: "sharp-image",
    dependencies: ["sharp"],
    lossProfile: "lossy-controlled",
    mobilePortability: "replace-adapter-on-mobile",
    resourceProfile: "low",
    supportsBatch: true,
    optionsSchema: {
      type: "object",
      properties: {
        targetKb: { type: "number", label: "Tamaño objetivo (KB)", min: 10, max: 50000 },
        quality: { type: "number", label: "Calidad máxima (1-100)", default: 85, min: 1, max: 100 },
        stripMetadata: { type: "boolean", label: "Eliminar metadatos", default: true },
      },
    },
  },
];

// ── Audio/Video Operations ────────────────────────────────────────────────────

const MEDIA_OPERATIONS: OperationDefinition[] = [
  {
    id: "media:convert-audio",
    category: "audio",
    labelKey: "op.media.convert-audio",
    descriptionKey: "op.media.convert-audio.desc",
    inputFormats: ["mp3", "wav", "flac", "ogg", "m4a", "aac"],
    outputFormats: ["mp3", "wav", "flac", "ogg", "m4a"],
    engineId: "ffmpeg-media",
    dependencies: ["ffmpeg"],
    lossProfile: "lossy-controlled",
    mobilePortability: "desktop-only",
    resourceProfile: "low",
    supportsBatch: true,
    optionsSchema: {
      type: "object",
      properties: {
        bitrate: { type: "enum", label: "Bitrate", enum: ["64k", "128k", "192k", "256k", "320k"], default: "192k" },
        normalize: { type: "boolean", label: "Normalizar EBU R128", default: false },
      },
    },
  },
  {
    id: "media:convert-video",
    category: "video",
    labelKey: "op.media.convert-video",
    descriptionKey: "op.media.convert-video.desc",
    inputFormats: ["mp4", "webm", "mkv", "avi", "mov"],
    outputFormats: ["mp4", "webm", "mkv"],
    engineId: "ffmpeg-media",
    dependencies: ["ffmpeg"],
    lossProfile: "lossy-controlled",
    mobilePortability: "desktop-only",
    resourceProfile: "high",
    supportsBatch: false,
    optionsSchema: {
      type: "object",
      properties: {
        videoBitrate: { type: "string", label: "Bitrate de vídeo (ej: 2M)", default: "2M" },
        audioBitrate: { type: "enum", label: "Bitrate de audio", enum: ["96k", "128k", "192k", "256k"], default: "128k" },
        resolution: { type: "enum", label: "Resolución", enum: ["original", "1080p", "720p", "480p", "360p"], default: "original" },
      },
    },
  },
  {
    id: "media:trim",
    category: "audio",
    labelKey: "op.media.trim",
    descriptionKey: "op.media.trim.desc",
    inputFormats: ["mp3", "wav", "flac", "ogg", "m4a", "mp4", "webm", "mkv"],
    outputFormats: ["mp3", "wav", "flac", "mp4", "webm"],
    engineId: "ffmpeg-media",
    dependencies: ["ffmpeg"],
    lossProfile: "lossy-controlled",
    mobilePortability: "desktop-only",
    resourceProfile: "low",
    supportsBatch: false,
    optionsSchema: {
      type: "object",
      properties: {
        start: { type: "string", label: "Inicio (HH:MM:SS)", default: "00:00:00" },
        end: { type: "string", label: "Fin (HH:MM:SS o vacío = final)", default: "" },
      },
      required: ["start"],
    },
  },
  {
    id: "media:extract-audio",
    category: "video",
    labelKey: "op.media.extract-audio",
    descriptionKey: "op.media.extract-audio.desc",
    inputFormats: ["mp4", "webm", "mkv", "avi", "mov"],
    outputFormats: ["mp3", "wav", "flac", "ogg", "m4a"],
    engineId: "ffmpeg-media",
    dependencies: ["ffmpeg"],
    lossProfile: "lossy-controlled",
    mobilePortability: "desktop-only",
    resourceProfile: "low",
    supportsBatch: true,
    optionsSchema: {
      type: "object",
      properties: {
        format: { type: "enum", label: "Formato de salida", enum: ["mp3", "wav", "flac", "ogg", "m4a"], default: "mp3" },
        bitrate: { type: "enum", label: "Bitrate", enum: ["128k", "192k", "256k", "320k"], default: "192k" },
      },
    },
  },
  {
    id: "media:thumbnail",
    category: "video",
    labelKey: "op.media.thumbnail",
    descriptionKey: "op.media.thumbnail.desc",
    inputFormats: ["mp4", "webm", "mkv", "avi", "mov"],
    outputFormats: ["jpeg", "png"],
    engineId: "ffmpeg-media",
    dependencies: ["ffmpeg"],
    lossProfile: "lossy-controlled",
    mobilePortability: "desktop-only",
    resourceProfile: "low",
    supportsBatch: false,
    optionsSchema: {
      type: "object",
      properties: {
        time: { type: "string", label: "Tiempo del fotograma (HH:MM:SS)", default: "00:00:01" },
        format: { type: "enum", label: "Formato", enum: ["jpeg", "png"], default: "jpeg" },
      },
    },
  },
  {
    id: "media:normalize-audio",
    category: "audio",
    labelKey: "op.media.normalize-audio",
    descriptionKey: "op.media.normalize-audio.desc",
    inputFormats: ["mp3", "wav", "flac", "ogg", "m4a"],
    outputFormats: ["mp3", "wav", "flac", "ogg", "m4a"],
    engineId: "ffmpeg-media",
    dependencies: ["ffmpeg"],
    lossProfile: "lossy-controlled",
    mobilePortability: "desktop-only",
    resourceProfile: "medium",
    supportsBatch: true,
    optionsSchema: {
      type: "object",
      properties: {
        targetLufs: { type: "number", label: "LUFS objetivo (EBU R128: -23)", default: -23, min: -70, max: 0 },
      },
    },
  },
];

// ── Document Operations ───────────────────────────────────────────────────────

const DOCUMENT_OPERATIONS: OperationDefinition[] = [
  {
    id: "doc:convert",
    category: "document",
    labelKey: "op.doc.convert",
    descriptionKey: "op.doc.convert.desc",
    inputFormats: ["md", "html", "rst", "docx", "odt", "tex"],
    outputFormats: ["md", "html", "docx", "odt", "pdf", "txt"],
    engineId: "pandoc",
    dependencies: ["pandoc"],
    lossProfile: "structural-risk",
    mobilePortability: "desktop-only",
    resourceProfile: "low",
    supportsBatch: false,
    optionsSchema: { type: "object", properties: {} },
  },
  {
    id: "office:to-pdf",
    category: "document",
    labelKey: "op.office.to-pdf",
    descriptionKey: "op.office.to-pdf.desc",
    inputFormats: ["docx", "xlsx", "pptx", "odt", "ods", "odp"],
    outputFormats: ["pdf"],
    engineId: "libreoffice",
    dependencies: ["libreoffice"],
    lossProfile: "lossy-controlled",
    mobilePortability: "desktop-only",
    resourceProfile: "medium",
    supportsBatch: true,
    optionsSchema: { type: "object", properties: {} },
  },
];

// ── Automation Recipe schema ──────────────────────────────────────────────────

export interface RecipeDefinition {
  schemaVersion: "1";
  id: string;
  name: string;
  description: string;
  operations: Array<{
    operationId: string;
    options: Record<string, unknown>;
  }>;
  inputFilter: {
    formats?: string[];
    categories?: string[];
    maxSizeBytes?: number;
  };
  outputNaming: "preserve" | "append-suffix" | "custom";
  outputSuffix?: string;
  concurrency: number;
  onError: "stop" | "skip" | "retry";
  retryCount: number;
}

// ── Catalog export ────────────────────────────────────────────────────────────

export const OPERATION_CATALOG: OperationDefinition[] = [
  ...PDF_OPERATIONS,
  ...IMAGE_OPERATIONS,
  ...MEDIA_OPERATIONS,
  ...DOCUMENT_OPERATIONS,
];

/** Returns operations compatible with a given input format */
export function getCompatibleOperations(
  inputFormat: string,
  availableEngines: Set<string>
): OperationDefinition[] {
  return OPERATION_CATALOG.filter(
    (op) =>
      op.inputFormats.includes(inputFormat) &&
      availableEngines.has(op.engineId) &&
      op.dependencies.every((dep) => availableEngines.has(dep) || dep === "sharp")
  );
}

/** Returns all unique output formats for a given input format */
export function getOutputFormats(inputFormat: string): string[] {
  const formats = new Set<string>();
  for (const op of OPERATION_CATALOG) {
    if (op.inputFormats.includes(inputFormat)) {
      for (const fmt of op.outputFormats) formats.add(fmt);
    }
  }
  return Array.from(formats).sort();
}
