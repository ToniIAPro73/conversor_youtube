// Calibre ebook conversion engine.
// Handles: EPUB → MOBI, AZW3, PDF; MOBI → EPUB; AZW3 → EPUB; HTML → EPUB; DOCX → EPUB.
// Binary discovery: tools/calibre/ → PATH. Graceful degradation when absent.
// Security: shell:false, path safety checks, file size limits, timeout.

import fs from "fs";
import path from "path";
import type { ConversionEngine, EngineId, EngineProbeResult, ConversionCapability, ConversionPlan, ExecutionResult, ArtifactValidation } from "../../domain/engines";
import type { UniversalFileDescriptor } from "../../domain/descriptors";
import { ProcessRunner } from "../../infrastructure/processes/process-runner";
import { ensurePathSafety } from "../../security/path-safety";
import { CONFIG } from "../../config";

const ENGINE_ID: EngineId = "calibre";

const MAX_INPUT_SIZE_BYTES = 50 * 1024 * 1024; // 50 MB
const DEFAULT_TIMEOUT_MS = 120_000; // 120 seconds

// ── Format definitions ───────────────────────────────────────────────────────

type CalibreInputFormat = "epub" | "mobi" | "azw3" | "html" | "docx";
type CalibreOutputFormat = "mobi" | "azw3" | "pdf" | "epub";

interface FormatDef {
  label: string;
  mime: string;
  ext: string;
}

