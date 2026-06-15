// LibreOffice headless conversion engine.
// Primary use case: office formats → PDF, and ODF ↔ OOXML cross-conversion.
// Binary discovery: PATH (libreoffice / soffice) → Windows portable.
// Security: shell:false, temp dir isolation, no macro execution (--noevent --norestore).
// Warning: LibreOffice is single-threaded per profile — concurrent jobs are serialized via lock.

import fs from "fs";
import path from "path";
import os from "os";
import crypto from "crypto";
import type { ConversionEngine, EngineId, EngineProbeResult, ConversionCapability, ConversionPlan, ExecutionResult, ArtifactValidation } from "../../domain/engines";
import type { UniversalFileDescriptor, FileCategory } from "../../domain/descriptors";
import { ProcessRunner } from "../../infrastructure/processes/process-runner";
import { ensurePathSafety } from "../../security/path-safety";
import { CONFIG } from "../../config";

const ENGINE_ID: EngineId = "libreoffice";

// LibreOffice must use an isolated profile dir per run to avoid single-instance lockfile contention
let _runner: ProcessRunner | null = null;

function findLibreofficeBinary(): string {
  // 1. Prefer LINK2MEDIA_LIBREOFFICE_PATH env var (portable distribution)
  const envPath = CONFIG.media.binaries.libreoffice;
  if (envPath && envPath !== "libreoffice") return envPath;
  // 2. Portable path relative to cwd
  const candidates = [
    path.resolve(process.cwd(), "tools", "libreoffice", "program", "soffice.exe"),
    path.resolve(process.cwd(), "tools", "LibreOffice", "program", "soffice.exe"),
    "libreoffice",
    "soffice",
  ];
  for (const c of candidates) {
    if (c.includes("/") || c.includes("\\")) {
      if (fs.existsSync(c)) return c;
    } else {
      return c; // PATH-based — ProcessRunner.probe() will verify
    }
  }
  return "libreoffice";
}

function getRunner(): ProcessRunner {
  if (!_runner) _runner = new ProcessRunner(findLibreofficeBinary(), 300_000);
  return _runner;
}

// ── Format / category tables ─────────────────────────────────────────────────

type LoCategory = "document" | "spreadsheet" | "presentation";

interface LoFormatDef {
  loFilter: string;       // LibreOffice --convert-to filter name
  ext: string;
  mime: string;
  label: string;
  category: LoCategory;
}

const INPUT_FORMATS: Record<string, LoCategory> = {
  // Document
  docx: "document", doc: "document", odt: "document", rtf: "document",
  // Spreadsheet
  xlsx: "spreadsheet", xls: "spreadsheet", ods: "spreadsheet",
  // Presentation
  pptx: "presentation", ppt: "presentation", odp: "presentation",
};

