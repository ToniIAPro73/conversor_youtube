// Tesseract OCR engine.
// Handles: Image (PNG, JPEG, TIFF, WebP) → TXT, Image → PDF (searchable),
//          PDF → TXT (via Poppler pdftoppm → images → OCR).
// Binary discovery: tools/tesseract/ → PATH. Graceful degradation when absent.
// Security: shell:false, path safety checks, page/size/DPI limits.

import fs from "fs";
import path from "path";
import type { ConversionEngine, EngineId, EngineProbeResult, ConversionCapability, ConversionPlan, ExecutionResult, ArtifactValidation } from "../../domain/engines";
import type { UniversalFileDescriptor } from "../../domain/descriptors";
import { ProcessRunner } from "../../infrastructure/processes/process-runner";
import { ensurePathSafety } from "../../security/path-safety";
import { CONFIG } from "../../config";

const ENGINE_ID: EngineId = "tesseract";

const MAX_PAGES_PDF_OCR = 50;
const MAX_DPI = 600;
const DEFAULT_DPI = 300;
const DEFAULT_TIMEOUT_MS = 120_000;

// ── Format definitions ───────────────────────────────────────────────────────

const IMAGE_INPUT_FORMATS = new Set(["png", "jpeg", "jpg", "tiff", "tif", "webp"]);

interface OcrCapabilityDef {
  fromCategory: string;
  fromFormats: Set<string>;
  toFormat: string;
  toExt: string;
  toMime: string;
  toLabel: string;
  operation: string;
  lossProfile: "lossy" | "metadata-risk" | "structure-risk" | "none";
  state: "available" | "unavailable-tool" | "experimental";
  requiresPoppler: boolean;
  description: string;
}

const OCR_CAPABILITIES: OcrCapabilityDef[] = [
  {
    fromCategory: "image",
    fromFormats: IMAGE_INPUT_FORMATS,
    toFormat: "txt",
    toExt: "txt",
    toMime: "text/plain",
    toLabel: "Texto (OCR)",
    operation: "ocr-image-to-text",
    lossProfile: "lossy",
    state: "available",
    requiresPoppler: false,
    description: "Reconocimiento óptico de caracteres: imagen → texto",
  },
  {
    fromCategory: "image",
    fromFormats: IMAGE_INPUT_FORMATS,
    toFormat: "pdf",
    toExt: "pdf",
    toMime: "application/pdf",
    toLabel: "PDF con texto searchable (OCR)",
    operation: "ocr-image-to-pdf",
    lossProfile: "lossy",
    state: "available",
    requiresPoppler: false,
    description: "Reconocimiento óptico de caracteres: imagen → PDF searchable",
  },
  {
    fromCategory: "pdf",
    fromFormats: new Set(["pdf"]),
    toFormat: "txt",
    toExt: "txt",
    toMime: "text/plain",
    toLabel: "Texto (OCR desde PDF)",
    operation: "ocr-pdf-to-text",
    lossProfile: "lossy",
    state: "experimental",
    requiresPoppler: true,
    description: "OCR de PDF escaneado: requiere Poppler (pdftoppm) para convertir páginas a imágenes",
  },
];

// ── Binary discovery ─────────────────────────────────────────────────────────

function findTesseractBinary(): string {
  // 1. Prefer LINK2MEDIA_TESSERACT_PATH env var (portable distribution)
  const envPath = CONFIG.media.binaries.tesseract;
  if (envPath && envPath !== "tesseract") return envPath;
  // 2. Portable path relative to cwd
  const portablePaths = [
    path.resolve(process.cwd(), "tools", "tesseract", "tesseract.exe"),
    path.resolve(process.cwd(), "tools", "tesseract", "tesseract"),
  ];
  for (const p of portablePaths) {
    if (fs.existsSync(p)) return p;
  }
  // 3. Fall back to PATH
  return "tesseract";
}

function findPdftoppmBinary(): string {
  // 1. Prefer LINK2MEDIA_POPPLER_PATH env var (portable distribution)
  const popplerDir = CONFIG.media.binaries.poppler;
  if (popplerDir) {
    const popplerPath = path.join(popplerDir, "pdftoppm.exe");
    if (fs.existsSync(popplerPath)) return popplerPath;
    const popplerPathUnix = path.join(popplerDir, "pdftoppm");
    if (fs.existsSync(popplerPathUnix)) return popplerPathUnix;
  }
  // 2. Portable path relative to cwd
  const portablePaths = [
    path.resolve(process.cwd(), "tools", "poppler", "pdftoppm.exe"),
    path.resolve(process.cwd(), "tools", "poppler", "pdftoppm"),
  ];
  for (const p of portablePaths) {
    if (fs.existsSync(p)) return p;
  }
  // 3. Fall back to PATH
  return "pdftoppm";
}

