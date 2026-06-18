import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { jobManager } from "@/lib/jobs/job-manager";
import { processJob } from "@/lib/media/processor";
import { processUniversalJob } from "@/lib/jobs/universal-job-processor";
import { getEngine } from "@/lib/engines/registry";
import { CONFIG } from "@/lib/config";
import { ERROR_CODES, ERROR_MESSAGES } from "@/lib/errors";
import { normalizeYoutubeUrl } from "@/lib/youtube/normalize-url";
import { getVideoMetadata } from "@/lib/media/metadata";
import { ALL_ALLOWED_EXTENSIONS } from "@/lib/domain/format-catalog";
import { buildDescriptor } from "@/lib/detection/file-detector";
import {
  extractEngineIdFromCapabilityId,
  extractOutputFormatFromCapabilityId,
} from "@/lib/jobs/capability-routing";
import { getDb } from "@/lib/infrastructure/db/database";
import type { JobRow } from "@/lib/infrastructure/db/job-repository";
import path from "path";
import fs from "fs";
import crypto from "crypto";

// ── Media formats (legacy) ────────────────────────────────────────────────────

const AUDIO_FORMATS = ["mp3", "m4a", "wav", "flac", "ogg"] as const;
const VIDEO_FORMATS = ["mp4", "webm", "mkv"] as const;
const MEDIA_FORMATS = [...AUDIO_FORMATS, ...VIDEO_FORMATS] as const;

// ── Schema ────────────────────────────────────────────────────────────────────

const JobRequestSchema = z.object({
  // Legacy fields (backward compatible)
  videoId: z.string().optional(),
  url: z.string().optional(),
  localFilePath: z.string().optional(),
  format: z.string().optional(),
  quality: z.string().min(1).max(10).optional(),
  rightsConfirmed: z.boolean(),
  operation: z.string().optional(),
  // New universal fields
  inputId: z.string().optional(),
  capabilityId: z.string().optional(),
  presetId: z.string().nullable().optional(),
  options: z.record(z.string(), z.unknown()).optional(),
}).refine(data => data.url || data.localFilePath || data.inputId, {
  message: "Must provide url, localFilePath, or inputId",
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const validated = JobRequestSchema.safeParse(body);

    if (!validated.success) {
      return NextResponse.json(
        { error: validated.error.issues[0].message, code: "VALIDATION_ERROR" },
        { status: 400 }
      );
    }

    if (!validated.data.rightsConfirmed) {
      return NextResponse.json(
        { error: "Debes confirmar que tienes derechos sobre el contenido.", code: "RIGHTS_NOT_CONFIRMED" },
        { status: 400 }
      );
    }

    const clientIp = req.headers.get("x-forwarded-for") ?? "127.0.0.1";

    if (jobManager.getActiveJobsCount() >= CONFIG.media.limits.maxConcurrentJobs) {
      return NextResponse.json(
        { error: ERROR_MESSAGES.QUEUE_FULL, code: ERROR_CODES.QUEUE_FULL },
        { status: 503 }
      );
    }

    if (jobManager.getClientActiveJob(clientIp)) {
      return NextResponse.json(
        { error: ERROR_MESSAGES.JOB_ALREADY_ACTIVE, code: ERROR_CODES.JOB_ALREADY_ACTIVE },
        { status: 429 }
      );
    }

    const data = validated.data;

    // ── Universal job path ─────────────────────────────────────────────────
    if (data.capabilityId && data.inputId) {
      return await handleUniversalJob(data, clientIp);
    }

    // ── Legacy media job path ──────────────────────────────────────────────
    return handleLegacyMediaJob(data, clientIp);
  } catch (error: unknown) {
    console.error("Jobs API Error:", error);
    return NextResponse.json(
      { error: ERROR_MESSAGES.INTERNAL_ERROR, code: ERROR_CODES.INTERNAL_ERROR },
      { status: 500 }
    );
  }
}

// ── Universal job handler ─────────────────────────────────────────────────────

