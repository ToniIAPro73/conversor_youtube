// qpdf PDF processing engine.
// Operations: merge PDFs, split pages, rotate, linearize, decrypt, extract page range.
// Binary discovery: checks PATH + Windows portable path. Graceful degradation when absent.
// Security: all paths validated via ensurePathSafety, no shell injection (shell:false).

import fs from "fs";
import path from "path";
import type { ConversionEngine, EngineId, EngineProbeResult, ConversionCapability, ConversionPlan, ExecutionResult, ArtifactValidation } from "../../domain/engines";
import type { UniversalFileDescriptor, PdfAttributes } from "../../domain/descriptors";
import { ProcessRunner } from "../../infrastructure/processes/process-runner";
import { ensurePathSafety } from "../../security/path-safety";
import { CONFIG } from "../../config";

const ENGINE_ID: EngineId = "qpdf";

// Look for qpdf: prefer LINK2MEDIA_QPDF_PATH env var, then portable path, then PATH
function findQpdfBinary(): string {
  const envPath = CONFIG.media.binaries.qpdf;
  if (envPath && envPath !== "qpdf") return envPath;
  const portablePath = path.resolve(process.cwd(), "tools", "qpdf", "bin", "qpdf.exe");
  if (fs.existsSync(portablePath)) return portablePath;
  return "qpdf";
}

interface QpdfOptions {
  operation: "linearize" | "extract-pages" | "rotate" | "decrypt";
  pages?: string;   // e.g. "1-3,5,7-9"
  rotation?: number; // degrees: 90, 180, 270
}

const OPERATIONS = [
  {
    id: "linearize",
    label: "Optimizar para web (linearizar)",
    description: "Lineariza el PDF para carga rápida en navegadores",
    lossProfile: "lossless" as const,
  },
  {
    id: "extract-pages",
    label: "Extraer páginas",
    description: "Extrae un rango de páginas del PDF",
    lossProfile: "lossless" as const,
  },
  {
    id: "rotate",
    label: "Rotar páginas",
    description: "Rota todas las páginas 90°, 180° o 270°",
    lossProfile: "lossless" as const,
  },
  {
    id: "decrypt",
    label: "Eliminar contraseña",
    description: "Elimina la protección por contraseña si el PDF está desbloqueado",
    lossProfile: "metadata-risk" as const,
  },
] as const;

export class QpdfEngine implements ConversionEngine {
  readonly id: EngineId = ENGINE_ID;
  readonly supportedCategories = ["pdf"] as const;

  private _probeResult: EngineProbeResult | null = null;
  private _runner: ProcessRunner | null = null;

  private getRunner(): ProcessRunner {
    if (!this._runner) this._runner = new ProcessRunner(findQpdfBinary(), 120_000);
    return this._runner;
  }

  async probe(): Promise<EngineProbeResult> {
    if (this._probeResult) return this._probeResult;
    const result = await this.getRunner().probe(["--version"]);
    this._probeResult = {
      available: result.available,
      version: result.version,
      binaryPath: result.binaryPath,
      capabilities: result.available ? OPERATIONS.map((o) => o.id) : [],
      error: result.available ? undefined : "qpdf no encontrado en PATH ni en el directorio de herramientas",
    };
    return this._probeResult;
  }

  getCapabilities(
    descriptor: UniversalFileDescriptor,
    probeResult: EngineProbeResult
  ): ConversionCapability[] {
    if (descriptor.category !== "pdf") return [];
    const attrs = descriptor.attributes as PdfAttributes;

    return OPERATIONS
      .filter((op) => op.id !== "decrypt" || attrs.isEncrypted)
      .map((op) => ({
        id: `qpdf-${descriptor.id}-${op.id}`,
        operation: op.id,
        outputFormat: "pdf",
        outputMime: "application/pdf",
        label: op.label,
        description: op.description,
        lossProfile: op.lossProfile,
        state: probeResult.available ? "available" as const : "unavailable-tool" as const,
        recommended: op.id === "linearize",
        presets: buildPresets(op.id, attrs),
        warnings: op.id === "decrypt" ? ["Solo funciona si no se requiere contraseña de propietario"] : [],
        engineId: ENGINE_ID,
        mobilePortability: "desktop-only" as const,
      }));
  }

  async execute(
    plan: ConversionPlan,
    onProgress?: (progress: number, stage: string) => void
  ): Promise<ExecutionResult> {
    const start = Date.now();
    const opts = plan.options as unknown as QpdfOptions;

    try {
      ensurePathSafety(plan.inputPath);
      ensurePathSafety(plan.outputPath);
    } catch (err) {
      return { success: false, outputPath: plan.outputPath, outputSizeBytes: 0, durationMs: 0, logs: [], warnings: [], error: String(err) };
    }

    onProgress?.(10, "Preparando");
    const args = buildArgs(opts, plan.inputPath, plan.outputPath);

    onProgress?.(30, "Procesando PDF");
    const result = await this.getRunner().run({ args, timeoutMs: plan.timeoutMs });

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
      error: success ? undefined : `qpdf exit ${result.exitCode}: ${result.stderr.slice(0, 300)}`,
    };
  }

  async validate(outputPath: string, _plan: ConversionPlan): Promise<ArtifactValidation> {
    const checks: ArtifactValidation["checks"] = [];

    const exists = fs.existsSync(outputPath);
    checks.push({ name: "file-exists", passed: exists });
    if (!exists) return { valid: false, checks };

    const buf = Buffer.alloc(5);
    const fd = fs.openSync(outputPath, "r");
    fs.readSync(fd, buf, 0, 5, 0);
    fs.closeSync(fd);
    const isPdf = buf.toString("ascii") === "%PDF-";
    checks.push({ name: "pdf-magic-bytes", passed: isPdf, detail: buf.toString("ascii") });

    const stat = fs.statSync(outputPath);
    checks.push({ name: "size-nonzero", passed: stat.size > 0, detail: `${stat.size} bytes` });

    return { valid: checks.every((c) => c.passed), checks };
  }
}

function buildArgs(opts: QpdfOptions, inputPath: string, outputPath: string): string[] {
  switch (opts.operation) {
    case "linearize":
      return ["--linearize", inputPath, outputPath];
    case "extract-pages": {
      const pages = opts.pages ?? "1-1";
      return ["--empty", "--pages", inputPath, pages, "--", outputPath];
    }
    case "rotate": {
      const deg = opts.rotation ?? 90;
      return [`--rotate=+${deg}`, inputPath, outputPath];
    }
    case "decrypt":
      return ["--decrypt", inputPath, outputPath];
    default:
      return ["--linearize", inputPath, outputPath];
  }
}

function buildPresets(
  op: string,
  attrs: PdfAttributes
): import("../../domain/engines").ConversionPreset[] {
  if (op === "extract-pages") {
    const total = attrs.pageCount ?? 1;
    return [
      { id: "extract-all", label: "Todas", quality: "0", description: `1-${total}`, isRecommended: true },
      { id: "extract-first", label: "Primera mitad", quality: "0", description: `1-${Math.ceil(total / 2)}` },
    ];
  }
  if (op === "rotate") {
    return [
      { id: "rot-90", label: "90° derecha", quality: "0", description: "Sentido horario", isRecommended: true },
      { id: "rot-180", label: "180°", quality: "0", description: "Invertir" },
      { id: "rot-270", label: "90° izquierda", quality: "0", description: "Sentido antihorario" },
    ];
  }
  return [{ id: `${op}-default`, label: "Estándar", quality: "0", description: "Configuración por defecto", isRecommended: true }];
}

export const qpdfEngine = new QpdfEngine();