// ── Language detection ────────────────────────────────────────────────────────

interface TesseractLangInfo {
  available: string[];
  hasSpanish: boolean;
  hasEnglish: boolean;
  warnings: string[];
}

async function detectLanguages(tesseractRunner: ProcessRunner): Promise<TesseractLangInfo> {
  const warnings: string[] = [];
  let available: string[] = [];
  let hasSpanish = false;
  let hasEnglish = false;

  try {
    const result = await tesseractRunner.run({
      args: ["--list-langs"],
      timeoutMs: 5_000,
    });

    if (result.exitCode === 0) {
      const langs = result.stdout
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l.length > 0 && l !== "Langs");

      available = langs;
      hasSpanish = langs.some((l) => l === "spa");
      hasEnglish = langs.some((l) => l === "eng");

      if (!hasSpanish) {
        warnings.push("Idioma español (spa) no disponible para Tesseract OCR. Se usará inglés si está disponible.");
      }
      if (!hasEnglish) {
        warnings.push("Idioma inglés (eng) no disponible para Tesseract OCR.");
      }
      if (!hasSpanish && !hasEnglish && langs.length > 0) {
        warnings.push("Ni español ni inglés disponibles; se usará el primer idioma disponible.");
      }
    }
  } catch {
    warnings.push("No se pudieron detectar los idiomas disponibles de Tesseract.");
  }

  return { available, hasSpanish, hasEnglish, warnings };
}

// ── Engine implementation ────────────────────────────────────────────────────

export class TesseractEngine implements ConversionEngine {
  readonly id: EngineId = ENGINE_ID;
  readonly supportedCategories = ["image", "pdf"] as const;

  private _probeResult: EngineProbeResult | null = null;
  private _runner: ProcessRunner | null = null;
  private _pdftoppmRunner: ProcessRunner | null = null;
  private _langInfo: TesseractLangInfo | null = null;

  private getRunner(): ProcessRunner {
    if (!this._runner) this._runner = new ProcessRunner(findTesseractBinary(), DEFAULT_TIMEOUT_MS);
    return this._runner;
  }

  private getPdftoppmRunner(): ProcessRunner {
    if (!this._pdftoppmRunner) this._pdftoppmRunner = new ProcessRunner(findPdftoppmBinary(), 60_000);
    return this._pdftoppmRunner;
  }

  async probe(): Promise<EngineProbeResult> {
    if (this._probeResult) return this._probeResult;

    const result = await this.getRunner().probe(["--version"]);

    let capabilities: string[] = [];
    if (result.available) {
      // Detect language packs
      this._langInfo = await detectLanguages(this.getRunner());
      capabilities = this._langInfo.available;

      // Check for Poppler availability (for PDF OCR)
      const pdftoppmRunner = this.getPdftoppmRunner();
      const popplerResult = await pdftoppmRunner.probe(["-v"]);
      if (popplerResult.available) {
        capabilities.push("pdftoppm");
      }
    }

    this._probeResult = {
      available: result.available,
      version: result.version,
      binaryPath: result.binaryPath,
      capabilities,
      error: result.available ? undefined : "Tesseract no encontrado. Instálalo desde github.com/tesseract-ocr.",
    };
    return this._probeResult;
  }

  getCapabilities(
    descriptor: UniversalFileDescriptor,
    probeResult: EngineProbeResult
  ): ConversionCapability[] {
    if (descriptor.category !== "image" && descriptor.category !== "pdf") return [];

    const ext = (descriptor.extension ?? "").toLowerCase().replace("jpg", "jpeg");
    const capabilities: ConversionCapability[] = [];

    for (const capDef of OCR_CAPABILITIES) {
      // Check category match
      if (descriptor.category !== capDef.fromCategory) continue;

      // Check format match
      if (!capDef.fromFormats.has(ext) && !capDef.fromFormats.has(descriptor.detectedFormat?.toLowerCase() ?? "")) continue;

      // For PDF OCR, check Poppler availability
      const hasPoppler = probeResult.capabilities.includes("pdftoppm");
      if (capDef.requiresPoppler && !hasPoppler) continue;

      // Determine state
      let state = capDef.state;
      if (!probeResult.available) {
        state = "unavailable-tool";
      }

      // Build language warnings
      const warnings: string[] = [];
      if (this._langInfo) {
        if (!this._langInfo.hasSpanish) {
          warnings.push("Idioma español (spa) no disponible para OCR");
        }
        if (!this._langInfo.hasEnglish) {
          warnings.push("Idioma inglés (eng) no disponible para OCR");
        }
      }

      // Page limit warning for PDF OCR
      if (capDef.fromCategory === "pdf") {
        warnings.push(`Máximo ${MAX_PAGES_PDF_OCR} páginas para OCR de PDF`);
      }

      const fromLabel = capDef.fromCategory === "image" ? "Imagen" : "PDF";

      capabilities.push({
        id: `tesseract-${descriptor.id}-${capDef.fromCategory}-${capDef.toFormat}`,
        operation: capDef.operation,
        outputFormat: capDef.toExt,
        outputMime: capDef.toMime,
        label: capDef.toLabel,
        description: capDef.description,
        lossProfile: capDef.lossProfile,
        state,
        unavailableReason: probeResult.available ? undefined : "Tesseract no está instalado. Instálalo desde github.com/tesseract-ocr.",
        recommended: capDef.toFormat === "txt",
        presets: [
          {
            id: `${capDef.operation}-default`,
            label: "Estándar (spa+eng)",
            quality: "0",
            description: `OCR con detección de español e inglés`,
            isRecommended: true,
          },
        ],
        warnings,
        engineId: ENGINE_ID,
        mobilePortability: "desktop-only",
      });
    }

    return capabilities;
  }

