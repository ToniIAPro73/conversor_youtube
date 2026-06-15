// 7-Zip archive conversion engine.
// Operations: extract, compress (ZIP/7Z/TAR), list entries.
// Security: path traversal check on extraction, expansion ratio limit, entry count limit.
// Binary discovery: PATH → Windows portable → graceful degradation.

import fs from "fs";
import path from "path";
import os from "os";
import type { ConversionEngine, EngineId, EngineProbeResult, ConversionCapability, ConversionPlan, ExecutionResult, ArtifactValidation } from "../../domain/engines";
import type { UniversalFileDescriptor, ArchiveAttributes } from "../../domain/descriptors";
import { ProcessRunner } from "../../infrastructure/processes/process-runner";
import { ensurePathSafety } from "../../security/path-safety";

const ENGINE_ID: EngineId = "sevenzip";

const MAX_EXPANSION_RATIO = 100;
const MAX_ENTRIES = 10_000;
const MAX_UNCOMPRESSED_BYTES = 2 * 1024 * 1024 * 1024; // 2 GB

function findSevenZipBinary(): string {
  // Windows portable path
  const portablePaths = [
    path.resolve(process.cwd(), "tools", "7-zip", "7z.exe"),
    path.resolve(process.cwd(), "tools", "7zip", "7z.exe"),
  ];
  for (const p of portablePaths) {
    if (fs.existsSync(p)) return p;
  }
  // Unix
  return "7z";
}

type ArchiveOutputFormat = "zip" | "7z" | "tar";

const OUTPUT_FORMATS: ArchiveOutputFormat[] = ["zip", "7z", "tar"];

const MIME: Record<ArchiveOutputFormat, string> = {
  zip: "application/zip",
  "7z": "application/x-7z-compressed",
  tar: "application/x-tar",
};

function getMimeType(fmt: ArchiveOutputFormat): string { return MIME[fmt]; }

function formatLabel(fmt: ArchiveOutputFormat): string {
  return { zip: "ZIP", "7z": "7Z", tar: "TAR" }[fmt];
}

interface SevenZipOptions {
  operation: "repack" | "extract";
  outputFormat?: ArchiveOutputFormat;
  compressionLevel?: 0 | 1 | 3 | 5 | 7 | 9;
  password?: never; // Never accept passwords to avoid complexity
}

export class SevenZipEngine implements ConversionEngine {
  readonly id: EngineId = ENGINE_ID;
  readonly supportedCategories = ["archive"] as const;

  private _probeResult: EngineProbeResult | null = null;
  private _runner: ProcessRunner | null = null;

  private getRunner(): ProcessRunner {
    if (!this._runner) this._runner = new ProcessRunner(findSevenZipBinary(), 300_000);
    return this._runner;
  }

  async probe(): Promise<EngineProbeResult> {
    if (this._probeResult) return this._probeResult;
    const result = await this.getRunner().probe(["i"]);
    this._probeResult = {
      available: result.available,
      version: result.version,
      binaryPath: result.binaryPath,
      capabilities: result.available ? ["repack", "extract"] : [],
      error: result.available ? undefined : "7z no encontrado en PATH ni en el directorio de herramientas portables",
    };
    return this._probeResult;
  }