const OUTPUT_BY_CATEGORY: Record<LoCategory, LoFormatDef[]> = {
  document: [
    { loFilter: "pdf", ext: "pdf", mime: "application/pdf", label: "PDF", category: "document" },
    { loFilter: "odt", ext: "odt", mime: "application/vnd.oasis.opendocument.text", label: "ODT", category: "document" },
    { loFilter: "docx", ext: "docx", mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", label: "Word DOCX", category: "document" },
  ],
  spreadsheet: [
    { loFilter: "pdf", ext: "pdf", mime: "application/pdf", label: "PDF", category: "spreadsheet" },
    { loFilter: "ods", ext: "ods", mime: "application/vnd.oasis.opendocument.spreadsheet", label: "ODS", category: "spreadsheet" },
    { loFilter: "xlsx", ext: "xlsx", mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", label: "Excel XLSX", category: "spreadsheet" },
  ],
  presentation: [
    { loFilter: "pdf", ext: "pdf", mime: "application/pdf", label: "PDF", category: "presentation" },
    { loFilter: "odp", ext: "odp", mime: "application/vnd.oasis.opendocument.presentation", label: "ODP", category: "presentation" },
    { loFilter: "pptx", ext: "pptx", mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation", label: "PowerPoint PPTX", category: "presentation" },
  ],
};

function buildCapability(
  descriptor: UniversalFileDescriptor,
  outDef: LoFormatDef,
  inputExt: string,
  available: boolean
): ConversionCapability {
  const isSameFormat = outDef.ext === inputExt;
  const isPdf = outDef.ext === "pdf";
  const warnings: string[] = [];

  if (!isSameFormat && !isPdf) {
    warnings.push("La conversión entre formatos de oficina puede alterar algunos estilos y efectos visuales");
  }

  return {
    id: `libreoffice-${descriptor.id}-${inputExt}-${outDef.ext}`,
    operation: "convert-office",
    outputFormat: outDef.ext,
    outputMime: outDef.mime,
    label: `Convertir a ${outDef.label}`,
    description: `${inputExt.toUpperCase()} → ${outDef.label}`,
    lossProfile: isPdf ? "lossy" : "metadata-risk",
    state: isSameFormat ? "unsupported-input" : (available ? "available" : "unavailable-tool"),
    unavailableReason: available ? undefined : "LibreOffice no está instalado. Disponible en el ZIP portable de Windows.",
    recommended: isPdf,
    presets: [{ id: `lo-${inputExt}-${outDef.ext}`, label: "Estándar", quality: "0", description: "Conversión con LibreOffice headless", isRecommended: true }],
    warnings,
    engineId: ENGINE_ID,
    mobilePortability: "desktop-only",
  };
}

// ── Engine implementation ────────────────────────────────────────────────────

export class LibreOfficeEngine implements ConversionEngine {
  readonly id: EngineId = ENGINE_ID;
  readonly supportedCategories: readonly FileCategory[] = ["document", "spreadsheet", "presentation"];

  private _probeResult: EngineProbeResult | null = null;

  async probe(): Promise<EngineProbeResult> {
    if (this._probeResult) return this._probeResult;
    const result = await getRunner().probe(["--version"]);
    this._probeResult = {
      available: result.available,
      version: result.version,
      binaryPath: result.binaryPath,
      capabilities: result.available ? Object.keys(INPUT_FORMATS) : [],
      error: result.available ? undefined : "LibreOffice no encontrado. Instálalo desde libreoffice.org o usa el ZIP portable.",
    };
    return this._probeResult;
  }

  getCapabilities(
    descriptor: UniversalFileDescriptor,
    probeResult: EngineProbeResult
  ): ConversionCapability[] {
    const cat = descriptor.category;
    if (cat !== "document" && cat !== "spreadsheet" && cat !== "presentation") return [];

    const inputExt = (descriptor.extension ?? "").toLowerCase();
    const loCategory = INPUT_FORMATS[inputExt];
    if (!loCategory) return [];

    const outFormats = OUTPUT_BY_CATEGORY[loCategory] ?? [];
    return outFormats
      .filter((f) => f.ext !== inputExt) // skip same-format no-ops
      .map((f) => buildCapability(descriptor, f, inputExt, probeResult.available));
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

    // LibreOffice outputs to --outdir with the same base name but new extension.
    // We redirect to a dedicated temp dir and then move the result.
    const profileDir = path.join(os.tmpdir(), `lo-profile-${crypto.randomBytes(8).toString("hex")}`);
    const outDir = path.join(os.tmpdir(), `lo-out-${crypto.randomBytes(8).toString("hex")}`);
    fs.mkdirSync(profileDir, { recursive: true });
    fs.mkdirSync(outDir, { recursive: true });

    try {
      const outExt = plan.outputFormat;
      const args = [
        `-env:UserInstallation=file://${profileDir}`,
        "--headless",
        "--noevent",
        "--norestore",
        "--convert-to", outExt,
        "--outdir", outDir,
        plan.inputPath,
      ];

      onProgress?.(30, "Convirtiendo con LibreOffice");
      const result = await getRunner().run({ args, timeoutMs: plan.timeoutMs });

      if (result.exitCode !== 0) {
        throw new Error(`LibreOffice exit ${result.exitCode}: ${result.stderr.slice(0, 300)}`);
      }

      // Find the output file in outDir (same base name, new extension)
      const baseName = path.basename(plan.inputPath, path.extname(plan.inputPath));
      const expectedOut = path.join(outDir, `${baseName}.${outExt}`);

      if (!fs.existsSync(expectedOut)) {
        // LibreOffice sometimes uppercases or changes the extension — scan dir
        const files = fs.readdirSync(outDir);
        const match = files.find((f) => f.toLowerCase().endsWith(`.${outExt}`));
        if (!match) throw new Error(`LibreOffice no generó el archivo de salida esperado en ${outDir}`);
        fs.renameSync(path.join(outDir, match), plan.outputPath);
      } else {
        fs.renameSync(expectedOut, plan.outputPath);
      }

      const stat = fs.statSync(plan.outputPath);
      onProgress?.(100, "Completado");

      return {
        success: true,
        outputPath: plan.outputPath,
        outputSizeBytes: stat.size,
        durationMs: Date.now() - start,
        logs: [result.stderr].filter(Boolean),
        warnings: [],
      };
    } catch (err) {
      onProgress?.(100, "Error");
      return {
        success: false,
        outputPath: plan.outputPath,
        outputSizeBytes: 0,
        durationMs: Date.now() - start,
        logs: [],
        warnings: [],
        error: String(err),
      };
    } finally {
      fs.rmSync(profileDir, { recursive: true, force: true });
      fs.rmSync(outDir, { recursive: true, force: true });
    }
  }

  async validate(outputPath: string, plan: ConversionPlan): Promise<ArtifactValidation> {
    const checks: ArtifactValidation["checks"] = [];
    const exists = fs.existsSync(outputPath);
    checks.push({ name: "file-exists", passed: exists });
    if (!exists) return { valid: false, checks };

    const stat = fs.statSync(outputPath);
    checks.push({ name: "size-nonzero", passed: stat.size > 0, detail: `${stat.size} bytes` });

    // PDF magic bytes
    if (plan.outputFormat === "pdf") {
      const buf = Buffer.alloc(5);
      const fd = fs.openSync(outputPath, "r");
      fs.readSync(fd, buf, 0, 5, 0);
      fs.closeSync(fd);
      const isPdf = buf.toString("ascii") === "%PDF-";
      checks.push({ name: "pdf-magic-bytes", passed: isPdf, detail: buf.toString("ascii") });
    }

    return { valid: checks.every((c) => c.passed), checks };
  }
}

export const libreOfficeEngine = new LibreOfficeEngine();