  async execute(
    plan: ConversionPlan,
    onProgress?: (progress: number, stage: string) => void
  ): Promise<ExecutionResult> {
    const start = Date.now();
    const operation = plan.operation;
    onProgress?.(5, "Preparando OCR");

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

    // Resolve OCR language
    const lang = this.resolveOcrLanguage(plan.options);

    if (operation === "ocr-pdf-to-text") {
      return this.executePdfOcr(plan, lang, onProgress, start);
    }

    // Image OCR (both to TXT and to PDF)
    return this.executeImageOcr(plan, lang, onProgress, start);
  }

  private resolveOcrLanguage(options: Record<string, unknown>): string {
    // Use provided language or default to spa+eng
    if (typeof options.ocrLanguage === "string" && options.ocrLanguage.length > 0) {
      return options.ocrLanguage;
    }

    // Check available languages
    if (this._langInfo) {
      if (this._langInfo.hasSpanish && this._langInfo.hasEnglish) return "spa+eng";
      if (this._langInfo.hasSpanish) return "spa";
      if (this._langInfo.hasEnglish) return "eng";
      if (this._langInfo.available.length > 0) return this._langInfo.available[0]!;
    }

    return "spa+eng"; // Default fallback
  }

  private async executeImageOcr(
    plan: ConversionPlan,
    lang: string,
    onProgress: ((progress: number, stage: string) => void) | undefined,
    start: number
  ): Promise<ExecutionResult> {
    const isPdfOutput = plan.outputFormat === "pdf";

    // tesseract input output_base -l lang [pdf|txt]
    // For PDF output: tesseract input output_base -l lang pdf
    // For TXT output: tesseract input output_base -l lang
    const outputBase = plan.outputPath.replace(/\.[^.]+$/, "");
    const args = [plan.inputPath, outputBase, "-l", lang];

    if (isPdfOutput) {
      args.push("pdf");
    }

    onProgress?.(30, "Ejecutando OCR con Tesseract");

    const result = await this.getRunner().run({
      args,
      timeoutMs: plan.timeoutMs || DEFAULT_TIMEOUT_MS,
    });

    // Tesseract adds the extension to the output base name
    const actualOutputPath = isPdfOutput
      ? `${outputBase}.pdf`
      : `${outputBase}.txt`;

    const success = result.exitCode === 0;
    const finalOutputPath = fs.existsSync(actualOutputPath) ? actualOutputPath : plan.outputPath;
    const stat = success && fs.existsSync(finalOutputPath) ? fs.statSync(finalOutputPath) : null;

    onProgress?.(100, success ? "Completado" : "Error");

    return {
      success,
      outputPath: finalOutputPath,
      outputSizeBytes: stat?.size ?? 0,
      durationMs: Date.now() - start,
      logs: [result.stdout, result.stderr].filter(Boolean),
      warnings: [],
      error: success ? undefined : `tesseract exit ${result.exitCode}: ${result.stderr.slice(0, 300)}`,
    };
  }

