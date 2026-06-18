import { basenameWithoutExtension, withExtension } from "../common/filenames";
import { validateImageFile, assertPixelLimit } from "./validators";
import type { ImageMetadataSummary, ImageProcessResult, ImageToolOptions } from "./types";

const MIME_BY_FORMAT = {
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
} as const;

export async function readImageMetadata(file: File): Promise<ImageMetadataSummary> {
  try {
    const exifr = await import("exifr");
    const [tags, orientation, gps] = await Promise.all([
      exifr.parse(file, ["Make", "Model", "Software", "DateTimeOriginal", "CreateDate", "Orientation"]).catch(() => undefined),
      exifr.orientation(file).catch(() => undefined),
      exifr.gps(file).catch(() => undefined),
    ]);
    const make = typeof tags?.Make === "string" ? tags.Make : "";
    const model = typeof tags?.Model === "string" ? tags.Model : "";
    return {
      hasExif: Boolean(tags && Object.keys(tags).length > 0),
      hasGps: Boolean(gps),
      camera: [make, model].filter(Boolean).join(" ") || undefined,
      software: typeof tags?.Software === "string" ? tags.Software : undefined,
      takenAt: String(tags?.DateTimeOriginal ?? tags?.CreateDate ?? "") || undefined,
      orientation,
    };
  } catch {
    return { hasExif: false, hasGps: false };
  }
}

export async function processImage(file: File, options: ImageToolOptions): Promise<ImageProcessResult> {
  await validateImageFile(file);
  const metadata = await readImageMetadata(file);
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    assertPixelLimit(bitmap.width, bitmap.height);
    const dimensions = getTargetDimensions(bitmap.width, bitmap.height, options);
    const canvas = document.createElement("canvas");
    canvas.width = dimensions.width;
    canvas.height = dimensions.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("No hemos podido preparar el lienzo de conversión.");

    if (options.outputFormat === "jpeg") {
      context.fillStyle = options.jpegBackground || "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
    }
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

    const blob = await canvasToBlob(canvas, MIME_BY_FORMAT[options.outputFormat], options.quality);
    const resultFile = new File([blob], withExtension(file.name, options.outputFormat === "jpeg" ? "jpg" : options.outputFormat), {
      type: blob.type,
    });
    const resultMetadata = options.stripMetadata ? await readImageMetadata(resultFile) : metadata;
    const stripVerified = options.stripMetadata ? !resultMetadata.hasExif && !resultMetadata.hasGps : false;
    const warnings: string[] = [];
    if (options.outputFormat === "jpeg") warnings.push("JPEG no conserva transparencia; se ha aplicado el fondo elegido.");
    if (options.stripMetadata && !stripVerified) warnings.push("No se ha podido verificar la eliminación completa de metadatos.");

    return {
      fileName: resultFile.name,
      blob,
      originalBytes: file.size,
      finalBytes: blob.size,
      originalWidth: bitmap.width,
      originalHeight: bitmap.height,
      finalWidth: canvas.width,
      finalHeight: canvas.height,
      metadata,
      metadataStripped: options.stripMetadata,
      stripVerified,
      warnings,
    };
  } finally {
    bitmap.close();
  }
}

function getTargetDimensions(width: number, height: number, options: ImageToolOptions) {
  if (options.resizeMode === "none") return { width, height };
  let targetWidth = width;
  let targetHeight = height;
  const ratio = width / height;
  if (options.resizeMode === "width" && options.width) {
    targetWidth = options.preventUpscale ? Math.min(options.width, width) : options.width;
    targetHeight = Math.round(targetWidth / ratio);
  }
  if (options.resizeMode === "height" && options.height) {
    targetHeight = options.preventUpscale ? Math.min(options.height, height) : options.height;
    targetWidth = Math.round(targetHeight * ratio);
  }
  if (options.resizeMode === "max-side" && options.maxSide) {
    const currentMax = Math.max(width, height);
    const maxSide = options.preventUpscale ? Math.min(options.maxSide, currentMax) : options.maxSide;
    const scale = maxSide / currentMax;
    targetWidth = Math.round(width * scale);
    targetHeight = Math.round(height * scale);
  }
  if (options.resizeMode === "percent" && options.percent) {
    const scale = Math.max(1, options.percent) / 100;
    targetWidth = Math.round(width * scale);
    targetHeight = Math.round(height * scale);
  }
  return { width: Math.max(1, targetWidth), height: Math.max(1, targetHeight) };
}

function canvasToBlob(canvas: HTMLCanvasElement, mimeType: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error("El navegador no puede codificar este formato.")),
      mimeType,
      Math.min(1, Math.max(0.01, quality / 100))
    );
  });
}

export function defaultImageOutputName(name: string, extension: string) {
  return `${basenameWithoutExtension(name)}.${extension}`;
}