  getCapabilities(
    descriptor: UniversalFileDescriptor,
    probeResult: EngineProbeResult
  ): ConversionCapability[] {
    if (descriptor.category !== "archive") return [];
    const attrs = descriptor.attributes as ArchiveAttributes;

    // Safety gates — return nothing if the archive looks dangerous
    if (attrs.hasDangerousPaths) {
      return [{
        id: `sevenzip-${descriptor.id}-blocked`,
        operation: "blocked",
        outputFormat: "none",
        outputMime: "none",
        label: "Archivo no seguro",
        description: "El archivo contiene rutas peligrosas y no puede procesarse",
        lossProfile: "none",
        state: "unsafe",
        unavailableReason: "El archivo contiene entradas con path traversal (../)",
        recommended: false,
        presets: [],
        warnings: ["Rutas peligrosas detectadas en el archivo"],
        engineId: ENGINE_ID,
        mobilePortability: "desktop-only",
      }];
    }

    if ((attrs.entryCount ?? 0) > MAX_ENTRIES) {
      return [{
        id: `sevenzip-${descriptor.id}-toolarge`,
        operation: "blocked",
        outputFormat: "none",
        outputMime: "none",
        label: "Archivo demasiado grande",
        description: `Demasiadas entradas (${attrs.entryCount ?? "?"}). Límite: ${MAX_ENTRIES}`,
        lossProfile: "none",
        state: "unsafe",
        recommended: false,
        presets: [],
        warnings: [],
        engineId: ENGINE_ID,
        mobilePortability: "desktop-only",
      }];
    }

    const state = probeResult.available ? "available" as const : "unavailable-tool" as const;
    const fromFmt = attrs.archiveFormat?.toLowerCase();

    return OUTPUT_FORMATS
      .filter((fmt) => fmt !== fromFmt)
      .map((fmt) => ({
        id: `sevenzip-${descriptor.id}-repack-${fmt}`,
        operation: "repack",
        outputFormat: fmt,
        outputMime: getMimeType(fmt),
        label: `Reempaquetar a ${formatLabel(fmt)}`,
        description: `Convierte el archivo a ${formatLabel(fmt)}`,
        lossProfile: "lossless" as const,
        state,
        recommended: fmt === "zip",
        presets: buildPresets(fmt),
        warnings: fmt === "tar" ? ["TAR no tiene compresión integrada — el archivo resultante será más grande"] : [],
        engineId: ENGINE_ID,
        mobilePortability: "desktop-only" as const,
      }));
  }

  async execute(
    plan: ConversionPlan,
    onProgress?: (progress: number, stage: string) => void
  ): Promise<ExecutionResult> {
    const start = Date.now();
    const opts = plan.options as unknown as SevenZipOptions;

    // Validate both paths
    try {
      ensurePathSafety(plan.inputPath);
      ensurePathSafety(plan.outputPath);
    } catch (err) {
      return { success: false, outputPath: plan.outputPath, outputSizeBytes: 0, durationMs: 0, logs: [], warnings: [], error: String(err) };
    }

    if (opts.operation === "extract") {
      return this.extractArchive(plan, onProgress ?? (() => {}), start);
    }
    return this.repackArchive(plan, opts, onProgress ?? (() => {}), start);
  }

