// Pandoc document conversion engine.
// Handles: Markdown, HTML, RST, DOCX, ODT, LaTeX, plain text — any supported input → any supported output.
// Binary discovery: PATH → Windows portable → graceful degradation.
// Security: shell:false, no code execution in input documents, file size limits.

import fs from "fs";
import path from "path";
import type { ConversionEngine, EngineId, EngineProbeResult, ConversionCapability, ConversionPlan, ExecutionResult, ArtifactValidation } from "../../domain/engines";
import type { UniversalFileDescriptor } from "../../domain/descriptors";
import { ProcessRunner } from "../../infrastructure/processes/process-runner";
import { ensurePathSafety } from "../../security/path-safety";

const ENGINE_ID: EngineId = "pandoc";

function findPandocBinary(): string {
  const portablePaths = [
    path.resolve(process.cwd(), "tools", "pandoc", "pandoc.exe"),
    path.resolve(process.cwd(), "tools", "pandoc", "pandoc"),
  ];
  for (const p of portablePaths) {
    if (fs.existsSync(p)) return p;
  }
  return "pandoc";
}

// ── Format definitions ───────────────────────────────────────────────────────

type PandocFormat = "markdown" | "html" | "docx" | "odt" | "rst" | "latex" | "plain";

interface FormatDef {
  pandocName: PandocFormat;
  label: string;
  mime: string;
  ext: string;
  lossless: boolean;
}