const INPUT_FORMATS: Record<CalibreInputFormat, FormatDef> = {
  epub: { label: "EPUB", mime: "application/epub+zip", ext: "epub" },
  mobi: { label: "MOBI", mime: "application/x-mobipocket-ebook", ext: "mobi" },
  azw3: { label: "AZW3", mime: "application/vnd.amazon.mobi8-ebook", ext: "azw3" },
  html: { label: "HTML", mime: "text/html", ext: "html" },
  docx: { label: "DOCX", mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", ext: "docx" },
};

const OUTPUT_FORMATS: Record<CalibreOutputFormat, FormatDef> = {
  mobi: { label: "MOBI", mime: "application/x-mobipocket-ebook", ext: "mobi" },
  azw3: { label: "AZW3", mime: "application/vnd.amazon.mobi8-ebook", ext: "azw3" },
  pdf:  { label: "PDF",  mime: "application/pdf", ext: "pdf" },
  epub: { label: "EPUB", mime: "application/epub+zip", ext: "epub" },
};

// Conversion matrix: which output formats are available for each input format
const CONVERSION_MATRIX: Record<CalibreInputFormat, CalibreOutputFormat[]> = {
  epub: ["mobi", "azw3", "pdf"],
  mobi: ["epub"],
  azw3: ["epub"],
  html: ["epub"],
  docx: ["epub"],
};

// Loss profiles for each conversion path
type LossProfile = "lossless" | "lossy" | "metadata-risk" | "structure-risk" | "layout-risk" | "none";

function resolveLossProfile(from: CalibreInputFormat, to: CalibreOutputFormat): LossProfile {
  // EPUB → MOBI/AZW3 may lose layout features
  if ((from === "epub") && (to === "mobi" || to === "azw3")) return "layout-risk";
  // Anything → PDF is lossy (reflowable → fixed layout)
  if (to === "pdf") return "lossy";
  // HTML/DOCX → EPUB may lose metadata
  if ((from === "html" || from === "docx") && to === "epub") return "metadata-risk";
  // MOBI/AZW3 → EPUB is generally good but may lose some features
  if ((from === "mobi" || from === "azw3") && to === "epub") return "metadata-risk";
  return "lossy";
}

function lossWarning(from: CalibreInputFormat, to: CalibreOutputFormat): string | null {
  if ((from === "epub") && (to === "mobi" || to === "azw3")) {
    return "La conversión EPUB a MOBI/AZW3 puede perder funciones de diseño avanzadas y fuentes embebidas";
  }
  if (to === "pdf") {
    return "La conversión a PDF produce un diseño fijo; se pierde la capacidad de reflow del texto";
  }
  if ((from === "html" || from === "docx") && to === "epub") {
    return "Algunos metadatos del documento original pueden no transferirse completamente al EPUB";
  }
  if ((from === "mobi" || from === "azw3") && to === "epub") {
    return "Algunas características específicas del formato Kindle pueden no convertirse correctamente a EPUB";
  }
  return null;
}

function resolveInputFormat(descriptor: UniversalFileDescriptor): CalibreInputFormat | null {
  const ext = (descriptor.extension ?? "").toLowerCase();
  const fmt = (descriptor.detectedFormat ?? "").toLowerCase();
  const key = ext || fmt;
  if (key in INPUT_FORMATS) return key as CalibreInputFormat;
  // Handle htm → html
  if (key === "htm") return "html";
  return null;
}

function buildCapability(
  fromFmt: CalibreInputFormat,
  toFmt: CalibreOutputFormat,
  descriptor: UniversalFileDescriptor,
  available: boolean
): ConversionCapability {
  const fromDef = INPUT_FORMATS[fromFmt];
  const toDef = OUTPUT_FORMATS[toFmt];
  const loss = resolveLossProfile(fromFmt, toFmt);
  const warn = lossWarning(fromFmt, toFmt);

  return {
    id: `calibre-${descriptor.id}-${fromFmt}-${toFmt}`,
    operation: "convert-ebook",
    outputFormat: toDef.ext,
    outputMime: toDef.mime,
    label: `Convertir a ${toDef.label}`,
    description: `${fromDef.label} → ${toDef.label}`,
    lossProfile: loss,
    state: available ? "available" : "unavailable-tool",
    unavailableReason: available ? undefined : "Calibre (ebook-convert) no está instalado. Instálalo desde calibre-ebook.com.",
    recommended: toFmt === "epub" || (fromFmt === "epub" && toFmt === "mobi"),
    presets: [
      {
        id: `${fromFmt}-${toFmt}-default`,
        label: "Estándar",
        quality: "0",
        description: `Conversión directa de ${fromDef.label} a ${toDef.label}`,
        isRecommended: true,
      },
    ],
    warnings: warn ? [warn] : [],
    engineId: ENGINE_ID,
    mobilePortability: "desktop-only",
  };
}

// ── Binary discovery ─────────────────────────────────────────────────────────

function findEbookConvertBinary(): string {
  // 1. Prefer LINK2MEDIA_CALIBRE_PATH env var (portable distribution)
  const envPath = CONFIG.media.binaries.calibre;
  if (envPath && envPath !== "ebook-convert") return envPath;
  // 2. Portable path relative to cwd
  const portablePaths = [
    path.resolve(process.cwd(), "tools", "calibre", "ebook-convert.exe"),
    path.resolve(process.cwd(), "tools", "calibre", "ebook-convert"),
  ];
  for (const p of portablePaths) {
    if (fs.existsSync(p)) return p;
  }
  // 3. Fall back to PATH
  return "ebook-convert";
}

// ── Engine implementation ────────────────────────────────────────────────────

export class CalibreEngine implements ConversionEngine {
  readonly id: EngineId = ENGINE_ID;
  readonly supportedCategories = ["ebook"] as const;

  private _probeResult: EngineProbeResult | null = null;
  private _runner: ProcessRunner | null = null;

  private getRunner(): ProcessRunner {
    if (!this._runner) this._runner = new ProcessRunner(findEbookConvertBinary(), DEFAULT_TIMEOUT_MS);
    return this._runner;
  }

  async probe(): Promise<EngineProbeResult> {
    if (this._probeResult) return this._probeResult;
    const result = await this.getRunner().probe(["--version"]);
    this._probeResult = {
      available: result.available,
      version: result.version,
      binaryPath: result.binaryPath,
      capabilities: result.available ? Object.keys(CONVERSION_MATRIX) : [],
      error: result.available ? undefined : "Calibre (ebook-convert) no encontrado. Instálalo desde calibre-ebook.com o usa el ZIP portable.",
    };
    return this._probeResult;
  }

  getCapabilities(
    descriptor: UniversalFileDescriptor,
    probeResult: EngineProbeResult
  ): ConversionCapability[] {
    if (descriptor.category !== "ebook" && descriptor.category !== "document") return [];

    const fromFmt = resolveInputFormat(descriptor);
    if (!fromFmt) return [];

    // Check input size
    if (descriptor.sizeBytes > MAX_INPUT_SIZE_BYTES) return [];

    const outputFormats = CONVERSION_MATRIX[fromFmt] ?? [];
    return outputFormats.map((toFmt) => buildCapability(fromFmt, toFmt, descriptor, probeResult.available));
  }

  async execute(
    plan: ConversionPlan,
    onProgress?: (progress: number, stage: string) => void
  ): Promise<ExecutionResult> {
    const start = Date.now();
    onProgress?.(10, "Preparando conversión de ebook");

    try {
      ensurePathSafety(plan.inputPath);
      ensurePathSafety(plan.outputPath);
    } catch (err) {
      return {
        success: false,
        outputPath: plan.outputPath,
        outputSizeBytes: 0,
        durationMs: 0,
        logs: [],
        warnings: [],
        error: String(err),
      };
    }

    // Verify input file size
    try {
      const inputStat = fs.statSync(plan.inputPath);
      if (inputStat.size > MAX_INPUT_SIZE_BYTES) {
        return {
          success: false,
          outputPath: plan.outputPath,
          outputSizeBytes: 0,
          durationMs: Date.now() - start,
          logs: [],
          warnings: [],
          error: `Input file exceeds maximum size limit (${MAX_INPUT_SIZE_BYTES / 1024 / 1024}MB)`,
        };
      }
    } catch (err) {
      return {
        success: false,
        outputPath: plan.outputPath,
        outputSizeBytes: 0,
        durationMs: Date.now() - start,
        logs: [],
        warnings: [],
        error: `Cannot read input file: ${String(err)}`,
      };
    }

    // Build ebook-convert arguments
    const extraArgs: string[] = [];
    const opts = plan.options;

    // Allow passing Calibre-specific options
    if (opts.title) extraArgs.push("--title", String(opts.title));
    if (opts.author) extraArgs.push("--author", String(opts.author));
    if (opts.language) extraArgs.push("--language", String(opts.language));
    if (opts.pdfPageSize) extraArgs.push("--pdf-page-numbers");
    if (opts.paperSize) extraArgs.push("--paper-size", String(opts.paperSize));

    const args = [plan.inputPath, plan.outputPath, ...extraArgs];

    onProgress?.(30, "Convirtiendo con Calibre");
    const result = await this.getRunner().run({
      args,
      timeoutMs: plan.timeoutMs || DEFAULT_TIMEOUT_MS,
    });

    const success = result.exitCode === 0;
    const stat = success && fs.existsSync(plan.outputPath) ? fs.statSync(plan.outputPath) : null;
    onProgress?.(100, success ? "Completado" : "Error");

    return {
      success,
      outputPath: plan.outputPath,
      outputSizeBytes: stat?.size ?? 0,
      durationMs: Date.now() - start,
      logs: [result.stdout, result.stderr].filter(Boolean),
      warnings: [],
      error: success ? undefined : `ebook-convert exit ${result.exitCode}: ${result.stderr.slice(0, 300)}`,
    };
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

    // Correct extension
    const ext = path.extname(outputPath).replace(".", "").toLowerCase();
    const expectedExt = plan.outputFormat.toLowerCase();
    checks.push({ name: "correct-extension", passed: ext === expectedExt, detail: `got=${ext} expected=${expectedExt}` });

    // Magic bytes check for PDF output
    if (expectedExt === "pdf") {
      try {
        const buf = Buffer.alloc(5);
        const fd = fs.openSync(outputPath, "r");
        fs.readSync(fd, buf, 0, 5, 0);
        fs.closeSync(fd);
        const isPdf = buf.toString("ascii") === "%PDF-";
        checks.push({ name: "pdf-magic-bytes", passed: isPdf, detail: buf.toString("ascii") });
      } catch {
        checks.push({ name: "pdf-magic-bytes", passed: false, detail: "cannot read file" });
      }
    }

    // EPUB is a ZIP — check PK magic
    if (expectedExt === "epub") {
      try {
        const buf = Buffer.alloc(4);
        const fd = fs.openSync(outputPath, "r");
        fs.readSync(fd, buf, 0, 4, 0);
        fs.closeSync(fd);
        const isZip = buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04;
        checks.push({ name: "epub-zip-magic", passed: isZip });
      } catch {
        checks.push({ name: "epub-zip-magic", passed: false, detail: "cannot read file" });
      }
    }

    return { valid: checks.every((c) => c.passed), checks };
  }
}

export const calibreEngine = new CalibreEngine();
