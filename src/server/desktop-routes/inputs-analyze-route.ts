import { NextRequest, NextResponse } from "next/server";
import { probeFile, MediaDescriptor } from "@/lib/media/probe";
import { getVideoMetadata } from "@/lib/media/metadata";
import { normalizeYoutubeUrl } from "@/lib/youtube/normalize-url";
import { CONFIG } from "@/lib/config";
import { sanitizeFilename } from "@/lib/security/sanitize-filename";
import { ensurePathSafety } from "@/lib/security/path-safety";
import { buildDescriptor } from "@/lib/detection/file-detector";
import { ALL_ALLOWED_EXTENSIONS, FORMAT_BY_EXTENSION } from "@/lib/domain/format-catalog";
import type { UniversalFileAnalysis } from "@/lib/domain/unified-analysis";
import type { FileCategory } from "@/lib/domain/descriptors";
import path from "path";
import fs from "fs";
import crypto from "crypto";

const MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024 * 1024; // 2 GB

/** Extensions that route through the legacy ffprobe path */
const MEDIA_EXTENSIONS = new Set(["mp3", "m4a", "wav", "flac", "ogg", "aac", "mp4", "webm", "mkv", "avi", "mov", "wmv", "ts"]);

/** Analyze a remote YouTube URL or an uploaded file */
export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get("content-type") ?? "";

    if (contentType.includes("multipart/form-data")) {
      return handleFileUpload(req);
    }

    // JSON body: URL analysis (YouTube only — legacy path)
    const body = await req.json();
    const rawUrl: unknown = body?.url;
    if (typeof rawUrl !== "string" || !rawUrl.trim()) {
      return NextResponse.json({ error: "Falta el campo 'url'.", code: "INVALID_INPUT" }, { status: 400 });
    }

    const normalizedUrl = normalizeYoutubeUrl(rawUrl.trim());
    if (!normalizedUrl) {
      return NextResponse.json(
        { error: "URL no válida o no soportada. Usa enlaces de YouTube.", code: "UNSUPPORTED_URL" },
        { status: 400 }
      );
    }

    const meta = await getVideoMetadata(normalizedUrl);

    const descriptor: MediaDescriptor = {
      container: null,
      durationSeconds: meta.durationSeconds,
      sizeBytes: null,
      bitrate: null,
      hasAudio: true,
      hasVideo: meta.availableHeights.length > 0,
      hasSubtitles: false,
      audioStreams: [{ index: 0, codec: "aac", sampleRate: 44100, channels: 2, channelLayout: "stereo", bitrate: null, language: null, isDefault: true }],
      videoStreams: meta.availableHeights.map((h, i) => ({
        index: i,
        codec: "h264",
        width: null,
        height: h,
        fps: null,
        bitrate: null,
        pixelFormat: null,
        isDefault: i === 0,
      })),
      subtitleStreams: [],
    };

    return NextResponse.json({
      kind: "remote-url",
      provider: "youtube",
      title: meta.title,
      channel: meta.channel,
      thumbnailUrl: meta.thumbnailUrl,
      normalizedUrl,
      descriptor,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Error interno.";
    return NextResponse.json({ error: msg, code: "ANALYSIS_FAILED" }, { status: 500 });
  }
}

async function handleFileUpload(req: NextRequest): Promise<NextResponse> {
  const formData = await req.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return NextResponse.json({ error: "No se ha enviado ningún archivo.", code: "INVALID_INPUT" }, { status: 400 });
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    return NextResponse.json(
      { error: `El archivo supera el límite de ${MAX_FILE_SIZE_BYTES / 1024 ** 3} GB.`, code: "FILE_TOO_LARGE" },
      { status: 413 }
    );
  }

  const originalName = file.name;
  const ext = originalName.split(".").pop()?.toLowerCase() ?? "";

  // Use the format catalog as the single source of truth for allowed extensions
  if (!ALL_ALLOWED_EXTENSIONS.has(ext)) {
    return NextResponse.json(
      { error: `Formato no soportado: .${ext}`, code: "UNSUPPORTED_INPUT" },
      { status: 415 }
    );
  }

  const uploadId = crypto.randomBytes(16).toString("hex");
  const safeBase = sanitizeFilename(originalName.replace(/\.[^.]+$/, ""));
  const safeFileName = `${safeBase}.${ext}`;
  const uploadDir = path.join(CONFIG.media.tempDir, "uploads", uploadId);
  fs.mkdirSync(uploadDir, { recursive: true });

  const storedPath = path.join(uploadDir, safeFileName);
  ensurePathSafety(storedPath);

  const bytes = await file.arrayBuffer();
  fs.writeFileSync(storedPath, Buffer.from(bytes));

  // Route to appropriate analyzer: media extensions go through ffprobe,
  // all others (universal) go through the file-detector
  const formatDef = FORMAT_BY_EXTENSION.get(ext);
  const isMedia = formatDef?.category === "audio" || formatDef?.category === "video" || MEDIA_EXTENSIONS.has(ext);

  if (isMedia) {
    return handleMediaFile(storedPath, originalName, uploadId, file.size);
  }
  return handleUniversalFile(storedPath, originalName, uploadId, file.size, ext);
}