async function handleUniversalJob(
  data: z.infer<typeof JobRequestSchema>,
  clientIp: string
): Promise<NextResponse> {
  const { capabilityId, inputId, format, options, operation, presetId } = data;

  if (!capabilityId) {
    return NextResponse.json(
      { error: "Falta capabilityId para trabajo universal.", code: "VALIDATION_ERROR" },
      { status: 400 }
    );
  }

  if (!inputId) {
    return NextResponse.json(
      { error: "Falta inputId para trabajo universal.", code: "VALIDATION_ERROR" },
      { status: 400 }
    );
  }

  // Resolve the engine from the capability ID — NOT trusted from client
  const engineId = extractEngineIdFromCapabilityId(capabilityId);
  const engine = getEngine(engineId);

  if (!engine) {
    return NextResponse.json(
      { error: `Motor de conversión no encontrado: ${engineId}`, code: "ENGINE_NOT_FOUND" },
      { status: 400 }
    );
  }

  // Probe the engine
  const probeResult = await engine.probe();
  if (!probeResult.available) {
    return NextResponse.json(
      { error: `Motor no disponible: ${engineId}. ${probeResult.error ?? ""}`, code: "ENGINE_UNAVAILABLE" },
      { status: 503 }
    );
  }

  // Resolve input path from inputId
  const inputInfo = resolveInputFromId(inputId);
  if (!inputInfo) {
    return NextResponse.json(
      { error: "Input no encontrado. Puede haber expirado.", code: "INPUT_NOT_FOUND" },
      { status: 404 }
    );
  }

  // Determine output format
  const outputFormat = format ?? extractOutputFormatFromCapabilityId(capabilityId);
  if (!outputFormat) {
    return NextResponse.json(
      { error: "No se pudo determinar el formato de salida.", code: "VALIDATION_ERROR" },
      { status: 400 }
    );
  }

  // Validate the output format against the catalog
  if (!ALL_ALLOWED_EXTENSIONS.has(outputFormat) && !(MEDIA_FORMATS as readonly string[]).includes(outputFormat)) {
    return NextResponse.json(
      { error: `Formato de salida no soportado: ${outputFormat}`, code: "UNSUPPORTED_FORMAT" },
      { status: 400 }
    );
  }

  // Build the descriptor to re-validate the capability
  const descriptor = await buildDescriptor(
    inputInfo.localPath,
    { kind: "local-upload", originalName: inputInfo.originalName, storedRelativePath: inputInfo.storedRelativePath },
    inputId
  );

  // Validate capability against engine registry
  const capabilities = engine.getCapabilities(descriptor, probeResult);
  const matchingCap = capabilities.find((c) => c.id === capabilityId);
  if (!matchingCap) {
    return NextResponse.json(
      { error: `Capacidad no válida para este archivo: ${capabilityId}`, code: "INVALID_CAPABILITY" },
      { status: 400 }
    );
  }

  if (matchingCap.state !== "available" && matchingCap.state !== "experimental") {
    return NextResponse.json(
      { error: `Capacidad no disponible: ${matchingCap.unavailableReason ?? "herramienta no instalada"}`, code: "CAPABILITY_UNAVAILABLE" },
      { status: 503 }
    );
  }

  // Determine the operation
  const resolvedOperation = operation ?? matchingCap.operation;

  // Resolve quality from preset or default
  let quality = "0";
  if (presetId && matchingCap.presets.length > 0) {
    const preset = matchingCap.presets.find((p) => p.id === presetId);
    if (preset) quality = preset.quality;
  }

  // Create job with universal fields
  const job = createUniversalJob({
    inputReference: inputInfo.storedRelativePath,
    outputFormat,
    quality,
    clientIp,
    operation: resolvedOperation,
    inputKind: "universal-file",
    inputTitle: inputInfo.originalName,
    capabilityId,
    engineId,
    category: descriptor.category,
    inputMimeType: descriptor.detectedMimeType ?? "application/octet-stream",
    inputFormat: descriptor.detectedFormat ?? descriptor.extension ?? "unknown",
    options: options ?? {},
  });

  // Route to universal processor
  processUniversalJob(job.id).catch(console.error);

  return NextResponse.json({ jobId: job.id, status: job.status });
}

// ── Legacy media job handler ──────────────────────────────────────────────────