  private async repackArchive(
    plan: ConversionPlan,
    opts: SevenZipOptions,
    onProgress: (p: number, s: string) => void,
    start: number
  ): Promise<ExecutionResult> {
    // Create a temp directory, extract there, then compress to target format
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "link2media-7z-"));
    try {
      onProgress(10, "Extrayendo contenido");

      // Step 1: Extract to temp
      const extractResult = await this.getRunner().run({
        args: ["x", plan.inputPath, `-o${tmpDir}`, "-y"],
        timeoutMs: plan.timeoutMs / 2,
      });
      if (extractResult.exitCode !== 0) {
        throw new Error(`Extracción fallida: ${extractResult.stderr.slice(0, 200)}`);
      }

      // Expansion ratio check
      const totalExtracted = getDirSizeBytes(tmpDir);
      const inputSize = fs.statSync(plan.inputPath).size;
      const ratio = inputSize > 0 ? totalExtracted / inputSize : 0;
      if (ratio > MAX_EXPANSION_RATIO) {
        throw new Error(`Ratio de expansión ${ratio.toFixed(0)}x excede el límite de seguridad (${MAX_EXPANSION_RATIO}x)`);
      }

      onProgress(60, "Comprimiendo");

      // Step 2: Compress from temp to output
      const fmt = plan.outputFormat as ArchiveOutputFormat;
      const compressionLevel = (opts.compressionLevel ?? 5).toString();
      const args = buildCompressArgs(fmt, tmpDir, plan.outputPath, compressionLevel);

      const compressResult = await this.getRunner().run({
        args,
        timeoutMs: plan.timeoutMs / 2,
      });
      if (compressResult.exitCode !== 0) {
        throw new Error(`Compresión fallida: ${compressResult.stderr.slice(0, 200)}`);
      }

      onProgress(100, "Completado");
      const stat = fs.statSync(plan.outputPath);
      return { success: true, outputPath: plan.outputPath, outputSizeBytes: stat.size, durationMs: Date.now() - start, logs: [], warnings: [] };
    } catch (err) {
      return { success: false, outputPath: plan.outputPath, outputSizeBytes: 0, durationMs: Date.now() - start, logs: [], warnings: [], error: String(err) };
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  }

  private async extractArchive(
    plan: ConversionPlan,
    onProgress: (p: number, s: string) => void,
    start: number
  ): Promise<ExecutionResult> {
    // Extract to a directory named after the output path (sans extension)
    const outDir = plan.outputPath;
    try {
      ensurePathSafety(outDir);
    } catch (err) {
      return { success: false, outputPath: outDir, outputSizeBytes: 0, durationMs: 0, logs: [], warnings: [], error: String(err) };
    }

    onProgress(10, "Extrayendo");
    const result = await this.getRunner().run({
      args: ["x", plan.inputPath, `-o${outDir}`, "-y"],
      timeoutMs: plan.timeoutMs,
    });

    const success = result.exitCode === 0;
    onProgress(100, success ? "Completado" : "Error");

    const size = success ? getDirSizeBytes(outDir) : 0;
    return {
      success,
      outputPath: outDir,
      outputSizeBytes: size,
      durationMs: Date.now() - start,
      logs: [],
      warnings: [],
      error: success ? undefined : result.stderr.slice(0, 300),
    };
  }

  async validate(outputPath: string, plan: ConversionPlan): Promise<ArtifactValidation> {
    const checks: ArtifactValidation["checks"] = [];
    const exists = fs.existsSync(outputPath);
    checks.push({ name: "file-exists", passed: exists });
    if (!exists) return { valid: false, checks };

    const stat = fs.statSync(outputPath);
    checks.push({ name: "size-nonzero", passed: stat.size > 0, detail: `${stat.size} bytes` });

    // Verify archive integrity with 7z test
    try {
      const result = await this.getRunner().run({ args: ["t", outputPath], timeoutMs: 30_000 });
      checks.push({ name: "7z-integrity", passed: result.exitCode === 0, detail: result.stdout.split("\n").find((l) => l.includes("Everything is Ok")) ?? "" });
    } catch {
      checks.push({ name: "7z-integrity", passed: false, detail: "7z test command failed" });
    }

    return { valid: checks.every((c) => c.passed), checks };
  }
}

function buildCompressArgs(fmt: ArchiveOutputFormat, sourceDir: string, outputPath: string, level: string): string[] {
  switch (fmt) {
    case "zip":
      return ["a", "-tzip", `-mx=${level}`, outputPath, path.join(sourceDir, "*")];
    case "7z":
      return ["a", "-t7z", `-mx=${level}`, outputPath, path.join(sourceDir, "*")];
    case "tar":
      return ["a", "-ttar", outputPath, path.join(sourceDir, "*")];
  }
}

function buildPresets(fmt: ArchiveOutputFormat): import("../../domain/engines").ConversionPreset[] {
  if (fmt === "tar") {
    return [{ id: "tar-default", label: "Sin compresión", quality: "0", description: "TAR estándar", isRecommended: true }];
  }
  return [
    { id: `${fmt}-fast`, label: "Rápido (nivel 1)", quality: "1", description: "Compresión mínima, velocidad máxima" },
    { id: `${fmt}-balanced`, label: "Equilibrado (nivel 5)", quality: "5", description: "Buena relación velocidad/tamaño", isRecommended: true },
    { id: `${fmt}-max`, label: "Máximo (nivel 9)", quality: "9", description: "Máxima compresión, más lento" },
  ];
}

function getDirSizeBytes(dirPath: string): number {
  if (!fs.existsSync(dirPath)) return 0;
  const stat = fs.statSync(dirPath);
  if (!stat.isDirectory()) return stat.size;
  let total = 0;
  for (const entry of fs.readdirSync(dirPath)) {
    total += getDirSizeBytes(path.join(dirPath, entry));
  }
  return total;
}

export const sevenZipEngine = new SevenZipEngine();