async function handleMediaFile(storedPath: string, originalName: string, uploadId: string, sizeBytes: number): Promise<NextResponse> {
  const descriptor = await probeFile(storedPath);
  if (!descriptor) {
    fs.rmSync(path.dirname(storedPath), { recursive: true, force: true });
    return NextResponse.json(
      { error: "No se pudo analizar el archivo. Puede estar corrupto o no ser un archivo multimedia válido.", code: "ANALYSIS_FAILED" },
      { status: 422 }
    );
  }

  const relPath = path.relative(CONFIG.media.tempDir, storedPath);
  return NextResponse.json({
    kind: "local-media",
    inputId: uploadId,
    originalName,
    storedRelativePath: relPath,
    sizeBytes,
    descriptor,
  });
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function handleUniversalFile(storedPath: string, originalName: string, uploadId: string, sizeBytes: number, _ext: string): Promise<NextResponse> {
  try {
    const relPath = path.relative(CONFIG.media.tempDir, storedPath);
    const universalDescriptor = await buildDescriptor(
      storedPath,
      { kind: "local-upload", originalName, storedRelativePath: relPath },
      uploadId
    );

    // Persist input metadata to the inputs table
    persistInputMetadata(uploadId, universalDescriptor, relPath);

    // Build a proper UniversalFileAnalysis response
    const analysis: UniversalFileAnalysis = {
      kind: "universal-file",
      inputId: uploadId,
      originalName,
      storedRelativePath: relPath,
      sizeBytes,
      descriptor: universalDescriptor.attributes,
      category: universalDescriptor.category as FileCategory,
      detectedFormat: universalDescriptor.detectedFormat,
      confidence: deriveConfidenceFromDescriptor(universalDescriptor),
      warnings: universalDescriptor.warnings.map((w) => ({
        code: w.code,
        message: w.message,
        severity: w.severity as "info" | "warning" | "danger",
      })),
      detectedMimeType: universalDescriptor.detectedMimeType,
      sha256: universalDescriptor.sha256,
    };

    return NextResponse.json({
      ...analysis,
      // Also include the full descriptor for capabilities lookup
      universalDescriptor,
    });
  } catch (error: unknown) {
    fs.rmSync(path.dirname(storedPath), { recursive: true, force: true });
    const msg = error instanceof Error ? error.message : "Error al analizar el archivo.";
    return NextResponse.json({ error: msg, code: "ANALYSIS_FAILED" }, { status: 422 });
  }
}

/**
 * Persist input metadata to the inputs table for stable reference.
 */
function persistInputMetadata(
  inputId: string,
  descriptor: import("@/lib/domain/descriptors").UniversalFileDescriptor,
  storedRelativePath: string
): void {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getDb } = require("@/lib/infrastructure/db/database") as { getDb: () => import("better-sqlite3").Database };
    const db = getDb();
    const ttlMinutes = CONFIG.media.limits.jobTtlMinutes;
    const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000).toISOString();

    db.prepare(`
      INSERT OR IGNORE INTO inputs (
        id, original_name, extension, detected_mime_type, detected_format,
        category, size_bytes, sha256, stored_relative_path,
        attributes_json, warnings_json, analyzed_by, analyzed_at,
        expires_at, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')
    `).run(
      inputId,
      descriptor.originalName,
      descriptor.extension ?? null,
      descriptor.detectedMimeType ?? null,
      descriptor.detectedFormat ?? null,
      descriptor.category,
      descriptor.sizeBytes,
      descriptor.sha256 ?? null,
      storedRelativePath,
      JSON.stringify(descriptor.attributes),
      JSON.stringify(descriptor.warnings),
      descriptor.analyzedBy.join(","),
      descriptor.analyzedAt,
      expiresAt
    );
  } catch (err) {
    // Non-fatal: the input is still available via the uploads directory
    console.warn("[analyze] Failed to persist input metadata:", err);
  }
}

/**
 * Derive confidence from the descriptor's detection results.
 */
function deriveConfidenceFromDescriptor(
  descriptor: import("@/lib/domain/descriptors").UniversalFileDescriptor
): "high" | "medium" | "low" {
  const hasMagicDetection = descriptor.analyzedBy.includes("file-detector") && descriptor.detectedMimeType !== null;
  const extensionMatch = descriptor.extension !== null &&
    descriptor.detectedFormat === descriptor.extension;
  const hasMismatch = descriptor.warnings.some(
    (w) => w.code === "MIME_EXTENSION_MISMATCH"
  );

  if (hasMagicDetection && extensionMatch && !hasMismatch) return "high";
  if (hasMagicDetection || extensionMatch) return "medium";
  return "low";
}