function handleLegacyMediaJob(
  data: z.infer<typeof JobRequestSchema>,
  clientIp: string
): NextResponse {
  const format = data.format;
  if (!format) {
    return NextResponse.json(
      { error: "Falta el formato de salida.", code: "VALIDATION_ERROR" },
      { status: 400 }
    );
  }

  let inputReference: string;
  let inputTitle: string | undefined;
  const inputKind: "remote-url" | "local-file" = data.localFilePath ? "local-file" : "remote-url";

  if (inputKind === "local-file") {
    if (!data.localFilePath) {
      return NextResponse.json({ error: "Falta ruta del archivo local.", code: "INVALID_INPUT" }, { status: 400 });
    }
    inputReference = data.localFilePath;
  } else {
    const rawUrl = data.url ?? (data.videoId ? `https://www.youtube.com/watch?v=${data.videoId}` : null);
    if (!rawUrl) {
      return NextResponse.json({ error: "Falta URL o videoId.", code: "INVALID_INPUT" }, { status: 400 });
    }
    const normalizedUrl = normalizeYoutubeUrl(rawUrl);
    if (!normalizedUrl) {
      return NextResponse.json(
        { error: ERROR_MESSAGES.INVALID_URL, code: ERROR_CODES.INVALID_URL },
        { status: 400 }
      );
    }
    inputReference = normalizedUrl;

    // Fetch title asynchronously (non-blocking for job creation)
    getVideoMetadata(normalizedUrl).then((meta) => {
      if (meta.title) {
        const currentJob = jobManager.getClientActiveJob(clientIp);
        if (currentJob) {
          jobManager.updateJob(currentJob.id, { input_title: meta.title });
        }
      }
    }).catch(() => {
      // Non-fatal
    });
  }

  const operation =
    data.operation && data.operation !== "transcode-audio"
      ? data.operation
      : AUDIO_FORMATS.includes(format as (typeof AUDIO_FORMATS)[number])
      ? "transcode-audio"
      : "transcode-video";

  const quality = data.quality ?? "5";

  const job = jobManager.createJob(
    inputReference,
    format,
    quality,
    clientIp,
    operation,
    inputKind,
    inputTitle
  );

  processJob(job.id).catch(console.error);

  return NextResponse.json({ jobId: job.id, status: job.status });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// extractEngineIdFromCapabilityId and extractOutputFormatFromCapabilityId
// are imported from @/lib/jobs/capability-routing

interface InputInfo {
  localPath: string;
  storedRelativePath: string;
  originalName: string;
}

/**
 * Resolve an inputId to its stored file information.
 * Checks the inputs table first, then falls back to the uploads directory.
 */
function resolveInputFromId(inputId: string): InputInfo | null {
  // Try to find in the inputs table
  try {
    const db = getDb();
    const row = db.prepare("SELECT * FROM inputs WHERE id = ? AND status = 'active'").get(inputId) as Record<string, unknown> | undefined;
    if (row) {
      const storedRelativePath = row.stored_relative_path as string;
      const localPath = path.resolve(CONFIG.media.tempDir, storedRelativePath);
      return {
        localPath,
        storedRelativePath,
        originalName: row.original_name as string,
      };
    }
  } catch {
    // Database may not be available in some contexts
  }

  // Fallback: check uploads directory for the inputId
  const uploadDir = path.join(CONFIG.media.tempDir, "uploads", inputId);
  if (fs.existsSync(uploadDir)) {
    const files = fs.readdirSync(uploadDir);
    if (files.length > 0) {
      const fileName = files[0]!;
      const localPath = path.join(uploadDir, fileName);
      const storedRelativePath = path.relative(CONFIG.media.tempDir, localPath);
      return {
        localPath,
        storedRelativePath,
        originalName: fileName,
      };
    }
  }

  return null;
}

interface UniversalJobParams {
  inputReference: string;
  outputFormat: string;
  quality: string;
  clientIp: string;
  operation: string;
  inputKind: "universal-file";
  inputTitle: string;
  capabilityId: string;
  engineId: string;
  category: string;
  inputMimeType: string;
  inputFormat: string;
  options: Record<string, unknown>;
}

function createUniversalJob(params: UniversalJobParams): JobRow {
  const db = getDb();
  const id = crypto.randomBytes(16).toString("hex");
  const ttl = CONFIG.media.limits.jobTtlMinutes;
  const expiresAt = new Date(Date.now() + ttl * 60 * 1000).toISOString();

  db.prepare(`
    INSERT INTO jobs (
      id, input_kind, input_reference, input_title,
      operation, output_format, quality, options_json,
      status, stage, progress,
      client_ip, expires_at,
      category, engine_id, conversion_id, input_mime_type, input_format
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'queued', 'En cola', 0, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    params.inputKind,
    params.inputReference,
    params.inputTitle,
    params.operation,
    params.outputFormat,
    params.quality,
    Object.keys(params.options).length > 0 ? JSON.stringify(params.options) : null,
    params.clientIp,
    expiresAt,
    params.category,
    params.engineId,
    params.capabilityId,
    params.inputMimeType,
    params.inputFormat
  );

  // Fetch and return the created job
  return db.prepare("SELECT * FROM jobs WHERE id = ?").get(id) as JobRow;
}