const FORMAT_MAP: Record<string, FormatDef> = {
  markdown: { pandocName: "markdown", label: "Markdown", mime: "text/markdown", ext: "md", lossless: true },
  md:       { pandocName: "markdown", label: "Markdown", mime: "text/markdown", ext: "md", lossless: true },
  html:     { pandocName: "html",     label: "HTML",     mime: "text/html", ext: "html", lossless: false },
  htm:      { pandocName: "html",     label: "HTML",     mime: "text/html", ext: "html", lossless: false },
  rst:      { pandocName: "rst",      label: "reStructuredText", mime: "text/x-rst", ext: "rst", lossless: true },
  docx:     { pandocName: "docx",     label: "Word DOCX", mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", ext: "docx", lossless: false },
  odt:      { pandocName: "odt",      label: "ODT",      mime: "application/vnd.oasis.opendocument.text", ext: "odt", lossless: false },
  latex:    { pandocName: "latex",    label: "LaTeX",    mime: "application/x-latex", ext: "tex", lossless: true },
  tex:      { pandocName: "latex",    label: "LaTeX",    mime: "application/x-latex", ext: "tex", lossless: true },
  txt:      { pandocName: "plain",    label: "Texto plano", mime: "text/plain", ext: "txt", lossless: false },
};

// Output formats available from each input format
// Rule: rich → plain is always allowed; plain → rich loses formatting (flagged)
const OUTPUT_MATRIX: Record<PandocFormat, PandocFormat[]> = {
  markdown: ["html", "docx", "odt", "rst", "latex", "plain"],
  html:     ["markdown", "docx", "odt", "rst", "plain"],
  rst:      ["markdown", "html", "docx", "odt", "latex", "plain"],
  docx:     ["markdown", "html", "odt", "rst", "plain"],
  odt:      ["markdown", "html", "docx", "rst", "plain"],
  latex:    ["markdown", "html", "plain"],
  plain:    ["markdown", "html"],
};

// Formats where the output loses significant structure
const LOSSY_OUTPUTS = new Set<PandocFormat>(["plain"]);
const RISK_PAIRS: Array<[PandocFormat, PandocFormat]> = [
  ["html", "markdown"],
  ["docx", "markdown"],
  ["odt", "markdown"],
];

function isLossProfile(from: PandocFormat, to: PandocFormat): "lossless" | "lossy" | "metadata-risk" {
  if (LOSSY_OUTPUTS.has(to)) return "lossy";
  if (RISK_PAIRS.some(([f, t]) => f === from && t === to)) return "metadata-risk";
  if ((from === "docx" || from === "odt") && (to === "docx" || to === "odt")) return "metadata-risk";
  return "lossless";
}

function lossWarning(from: PandocFormat, to: PandocFormat): string | null {
  if (to === "plain") return "El texto plano pierde toda la estructura y el formato del documento";
  if ((from === "docx" || from === "odt") && to === "markdown") return "Los documentos Word/ODT con formato complejo pueden perder estilos al convertir a Markdown";
  if (from === "docx" && to === "odt") return "La conversión entre formatos ofimáticos puede alterar algunos estilos";
  return null;
}

function resolveInputFormat(descriptor: UniversalFileDescriptor): FormatDef | null {
  const ext = (descriptor.extension ?? "").toLowerCase();
  const fmt = (descriptor.detectedFormat ?? "").toLowerCase();
  return FORMAT_MAP[ext] ?? FORMAT_MAP[fmt] ?? null;
}

function buildCapability(
  fromDef: FormatDef,
  toFmt: PandocFormat,
  descriptor: UniversalFileDescriptor,
  available: boolean
): ConversionCapability {
  const toDef: FormatDef = Object.values(FORMAT_MAP).find((f) => f.pandocName === toFmt)!;
  const loss = isLossProfile(fromDef.pandocName, toFmt);
  const warn = lossWarning(fromDef.pandocName, toFmt);

  return {
    id: `pandoc-${descriptor.id}-${fromDef.pandocName}-${toFmt}`,
    operation: "convert-document",
    outputFormat: toDef.ext,
    outputMime: toDef.mime,
    label: `Convertir a ${toDef.label}`,
    description: `${fromDef.label} → ${toDef.label}`,
    lossProfile: loss,
    state: available ? "available" : "unavailable-tool",
    unavailableReason: available ? undefined : "Pandoc no está instalado. Disponible en el ZIP portable de Windows.",
    recommended: toFmt === "html" || (fromDef.pandocName === "docx" && toFmt === "markdown"),
    presets: [{ id: `${fromDef.pandocName}-${toFmt}-default`, label: "Estándar", quality: "0", description: "Conversión directa con Pandoc", isRecommended: true }],
    warnings: warn ? [warn] : [],
    engineId: ENGINE_ID,
    mobilePortability: "replace-adapter-on-mobile",
  };
}

// ── Engine implementation ────────────────────────────────────────────────────

export class PandocEngine implements ConversionEngine {
  readonly id: EngineId = ENGINE_ID;
  readonly supportedCategories = ["plain-text", "document"] as const;

  private _probeResult: EngineProbeResult | null = null;
  private _runner: ProcessRunner | null = null;

  private getRunner(): ProcessRunner {
    if (!this._runner) this._runner = new ProcessRunner(findPandocBinary(), 120_000);
    return this._runner;
  }

  async probe(): Promise<EngineProbeResult> {
    if (this._probeResult) return this._probeResult;
    const result = await this.getRunner().probe(["--version"]);
    this._probeResult = {
      available: result.available,
      version: result.version,
      binaryPath: result.binaryPath,
      capabilities: result.available ? Object.keys(FORMAT_MAP) : [],
      error: result.available ? undefined : "Pandoc no encontrado. Instálalo desde pandoc.org o usa el ZIP portable.",
    };
    return this._probeResult;
  }

  getCapabilities(
    descriptor: UniversalFileDescriptor,
    probeResult: EngineProbeResult
  ): ConversionCapability[] {
    if (descriptor.category !== "plain-text" && descriptor.category !== "document") return [];

    const fromDef = resolveInputFormat(descriptor);
    if (!fromDef) return [];

    const outputFormats = OUTPUT_MATRIX[fromDef.pandocName] ?? [];
    return outputFormats.map((toFmt) => buildCapability(fromDef, toFmt, descriptor, probeResult.available));
  }

  async execute(
    plan: ConversionPlan,
    onProgress?: (progress: number, stage: string) => void
  ): Promise<ExecutionResult> {
    const start = Date.now();
    onProgress?.(10, "Preparando");

    try {
      ensurePathSafety(plan.inputPath);
      ensurePathSafety(plan.outputPath);
    } catch (err) {
      return { success: false, outputPath: plan.outputPath, outputSizeBytes: 0, durationMs: 0, logs: [], warnings: [], error: String(err) };
    }

    // Resolve input format from options or extension
    const inputExt = (plan.options.inputFormat as string | undefined)
      ?? path.extname(plan.inputPath).replace(".", "").toLowerCase();
    const fromDef = FORMAT_MAP[inputExt];
    if (!fromDef) {
      return { success: false, outputPath: plan.outputPath, outputSizeBytes: 0, durationMs: Date.now() - start, logs: [], warnings: [], error: `Formato de entrada desconocido: ${inputExt}` };
    }

    const outExt = plan.outputFormat;
    const toDef = Object.values(FORMAT_MAP).find((f) => f.ext === outExt || f.pandocName === outExt);
    if (!toDef) {
      return { success: false, outputPath: plan.outputPath, outputSizeBytes: 0, durationMs: Date.now() - start, logs: [], warnings: [], error: `Formato de salida desconocido: ${outExt}` };
    }

    const args = [
      "-f", fromDef.pandocName,
      "-t", toDef.pandocName,
      "-o", plan.outputPath,
      "--standalone",
      plan.inputPath,
    ];

    onProgress?.(40, "Convirtiendo con Pandoc");
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
      error: success ? undefined : `pandoc exit ${result.exitCode}: ${result.stderr.slice(0, 300)}`,
    };
  }

  async validate(outputPath: string, _plan: ConversionPlan): Promise<ArtifactValidation> {
    const checks: ArtifactValidation["checks"] = [];
    const exists = fs.existsSync(outputPath);
    checks.push({ name: "file-exists", passed: exists });
    if (!exists) return { valid: false, checks };

    const stat = fs.statSync(outputPath);
    checks.push({ name: "size-nonzero", passed: stat.size > 0, detail: `${stat.size} bytes` });

    return { valid: checks.every((c) => c.passed), checks };
  }
}

export const pandocEngine = new PandocEngine();
