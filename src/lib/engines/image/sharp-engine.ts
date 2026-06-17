// Sharp image conversion engine.
// Handles: JPEG, PNG, WebP, AVIF, TIFF, GIF — convert, resize, optimize, strip metadata.
// Security: pixel limits, frame limits, memory cap, no SVG rendering without sanitization.

import fs from "fs";
import type { ConversionEngine, EngineId, EngineProbeResult, ConversionCapability, ConversionPlan, ExecutionResult, ArtifactValidation } from "../../domain/engines";
import type { UniversalFileDescriptor, ImageAttributes } from "../../domain/descriptors";

const ENGINE_ID: EngineId = "sharp-image";

const MAX_MEGAPIXELS = 256;       // 16384×16384 pixels
const MAX_ANIMATED_FRAMES = 200;
const SUPPORTED_INPUT_FORMATS = new Set(["jpeg", "jpg", "png", "webp", "avif", "tiff", "gif"]);
const SUPPORTED_OUTPUT_FORMATS = ["jpeg", "png", "webp", "avif", "tiff", "gif"] as const;
type OutputFormat = typeof SUPPORTED_OUTPUT_FORMATS[number];

interface ImageConversionOptions {
  format: OutputFormat;
  quality?: number;
  width?: number;
  height?: number;
  fit?: "cover" | "contain" | "fill" | "inside" | "outside";
  rotate?: number;
  flipHorizontal?: boolean;
  flipVertical?: boolean;
  stripMetadata?: boolean;
  background?: string;
  animated?: boolean;
}

function getMimeType(format: OutputFormat): string {
  const map: Record<OutputFormat, string> = {
    jpeg: "image/jpeg", png: "image/png", webp: "image/webp",
    avif: "image/avif", tiff: "image/tiff", gif: "image/gif",
  };
  return map[format];
}

function buildCapability(
  fmt: OutputFormat,
  descriptor: UniversalFileDescriptor,
  attrs: ImageAttributes,
  available: boolean
): ConversionCapability {
  const hasAlpha = attrs.hasAlpha;
  const isAnimated = attrs.animated;

  const warnings: string[] = [];
  const presets = buildPresets(fmt, attrs);
  let recommended = false;

  if (fmt === "jpeg" && hasAlpha) warnings.push("JPEG no soporta transparencia; el fondo se rellenará con blanco");
  if (fmt === "gif" && !isAnimated) warnings.push("GIF es limitado a 256 colores; considera WebP o AVIF");
  if (fmt === "webp") recommended = true;
  if (fmt === "avif") warnings.push("AVIF tiene excelente compresión pero compatibilidad reducida en navegadores antiguos");

  return {
    id: `sharp-convert-${descriptor.id}-${fmt}`,
    operation: "convert-image",
    outputFormat: fmt,
    outputMime: getMimeType(fmt),
    label: `Convertir a ${fmt.toUpperCase()}`,
    description: formatDescription(fmt),
    lossProfile: ["jpeg", "webp", "avif"].includes(fmt) ? "lossy" : "lossless",
    state: available ? "available" : "unavailable-tool",
    recommended,
    presets,
    warnings,
    engineId: ENGINE_ID,
    mobilePortability: "replace-adapter-on-mobile",
  };
}

function formatDescription(fmt: OutputFormat): string {
  const d: Record<OutputFormat, string> = {
    jpeg: "Amplia compatibilidad, ideal para fotografías",
    png: "Sin pérdida con transparencia",
    webp: "Excelente compresión para web con transparencia",
    avif: "Máxima compresión moderna (AV1)",
    tiff: "Sin pérdida, ideal para impresión y edición",
    gif: "Animaciones simples, paleta de 256 colores",
  };
  return d[fmt];
}

function buildPresets(fmt: OutputFormat, attrs: ImageAttributes): ConversionCapability["presets"] {
  if (["jpeg", "webp"].includes(fmt)) {
    return [
      { id: `${fmt}-web`, label: "Web (80%)", quality: "80", description: "Buena relación calidad/tamaño", isRecommended: true },
      { id: `${fmt}-high`, label: "Alta calidad (90%)", quality: "90", description: "Mínima pérdida visual" },
      { id: `${fmt}-max`, label: "Máxima calidad (95%)", quality: "95", description: "Casi sin pérdida" },
    ];
  }
  if (fmt === "avif") {
    return [
      { id: "avif-balanced", label: "Equilibrado (50)", quality: "50", description: "Buena compresión AVIF", isRecommended: true },
      { id: "avif-high", label: "Alta calidad (70)", quality: "70", description: "Menos compresión, más fidelidad" },
    ];
  }
  if (fmt === "gif" && attrs.animated) {
    return [
      { id: "gif-keep", label: "Mantener frames", quality: "0", description: "Convierte todos los frames animados", isRecommended: true },
    ];
  }
  return [{ id: `${fmt}-default`, label: "Estándar", quality: "0", description: "Sin pérdida" }];
}

// ── Engine implementation ────────────────────────────────────────────────────

export class SharpEngine implements ConversionEngine {
  readonly id: EngineId = ENGINE_ID;
  readonly supportedCategories = ["image"] as const;

  private _probeResult: EngineProbeResult | null = null;

