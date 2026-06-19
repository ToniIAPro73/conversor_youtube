// Universal Job Processor — orchestrator for non-media conversion jobs.
// Recovers job from DB, resolves engine, builds plan, executes, validates, persists.
// Marked as completed ONLY after output validation passes.

import path from "path";
import fs from "fs";
import crypto from "crypto";
import type { ConversionPlan, ExecutionResult } from "../domain/engines";
import type { FileCategory, LossProfile } from "../domain/descriptors";
import { getEngine } from "../engines/registry";
import { jobManager } from "./job-manager";
import { CONFIG } from "../config";
import { ensurePathSafety } from "../security/path-safety";
import { sanitizeFilename } from "../security/sanitize-filename";
import { FORMAT_BY_EXTENSION } from "../domain/format-catalog";
import {
  createAppError,
  ERROR_MESSAGES,
  type AppError,
  type ErrorCode,
} from "../errors/error-codes";
import { extractEngineIdFromCapabilityId } from "./capability-routing";
import { checkDiskSpace } from "./disk-space-check";
import { coordinatedCleanup } from "./coordinated-cleanup";

// ── Magic bytes table for output validation ──────────────────────────────────

const MAGIC_SIGNATURES: Array<{
  bytes: Buffer;
  offset: number;
  mimeType: string;
}> = [
  { bytes: Buffer.from([0xff, 0xd8, 0xff]), offset: 0, mimeType: "image/jpeg" },
  {
    bytes: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
    offset: 0,
    mimeType: "image/png",
  },
  { bytes: Buffer.from([0x47, 0x49, 0x46]), offset: 0, mimeType: "image/gif" },
  {
    bytes: Buffer.from([0x52, 0x49, 0x46, 0x46]),
    offset: 0,
    mimeType: "image/webp",
  },
  {
    bytes: Buffer.from([0x25, 0x50, 0x44, 0x46]),
    offset: 0,
    mimeType: "application/pdf",
  },
  {
    bytes: Buffer.from([0x50, 0x4b, 0x03, 0x04]),
    offset: 0,
    mimeType: "application/zip",
  },
  {
    bytes: Buffer.from([0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c]),
    offset: 0,
    mimeType: "application/x-7z-compressed",
  },
  { bytes: Buffer.from([0x1f, 0x8b]), offset: 0, mimeType: "application/gzip" },
];

