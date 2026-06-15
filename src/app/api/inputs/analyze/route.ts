import { NextRequest, NextResponse } from "next/server";
import { probeFile, MediaDescriptor } from "@/lib/media/probe";
import { getVideoMetadata } from "@/lib/media/metadata";
import { normalizeYoutubeUrl } from "@/lib/youtube/normalize-url";
import { CONFIG } from "@/lib/config";
import { sanitizeFilename } from "@/lib/security/sanitize-filename";
import { ensurePathSafety } from "@/lib/security/path-safety";
import path from "path";
import fs from "fs";
import crypto from "crypto";

const MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024 * 1024; // 2 GB
const ALLOWED_EXTENSIONS = new Set([
  "mp3", "m4a", "wav", "flac", "ogg", "aac",
  "mp4", "webm", "mkv", "avi", "mov", "wmv", "ts",
]);

/** Analyze a remote YouTube URL */
export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get("content-type") ?? "";

    if (contentType.includes("multipart/form-data")) {
      return handleFileUpload(req);
    }

    // JSON body: URL analysis
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
      { error: `El archivo supera el límite de ${MAX_FILE_SIZE_BYTES / (1024 ** 3)} GB.`, code: "FILE_TOO_LARGE" },
      { status: 413 }
    );
  }

  const originalName = file.name;
  const ext = originalName.split(".").pop()?.toLowerCase() ?? "";
  if (!ALLOWED_EXTENSIONS.has(ext)) {
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

  const descriptor = await probeFile(storedPath);
  if (!descriptor) {
    fs.rmSync(uploadDir, { recursive: true, force: true });
    return NextResponse.json(
      { error: "No se pudo analizar el archivo. Puede estar corrupto o no ser un archivo multimedia válido.", code: "ANALYSIS_FAILED" },
      { status: 422 }
    );
  }

  // Relative path for use in subsequent job creation
  const relPath = path.relative(CONFIG.media.tempDir, storedPath);

  return NextResponse.json({
    kind: "local-file",
    uploadId,
    originalName: originalName,
    storedRelativePath: relPath,
    sizeBytes: file.size,
    descriptor,
  });
}