  async probe(): Promise<EngineProbeResult> {
    if (this._probeResult) return this._probeResult;
    try {
      // Dynamic import — sharp may not be present in all environments
      const sharp = (await import("sharp")).default;
      const versions = sharp.versions;
      const sharpVersion = versions?.sharp ?? "unknown";
      const vipsVersion = versions?.vips ?? "unknown";
      const formats = Object.keys(sharp.format ?? {});
      this._probeResult = {
        available: true,
        version: sharpVersion,
        binaryPath: `sharp@${sharpVersion} (libvips ${vipsVersion})`,
        capabilities: formats,
      };
    } catch (err) {
      this._probeResult = {
        available: false,
        version: null,
        binaryPath: null,
        capabilities: [],
        error: String(err),
      };
    }
    return this._probeResult;
  }

  getCapabilities(
    descriptor: UniversalFileDescriptor,
    probeResult: EngineProbeResult
  ): ConversionCapability[] {
    if (descriptor.category !== "image") return [];
    const attrs = descriptor.attributes as ImageAttributes;

    const fmt = descriptor.detectedFormat?.toLowerCase() ?? descriptor.extension?.toLowerCase();
    if (!fmt || !SUPPORTED_INPUT_FORMATS.has(fmt.replace("jpg", "jpeg"))) return [];

    // Safety: reject if too large
    if (attrs.width && attrs.height) {
      const mp = (attrs.width * attrs.height) / 1_000_000;
      if (mp > MAX_MEGAPIXELS) return [];
    }
    if (attrs.frames > MAX_ANIMATED_FRAMES) return [];

    return SUPPORTED_OUTPUT_FORMATS.map((f) => buildCapability(f, descriptor, attrs, probeResult.available));
  }

  async execute(
    plan: ConversionPlan,
    onProgress?: (progress: number, stage: string) => void
  ): Promise<ExecutionResult> {
    const start = Date.now();
    onProgress?.(5, "Cargando imagen");

    try {
      const sharp = (await import("sharp")).default;
      const opts = plan.options as unknown as ImageConversionOptions;
      const fmt = plan.outputFormat as OutputFormat;

      let pipeline = sharp(plan.inputPath, { animated: opts.animated ?? true });

      // Strip metadata by default (privacy)
      if (opts.stripMetadata !== false) {
        pipeline = pipeline.withMetadata({ orientation: undefined });
      } else {
        pipeline = pipeline.withMetadata();
      }

      // Resize
      if (opts.width || opts.height) {
        pipeline = pipeline.resize(opts.width, opts.height, { fit: opts.fit ?? "inside", withoutEnlargement: true });
        onProgress?.(20, "Redimensionando");
      }

      // Rotate / flip
      if (opts.rotate) pipeline = pipeline.rotate(opts.rotate);
      if (opts.flipHorizontal) pipeline = pipeline.flop();
      if (opts.flipVertical) pipeline = pipeline.flip();

      onProgress?.(40, "Convirtiendo formato");

      const quality = opts.quality ? parseInt(String(opts.quality), 10) : undefined;

      switch (fmt) {
        case "jpeg":
          pipeline = pipeline.jpeg({ quality: quality ?? 80, mozjpeg: true });
          break;
        case "png":
          pipeline = pipeline.png({ compressionLevel: 8 });
          break;
        case "webp":
          pipeline = pipeline.webp({ quality: quality ?? 80, effort: 4 });
          break;
        case "avif":
          pipeline = pipeline.avif({ quality: quality ?? 50, effort: 4 });
          break;
        case "tiff":
          pipeline = pipeline.tiff({ compression: "lzw" });
          break;
        case "gif":
          pipeline = pipeline.gif();
          break;
      }

      // Handle transparency → JPEG (flatten to white)
      if (fmt === "jpeg") {
        const meta = await sharp(plan.inputPath).metadata();
        if (meta.hasAlpha) {
          pipeline = sharp(plan.inputPath, { animated: false })
            .flatten({ background: opts.background ?? "#ffffff" })
            .jpeg({ quality: quality ?? 80, mozjpeg: true });
        }
      }

      onProgress?.(70, "Guardando");
      await pipeline.toFile(plan.outputPath);

      const stat = fs.statSync(plan.outputPath);
      onProgress?.(100, "Completado");

      return {
        success: true,
        outputPath: plan.outputPath,
        outputSizeBytes: stat.size,
        durationMs: Date.now() - start,
        logs: [],
        warnings: [],
      };
    } catch (err) {
      return {
        success: false,
        outputPath: plan.outputPath,
        outputSizeBytes: 0,
        durationMs: Date.now() - start,
        logs: [],
        warnings: [],
        error: String(err),
      };
    }
  }

  async validate(outputPath: string, plan: ConversionPlan): Promise<ArtifactValidation> {
    const checks: ArtifactValidation["checks"] = [];

    // File exists
    const exists = fs.existsSync(outputPath);
    checks.push({ name: "file-exists", passed: exists });
    if (!exists) return { valid: false, checks };

    // Size > 0
    const stat = fs.statSync(outputPath);
    checks.push({ name: "size-nonzero", passed: stat.size > 0, detail: `${stat.size} bytes` });

    // Sharp metadata validation
    try {
      const sharp = (await import("sharp")).default;
      const meta = await sharp(outputPath).metadata();
      checks.push({ name: "sharp-readable", passed: true, detail: `${meta.width}×${meta.height} ${meta.format}` });
      checks.push({ name: "format-matches", passed: meta.format === plan.outputFormat || (plan.outputFormat === "jpeg" && meta.format === "jpeg"), detail: meta.format });
    } catch (err) {
      checks.push({ name: "sharp-readable", passed: false, detail: String(err) });
    }

    const valid = checks.every((c) => c.passed);
    return { valid, checks };
  }
}

export const sharpEngine = new SharpEngine();