  private async executePdfOcr(
    plan: ConversionPlan,
    lang: string,
    onProgress: ((progress: number, stage: string) => void) | undefined,
    start: number
  ): Promise<ExecutionResult> {
    // 1. Convert PDF pages to images using pdftoppm
    const workDir = path.dirname(plan.outputPath);
    const imagePrefix = path.join(workDir, `ocr_page_${plan.jobId.substring(0, 8)}`);
    const dpi = Math.min(
      typeof plan.options.ocrDpi === "number" ? plan.options.ocrDpi : DEFAULT_DPI,
      MAX_DPI
    );

    onProgress?.(10, "Convirtiendo PDF a imágenes");

    const pdftoppmArgs = [
      "-png",
      "-r", String(dpi),
      "-l", String(MAX_PAGES_PDF_OCR), // Limit pages
      plan.inputPath,
      imagePrefix,
    ];

    const pdftoppmResult = await this.getPdftoppmRunner().run({
      args: pdftoppmArgs,
      timeoutMs: 60_000,
    });

    if (pdftoppmResult.exitCode !== 0) {
      return {
        success: false,
        outputPath: plan.outputPath,
        outputSizeBytes: 0,
        durationMs: Date.now() - start,
        logs: [pdftoppmResult.stdout, pdftoppmResult.stderr].filter(Boolean),
        warnings: [],
        error: `pdftoppm failed: ${pdftoppmResult.stderr.slice(0, 300)}`,
      };
    }

    // 2. Find generated images
    const imageFiles = fs.readdirSync(workDir)
      .filter((f) => f.startsWith(`ocr_page_${plan.jobId.substring(0, 8)}`) && f.endsWith(".png"))
      .sort()
      .map((f) => path.join(workDir, f));

    if (imageFiles.length === 0) {
      return {
        success: false,
        outputPath: plan.outputPath,
        outputSizeBytes: 0,
        durationMs: Date.now() - start,
        logs: [],
        warnings: [],
        error: "No se generaron imágenes a partir del PDF",
      };
    }

    if (imageFiles.length > MAX_PAGES_PDF_OCR) {
      imageFiles.splice(MAX_PAGES_PDF_OCR);
    }

    // 3. OCR each page and concatenate
    onProgress?.(40, `Procesando ${imageFiles.length} páginas con OCR`);
    const textParts: string[] = [];
    const intermediateOutputs: string[] = [];

    for (let i = 0; i < imageFiles.length; i++) {
      const imageFile = imageFiles[i]!;
      const pageOutputBase = path.join(workDir, `ocr_result_${plan.jobId.substring(0, 8)}_${i}`);
      const pageOutputTxt = `${pageOutputBase}.txt`;
      intermediateOutputs.push(pageOutputTxt);

      const progress = 40 + Math.floor((i / imageFiles.length) * 50);
      onProgress?.(progress, `OCR página ${i + 1}/${imageFiles.length}`);

      const ocrResult = await this.getRunner().run({
        args: [imageFile, pageOutputBase, "-l", lang],
        timeoutMs: 30_000,
      });

      if (ocrResult.exitCode === 0 && fs.existsSync(pageOutputTxt)) {
        textParts.push(fs.readFileSync(pageOutputTxt, "utf8"));
      } else {
        textParts.push(`[Error en página ${i + 1}]\n`);
      }
    }

    // 4. Write concatenated text
    const fullText = textParts.join("\n\n---\n\n");
    fs.writeFileSync(plan.outputPath, fullText, "utf8");

    // 5. Cleanup intermediate files
    try {
      for (const img of imageFiles) {
        fs.unlinkSync(img);
      }
      for (const txt of intermediateOutputs) {
        if (fs.existsSync(txt)) fs.unlinkSync(txt);
      }
    } catch {
      // Non-fatal cleanup errors
    }

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

    // For text output, verify it has actual content (not just whitespace)
    if (plan.outputFormat === "txt" && stat.size > 0) {
      try {
        // Read a sample to check for non-whitespace content
        const sampleSize = Math.min(stat.size, 4096);
        const buf = Buffer.alloc(sampleSize);
        const fd = fs.openSync(outputPath, "r");
        fs.readSync(fd, buf, 0, sampleSize, 0);
        fs.closeSync(fd);
        const sample = buf.toString("utf8");
        const hasContent = sample.trim().length > 0;
        checks.push({ name: "has-text-content", passed: hasContent, detail: hasContent ? "text content found" : "only whitespace" });
      } catch {
        checks.push({ name: "has-text-content", passed: false, detail: "cannot read file" });
      }
    }

    // For PDF output, check magic bytes
    if (plan.outputFormat === "pdf") {
      try {
        const buf = Buffer.alloc(5);
        const fd = fs.openSync(outputPath, "r");
        fs.readSync(fd, buf, 0, 5, 0);
        fs.closeSync(fd);
        const isPdf = buf.toString("ascii") === "%PDF-";
        checks.push({ name: "pdf-magic-bytes", passed: isPdf });
      } catch {
        checks.push({ name: "pdf-magic-bytes", passed: false, detail: "cannot read file" });
      }
    }

    return { valid: checks.every((c) => c.passed), checks };
  }
}

export const tesseractEngine = new TesseractEngine();