function detectOutputMime(filePath: string): string | null {
  try {
    const fd = fs.openSync(filePath, "r");
    try {
      for (const sig of MAGIC_SIGNATURES) {
        const buf = Buffer.alloc(sig.bytes.length);
        fs.readSync(fd, buf, 0, sig.bytes.length, sig.offset);
        if (buf.equals(sig.bytes)) return sig.mimeType;
      }
      // Check for RIFF → WebP specifically (bytes 8-11)
      const riffBuf = Buffer.alloc(12);
      fs.readSync(fd, riffBuf, 0, 12, 0);
      const typeBytes = riffBuf.slice(8, 12).toString("ascii");
      if (typeBytes === "WEBP") return "image/webp";

      const bmffBuf = Buffer.alloc(64);
      fs.readSync(fd, bmffBuf, 0, 64, 0);
      if (bmffBuf.slice(4, 8).toString("ascii") === "ftyp") {
        const majorBrand = bmffBuf.slice(8, 12).toString("ascii");
        const brands = bmffBuf.toString("ascii");
        if (
          majorBrand === "avif" ||
          majorBrand === "avis" ||
          brands.includes("avif") ||
          brands.includes("avis")
        )
          return "image/avif";
      }
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    // Cannot read file
  }
  return null;
}

// ── Output MIME from format catalog ──────────────────────────────────────────

function getOutputMimeType(outputFormat: string): string {
  const fmtDef = FORMAT_BY_EXTENSION.get(outputFormat);
  if (fmtDef && fmtDef.mimeTypes.length > 0) return fmtDef.mimeTypes[0];

  // Fallback MIME mapping
  const FALLBACK: Record<string, string> = {
    json: "application/json",
    yaml: "application/x-yaml",
    yml: "application/x-yaml",
    toml: "application/toml",
    xml: "application/xml",
    csv: "text/csv",
    tsv: "text/tab-separated-values",
    md: "text/markdown",
    html: "text/html",
    txt: "text/plain",
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    odt: "application/vnd.oasis.opendocument.text",
    pdf: "application/pdf",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ods: "application/vnd.oasis.opendocument.spreadsheet",
    pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    odp: "application/vnd.oasis.opendocument.presentation",
    zip: "application/zip",
    "7z": "application/x-7z-compressed",
    tar: "application/x-tar",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    avif: "image/avif",
    tiff: "image/tiff",
    gif: "image/gif",
    tex: "application/x-latex",
    rst: "text/x-rst",
    rtf: "application/rtf",
  };
  return FALLBACK[outputFormat] ?? "application/octet-stream";
}

// ── Log redaction ─────────────────────────────────────────────────────────────

function redact(message: string): string {
  // Remove absolute paths from log messages
  return message.replace(/\/[^\s"',:;)]+/g, (m) => {
    const parts = m.split("/");
    return parts.length > 3 ? `/.../${parts.slice(-2).join("/")}` : m;
  });
}

// ── Main processor ────────────────────────────────────────────────────────────

export async function processUniversalJob(jobId: string): Promise<void> {
  const log: string[] = [];

  try {
    // 1. Recover job from DB
    const job = jobManager.getJob(jobId);
    if (!job) {
      throw createAppError("JOB_NOT_FOUND", `Job ${jobId} not found`, {
        stage: "recovery",
      });
    }

    if (job.status !== "queued") {
      throw createAppError(
        "INVALID_STATE",
        `Job ${jobId} is not queued (status: ${job.status})`,
        { stage: "recovery" },
      );
    }

    log.push(`[universal-job] Starting job ${jobId}`);

    // 2. Get input file path
    const inputPath = resolveInputPath(job.input_reference, job.input_kind);
    if (!fs.existsSync(inputPath)) {
      throw createAppError("INPUT_NOT_FOUND", `Input file not found`, {
        stage: "recovery",
        technicalDetail: `Input not found at ${redact(inputPath)}`,
      });
    }

    // 3. Re-validate capability against the engine registry
    const conversionId = job.conversion_id;
    if (!conversionId) {
      throw createAppError(
        "MISSING_CONVERSION_ID",
        `Job ${jobId} has no conversion_id`,
        { stage: "recovery" },
      );
    }

    // 4. Resolve engine from the registry via conversion_id
    const engineId = extractEngineIdFromCapabilityId(conversionId);
    const engine = getEngine(engineId);
    if (!engine) {
      throw createAppError(
        "ENGINE_NOT_FOUND",
        `Engine not found for capability`,
        {
          stage: "engine-resolution",
          engineId,
          technicalDetail: `Engine ${engineId} not found for capability ${conversionId}`,
        },
      );
    }

    // Probe the engine to ensure it's available
    const probeResult = await engine.probe();
    if (!probeResult.available) {
      throw createAppError("ENGINE_UNAVAILABLE", `Engine is not available`, {
        stage: "engine-resolution",
        engineId,
        technicalDetail: probeResult.error ?? "unknown error",
      });
    }

    log.push(
      `[universal-job] Engine: ${engineId} v${probeResult.version ?? "unknown"}`,
    );

    // Update job to processing state
    jobManager.updateJob(jobId, {
      status: "processing",
      stage: "Preparando conversión",
      progress: 5,
      started_at: new Date().toISOString(),
      engine_id: engineId,
    });

    // 5. Check disk space before starting large conversions
    const inputStat = fs.statSync(inputPath);
    // Estimate output as 2x input size as a safety margin
    const estimatedRequired = inputStat.size * 2;
    const diskCheck = await checkDiskSpace(
      estimatedRequired,
      CONFIG.media.tempDir,
    );
    if (!diskCheck.sufficient) {
      throw createAppError("INSUFFICIENT_DISK_SPACE", diskCheck.message, {
        stage: "pre-execution",
        engineId,
      });
    }

    // 6. Create isolated working directory
    const jobDir = path.join(CONFIG.media.tempDir, jobId);
    if (!fs.existsSync(jobDir)) {
      fs.mkdirSync(jobDir, { recursive: true });
    }

    const outputFormat = job.output_format;
    const outputExt = `.${outputFormat}`;
    const outputPath = path.join(jobDir, `output${outputExt}`);

    // Ensure output path is safe
    try {
      ensurePathSafety(outputPath);
    } catch (err) {
      throw createAppError("UNSAFE_PATH", `Output path safety check failed`, {
        stage: "pre-execution",
        engineId,
        technicalDetail: String(err),
      });
    }

    // 7. Build execution plan
    const plan: ConversionPlan = {
      jobId,
      engineId: engine.id,
      operation: job.operation,
      inputPath,
      outputPath,
      outputFormat,
      options: {
        ...(job.options_json ? JSON.parse(job.options_json) : {}),
        inputFormat: job.input_format,
      },
      args: [],
      env: {},
      timeoutMs: CONFIG.media.limits.conversionTimeoutSeconds * 1000,
      estimatedSizeBytes: estimatedRequired,
    };

    // 8. Execute the engine with progress and cancellation support
    const onProgress = (progress: number, stage: string) => {
      // Clamp progress to 5–90 range (validation occupies 90–100)
      const clampedProgress = Math.min(Math.max(progress, 5), 90);
      jobManager.updateJob(jobId, {
        progress: clampedProgress,
        stage,
      });
    };

    let result: ExecutionResult;
    try {
      result = await engine.execute(plan, onProgress);
    } catch (err) {
      throw createAppError("ENGINE_EXECUTE_FAILED", `Engine execution failed`, {
        stage: "execution",
        engineId,
        technicalDetail: redact(String(err)),
        cause: err instanceof Error ? err : undefined,
      });
    }

    if (!result.success) {
      throw createAppError("ENGINE_EXECUTE_FAILED", `Engine execution failed`, {
        stage: "execution",
        engineId,
        technicalDetail: redact(result.error ?? "unknown error"),
      });
    }

    log.push(
      `[universal-job] Execution completed in ${result.durationMs}ms, output size: ${result.outputSizeBytes} bytes`,
    );

    // 9. Validate the output artifact
    jobManager.updateJob(jobId, {
      status: "verifying",
      stage: "Verificando archivo de salida",
      progress: 95,
    });

    const validation = await engine.validate(outputPath, plan);
    if (!validation.valid) {
      const failedChecks = validation.checks
        .filter((c) => !c.passed)
        .map((c) => `${c.name}: ${c.detail ?? "failed"}`)
        .join("; ");
      throw createAppError("VALIDATION_FAILED", `Output validation failed`, {
        stage: "validation",
        engineId,
        technicalDetail: failedChecks,
      });
    }

    // Additional deep validation: check magic bytes, MIME, size
    const deepValidation = validateOutputArtifact(outputPath, outputFormat);
    if (!deepValidation.valid) {
      throw createAppError(
        "ARTIFACT_VALIDATION_FAILED",
        `Deep validation failed`,
        {
          stage: "validation",
          engineId,
          technicalDetail: deepValidation.error ?? "unknown",
        },
      );
    }

    log.push(`[universal-job] Validation passed`);

    // 10. Persist metadata
    const outputMime = getOutputMimeType(outputFormat);
    const inputFormat =
      job.input_format ??
      path.extname(inputPath).replace(".", "").toLowerCase() ??
      "unknown";
    const inputMimeType = job.input_mime_type ?? "application/octet-stream";

    // Determine loss profile from capability
    const lossProfile = await resolveLossProfile(
      conversionId,
      job.operation,
      inputPath,
      engineId,
    );

    // Determine category from format catalog
    const category = (FORMAT_BY_EXTENSION.get(outputFormat)?.category ??
      "unknown") as FileCategory;

    // 11. Create download token
    const token = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

    // Compute safe relative path
    const relOutputPath = path.relative(CONFIG.media.tempDir, outputPath);

    // Build output file name from input title or fallback
    const currentJob = jobManager.getJob(jobId);
    const titleBase = currentJob?.input_title
      ? sanitizeFilename(currentJob.input_title)
      : `output_${jobId.substring(0, 8)}`;
    const finalFileName = `${titleBase}${outputExt}`;

    // 12. Update job to completed — ONLY after validation
    jobManager.updateJob(jobId, {
      status: "completed",
      stage: "Completado",
      progress: 100,
      file_size_bytes: result.outputSizeBytes,
      mime_type: outputMime,
      download_token_hash: tokenHash,
      output_file_name: finalFileName,
      output_relative_path: relOutputPath,
      completed_at: new Date().toISOString(),
      // Universal fields
      category,
      engine_id: engineId,
      engine_version: probeResult.version ?? null,
      conversion_id: conversionId,
      input_mime_type: inputMimeType,
      input_format: inputFormat,
      output_mime_type: outputMime,
      loss_profile: lossProfile,
      validation_json: JSON.stringify({
        engineValidation: validation.checks,
        deepValidation: deepValidation.checks,
      }),
      warnings_json:
        result.warnings.length > 0 ? JSON.stringify(result.warnings) : null,
    });

    log.push(`[universal-job] Job ${jobId} completed successfully`);

    // 13. Trigger coordinated cleanup reference (async, non-blocking)
    // This will clean up expired jobs and orphaned files on the next interval
    // We don't await this to avoid blocking the job completion response
    coordinatedCleanup().catch((err) => {
      console.error(
        "[universal-job] Post-job cleanup error:",
        redact(String(err)),
      );
    });

    // 14. Log redacted messages
    for (const msg of log) {
      console.log(redact(msg));
    }
  } catch (error: unknown) {
    const appError = error as AppError;
    const code: ErrorCode = appError?.code ?? "ENGINE_EXECUTE_FAILED";
    const message =
      error instanceof Error ? error.message : "Error interno del procesador.";
    const stage = appError?.stage ?? "unknown";
    const engineId = appError?.engineId ?? "unknown";
    const technicalDetail =
      appError?.technicalDetail ??
      (error instanceof Error ? error.message : "");

    // Build user-facing error message with actionable detail
    const userMessage = buildUserErrorMessage(code, technicalDetail, engineId);

    jobManager.updateJob(jobId, {
      status: "failed",
      error_code: code,
      error_message: userMessage,
      stage: "Error",
    });

    // Enhanced logging: engine, redacted command context, exit code, stderr summary
    const logEntry = [
      `[universal-job] Job ${jobId} FAILED`,
      `  stage: ${stage}`,
      `  engine: ${engineId}`,
      `  code: ${code}`,
      `  message: ${redact(message)}`,
      technicalDetail
        ? `  detail: ${redact(technicalDetail).slice(0, 500)}`
        : null,
    ]
      .filter(Boolean)
      .join("\n");

    log.push(logEntry);
    for (const msg of log) {
      console.error(redact(msg));
    }
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function resolveInputPath(inputReference: string, inputKind: string): string {
  if (inputKind === "local-file" || inputKind === "universal-file") {
    // inputReference is a relative path under the temp dir
    return path.resolve(CONFIG.media.tempDir, inputReference);
  }
  // For remote URLs, inputReference is the URL itself — but universal jobs
  // should always have a local file. If not, this will fail at the exists check.
  return inputReference;
}

// extractEngineIdFromCapabilityId (used as extractEngineIdFromConversionId below)
// is imported from ./capability-routing

/**
 * Deep output validation beyond engine checks:
 * - File exists
 * - Size > 0
 * - Magic bytes match expected MIME (where applicable)
 */
function validateOutputArtifact(
  outputPath: string,
  expectedFormat: string,
): {
  valid: boolean;
  checks: Array<{ name: string; passed: boolean; detail?: string }>;
  error?: string;
} {
  const checks: Array<{ name: string; passed: boolean; detail?: string }> = [];

  // File exists
  const exists = fs.existsSync(outputPath);
  checks.push({ name: "file-exists", passed: exists });
  if (!exists) {
    return { valid: false, checks, error: "Output file does not exist" };
  }

  // Size > 0
  const stat = fs.statSync(outputPath);
  checks.push({
    name: "size-nonzero",
    passed: stat.size > 0,
    detail: `${stat.size} bytes`,
  });
  if (stat.size === 0) {
    return { valid: false, checks, error: "Output file is empty (0 bytes)" };
  }

  // Magic bytes check for known binary formats
  const detectedMime = detectOutputMime(outputPath);
  const expectedMime = getOutputMimeType(expectedFormat);

  if (detectedMime) {
    // For formats with clear magic signatures, verify match
    const mimeMatch =
      detectedMime === expectedMime ||
      // Allow MIME subtypes (e.g., application/zip matches for DOCX/XLSX containers)
      (detectedMime === "application/zip" &&
        (expectedMime.includes("openxmlformats") ||
          expectedMime.includes("oasis") ||
          expectedMime.includes("epub")));

    checks.push({
      name: "magic-bytes",
      passed: mimeMatch,
      detail: `detected=${detectedMime} expected=${expectedMime}`,
    });
  } else {
    // Text-based formats won't have magic bytes — that's fine
    checks.push({
      name: "magic-bytes",
      passed: true,
      detail: "no magic signature for text-based format",
    });
  }

  const allPassed = checks.every((c) => c.passed);
  return {
    valid: allPassed,
    checks,
    error: allPassed ? undefined : "Output artifact validation failed",
  };
}

/**
 * Resolve the loss profile for the conversion.
 * Looks up the capability from the engine registry and returns its loss profile.
 */
async function resolveLossProfile(
  conversionId: string,
  operation: string,
  inputPath: string,
  engineId: string,
): Promise<LossProfile> {
  try {
    const ext = path.extname(inputPath).replace(".", "").toLowerCase();
    const formatDef = FORMAT_BY_EXTENSION.get(ext);
    if (!formatDef) return "lossy";

    const category = formatDef.category;
    const engine = getEngine(engineId);
    if (!engine) return "lossy";

    // Build a minimal descriptor for capability lookup
    const descriptor = {
      id: "loss-lookup",
      category,
      originalName: `input.${ext}`,
      extension: ext,
      detectedMimeType: formatDef.mimeTypes[0] ?? null,
      detectedFormat: ext,
      sizeBytes: 0,
      sha256: null,
      source: {
        kind: "local-upload" as const,
        originalName: `input.${ext}`,
        storedRelativePath: `input.${ext}`,
      },
      attributes: { kind: "unknown" as const },
      warnings: [],
      analyzedBy: [],
      analyzedAt: new Date().toISOString(),
    };

    const probeResult = await engine.probe();
    const caps = engine.getCapabilities(descriptor, probeResult);
    const matchingCap = caps.find((c) => c.id === conversionId);

    if (matchingCap) {
      // Map domain engines LossProfile to descriptors LossProfile
      const lp = matchingCap.lossProfile;
      if (
        lp === "lossless" ||
        lp === "lossy" ||
        lp === "metadata-risk" ||
        lp === "structure-risk" ||
        lp === "none"
      ) {
        return lp;
      }
      return "lossy";
    }

    return "lossy";
  } catch {
    return "lossy";
  }
}

// Exported for testing
export { validateOutputArtifact, getOutputMimeType, detectOutputMime };

// ── User-facing error message builder ─────────────────────────────────────────

/**
 * Builds a user-facing error message that includes actionable detail.
 * Falls back to generic ERROR_MESSAGES for the code when no detail is available.
 */
function buildUserErrorMessage(
  code: ErrorCode,
  technicalDetail: string,
  engineId: string,
): string {
  const baseMessage = ERROR_MESSAGES[code] ?? "Error desconocido.";

  if (!technicalDetail) return baseMessage;

  // Extract actionable info from technical detail
  const detail = extractUserDetail(technicalDetail);
  if (!detail) return baseMessage;

  return `${baseMessage} (${engineId}: ${detail})`;
}

/**
 * Extracts a user-friendly summary from the technical error detail.
 * Removes paths and internal data, keeps the useful error description.
 */
function extractUserDetail(technicalDetail: string): string | null {
  if (!technicalDetail || technicalDetail === "unknown error") return null;

  // Extract pandoc exit code and message pattern
  const pandocMatch = technicalDetail.match(/pandoc exit (\d+):\s*([\s\S]+)/);
  if (pandocMatch) {
    const exitCode = pandocMatch[1];
    const stderr = pandocMatch[2]?.trim().slice(0, 200) ?? "";
    if (stderr) return `exit ${exitCode} — ${stderr}`;
    return `exit ${exitCode}`;
  }

  // Generic: just truncate
  const cleaned = technicalDetail.slice(0, 200).trim();
  return cleaned || null;
}
