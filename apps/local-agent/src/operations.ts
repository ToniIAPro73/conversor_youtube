import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, extname } from "node:path";
import { stringify as yamlStringify, parse as yamlParse } from "yaml";
import type { AgentCapabilities, AgentConfig, AgentJob } from "./types.js";

export interface LocalOperation {
  id: string;
  engineId: string;
  inputMimeTypes: string[];
  outputMimeType: string;
  execute(inputPath: string, outputPath: string, job: AgentJob, signal: AbortSignal): Promise<void>;
  probe(): Promise<{ available: boolean; version: string | null }>;
}

export interface ExecutionSummary {
  outputPath: string;
  outputSizeBytes: number;
  outputSha256: string;
  outputMimeType: string;
}

export class LocalOperationRegistry {
  constructor(private readonly operations = createDefaultOperations()) {}

  async capabilities(config: AgentConfig, deviceId: string, status: AgentCapabilities["status"]): Promise<AgentCapabilities> {
    const engineVersions: Record<string, string> = {};
    const available: string[] = [];
    for (const op of this.operations) {
      const probe = await op.probe();
      if (probe.available) {
        available.push(op.id);
        engineVersions[op.engineId] = probe.version ?? "available";
      }
    }
    return {
      deviceId,
      platform: config.platform,
      arch: config.arch,
      version: config.version,
      operations: available,
      engineVersions,
      limits: { maxFileSizeBytes: config.maxFileSizeBytes, maxConcurrent: config.maxConcurrent },
      load: 0,
      freeDiskBytes: 0,
      status,
      lastSeen: new Date().toISOString(),
    };
  }

  find(operationId: string): LocalOperation | null {
    return this.operations.find((op) => op.id === operationId) ?? null;
  }

  async execute(job: AgentJob, inputPath: string, outputPath: string, signal: AbortSignal): Promise<ExecutionSummary> {
    const operation = this.find(job.operation);
    if (!operation) throw new Error("OPERATION_UNAVAILABLE");
    if (!operation.inputMimeTypes.includes(job.inputMimeType)) {
      throw new Error("UPLOAD_MIME_REJECTED");
    }

    mkdirSync(dirname(outputPath), { recursive: true, mode: 0o700 });
    await withTimeout(job.timeoutMs, signal, (childSignal) => operation.execute(inputPath, outputPath, job, childSignal));
    const bytes = readFileSync(outputPath);
    return {
      outputPath,
      outputSizeBytes: statSync(outputPath).size,
      outputSha256: createHash("sha256").update(bytes).digest("hex"),
      outputMimeType: job.outputMimeType ?? operation.outputMimeType,
    };
  }
}

function createDefaultOperations(): LocalOperation[] {
  return [
    {
      id: "data.json-to-yaml",
      engineId: "data-ts",
      inputMimeTypes: ["application/json", "text/json"],
      outputMimeType: "application/yaml",
      async probe() {
        return { available: true, version: "yaml" };
      },
      async execute(inputPath, outputPath, _job, signal) {
        throwIfAborted(signal);
        const parsed = JSON.parse(readFileSync(inputPath, "utf8")) as unknown;
        writeFileSync(outputPath, yamlStringify(parsed), { mode: 0o600 });
      },
    },
    {
      id: "data.yaml-to-json",
      engineId: "data-ts",
      inputMimeTypes: ["application/yaml", "text/yaml", "application/x-yaml"],
      outputMimeType: "application/json",
      async probe() {
        return { available: true, version: "yaml" };
      },
      async execute(inputPath, outputPath, _job, signal) {
        throwIfAborted(signal);
        const parsed = yamlParse(readFileSync(inputPath, "utf8")) as unknown;
        writeFileSync(outputPath, `${JSON.stringify(parsed, null, 2)}\n`, { mode: 0o600 });
      },
    },
    {
      id: "image.png-to-webp",
      engineId: "sharp-image",
      inputMimeTypes: ["image/png"],
      outputMimeType: "image/webp",
      async probe() {
        try {
          const sharp = await import("sharp");
          return { available: true, version: sharp.default.versions.sharp ?? "sharp" };
        } catch {
          return { available: false, version: null };
        }
      },
      async execute(inputPath, outputPath, _job, signal) {
        throwIfAborted(signal);
        const sharp = await import("sharp");
        await sharp.default(inputPath, { failOn: "error" }).webp().toFile(outputPath);
      },
    },
  ];
}

export function outputExtension(operationId: string): string {
  const ext = operationId.split("-to-")[1];
  return ext ? `.${ext}` : ".out";
}

export function validateSafeFilename(filename: string): string {
  const sanitized = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  if (!sanitized || sanitized.includes("..") || sanitized !== filename.replace(/[\\/]/g, "_").replace(/[^a-zA-Z0-9._-]/g, "_")) {
    throw new Error("VALIDATION_FAILED");
  }
  return sanitized;
}

export function expectedOutputPath(workDir: string, job: AgentJob): string {
  const originalExt = extname(job.inputFilename);
  const base = validateSafeFilename(job.inputFilename).slice(0, originalExt ? -originalExt.length : undefined) || "output";
  return `${workDir}/${base}${outputExtension(job.operation)}`;
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) throw new Error("JOB_CANCELLED");
}

async function withTimeout<T>(timeoutMs: number, parent: AbortSignal, fn: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  const onAbort = () => controller.abort(parent.reason);
  parent.addEventListener("abort", onAbort, { once: true });
  const timer = setTimeout(() => controller.abort(new Error("JOB_TIMEOUT")), timeoutMs);
  try {
    return await fn(controller.signal);
  } finally {
    clearTimeout(timer);
    parent.removeEventListener("abort", onAbort);
  }
}
