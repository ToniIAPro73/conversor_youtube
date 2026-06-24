import { spawn } from "child_process";
import path from "path";
import fs from "fs";
import { CONFIG } from "../config";
import { jobManager } from "../jobs/job-manager";
import { buildYtdlpArgs, buildFfmpegAudioArgs, buildFfmpegVideoArgs } from "./command-builder";
import { parseProgress } from "./progress-parser";
import { verifyFile, probeOutputFile } from "./probe";
import { sanitizeFilename } from "../security/sanitize-filename";
import { parseLegacyQualityString, VideoQualitySelection } from "../quality/quality-contract";
import { getVideoMetadata } from "./metadata";
import { AudioOutputFormat, VideoOutputFormat } from "../jobs/job-types";
import { createAppError, type ErrorCode } from "../errors/error-codes";
import { checkDiskSpace } from "../jobs/disk-space-check";
import crypto from "crypto";

const AUDIO_FORMATS: AudioOutputFormat[] = ["mp3", "m4a", "wav", "flac", "ogg"];
const VIDEO_FORMATS: VideoOutputFormat[] = ["mp4", "webm", "mkv"];
const IMAGE_OUTPUT_FORMATS = ["gif", "jpg", "jpeg", "png"] as const;

function getMimeType(format: string): string {
  const map: Record<string, string> = {
    mp3: "audio/mpeg",
    m4a: "audio/mp4",
    wav: "audio/wav",
    flac: "audio/flac",
    ogg: "audio/ogg",
    mp4: "video/mp4",
    webm: "video/webm",
    mkv: "video/x-matroska",
    gif: "image/gif",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
  };
  return map[format] ?? "application/octet-stream";
}

export async function processJob(jobId: string) {
  const job = jobManager.getJob(jobId);
  if (!job) return;

  const outputFormat = job.output_format;
  const isAudio = AUDIO_FORMATS.includes(outputFormat as AudioOutputFormat);
  const isVideo = VIDEO_FORMATS.includes(outputFormat as VideoOutputFormat);
  const isImageOutput = IMAGE_OUTPUT_FORMATS.includes(outputFormat as (typeof IMAGE_OUTPUT_FORMATS)[number]);
  const extension = `.${outputFormat}`;

  const jobDir = path.join(CONFIG.media.tempDir, jobId);
  if (!fs.existsSync(jobDir)) {
    fs.mkdirSync(jobDir, { recursive: true });
  }

  const outputPath = path.join(jobDir, `output${extension}`);

  try {
    // Check disk space before processing
    const estimatedRequired = 100 * 1024 * 1024; // 100 MB estimate for media conversion
    const diskCheck = await checkDiskSpace(estimatedRequired, CONFIG.media.tempDir);
    if (!diskCheck.sufficient) {
      const err = createAppError("INSUFFICIENT_DISK_SPACE", diskCheck.message, { stage: "pre-processing" });
      jobManager.updateJob(jobId, {
        status: "failed",
        error_code: err.code,
        error_message: diskCheck.message,
        stage: "Error",
      });
      return;
    }

    if (job.input_kind === "remote-url") {
      await processRemoteUrl(jobId, job.input_reference, outputFormat, job.quality, outputPath);
    } else if (job.input_kind === "local-file") {
      const inputPath = path.join(CONFIG.media.tempDir, job.input_reference);
      if (isAudio) {
        await processLocalAudio(jobId, inputPath, outputFormat as AudioOutputFormat, job.quality, outputPath);
      } else if (isVideo) {
        await processLocalVideo(jobId, inputPath, outputFormat as VideoOutputFormat, job.quality, outputPath);
      } else if (outputFormat === "gif") {
        await processLocalGif(jobId, inputPath, job.quality, outputPath);
      } else if (outputFormat === "jpg" || outputFormat === "jpeg" || outputFormat === "png") {
        await processLocalThumbnail(jobId, inputPath, outputFormat, outputPath);
      } else {
        const err = createAppError("INPUT_UNSUPPORTED", `Formato no soportado: ${outputFormat}`, { stage: "pre-processing" });
        jobManager.updateJob(jobId, {
          status: "failed",
          error_code: err.code,
          error_message: err.message,
          stage: "Error",
        });
        return;
      }
    } else {
      const err = createAppError("INPUT_UNSUPPORTED", "Tipo de entrada no soportado.", { stage: "pre-processing" });
      jobManager.updateJob(jobId, {
        status: "failed",
        error_code: err.code,
        error_message: err.message,
        stage: "Error",
      });
      return;
    }

    // Verify output
    jobManager.updateJob(jobId, {
      status: "verifying",
      stage: "Verificando archivo",
      progress: 95,
    });

    const stats = fs.statSync(outputPath);
    const verification = isImageOutput
      ? verifyImageOutput(outputPath, outputFormat)
      : await verifyFile(outputPath, isAudio ? "mp3" : "mp4");

    if (!verification.isValid) {
      const err = createAppError("ARTIFACT_VALIDATION_FAILED", "La verificación del archivo ha fallado.", {
        stage: "validation",
      });
      jobManager.updateJob(jobId, {
        status: "failed",
        error_code: err.code,
        error_message: err.message,
        stage: "Error",
      });
      return;
    }

    const token = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");

    // Compute safe relative path for the output
    const relOutputPath = path.relative(CONFIG.media.tempDir, outputPath);

    // Retrieve title for filename
    const currentJob = jobManager.getJob(jobId);
    const titleBase = currentJob?.input_title
      ? sanitizeFilename(currentJob.input_title)
      : `output_${jobId.substring(0, 8)}`;
    const finalFileName = `${titleBase}${extension}`;

    jobManager.updateJob(jobId, {
      status: "completed",
      stage: "Completado",
      progress: 100,
      file_size_bytes: stats.size,
      mime_type: getMimeType(outputFormat),
      download_token_hash: tokenHash,
      output_file_name: finalFileName,
      output_relative_path: relOutputPath,
      completed_at: new Date().toISOString(),
    });
  } catch (error: unknown) {
    const appError = error as { code?: ErrorCode; message?: string };
    const code: ErrorCode = appError?.code ?? "ENGINE_EXECUTE_FAILED";
    const message =
      error instanceof Error ? error.message : "Error interno del procesador.";
    jobManager.updateJob(jobId, {
      status: "failed",
      error_code: code,
      error_message: message,
      stage: "Error",
    });
  }
}

async function processRemoteUrl(
  jobId: string,
  inputReference: string,
  outputFormat: string,
  quality: string,
  outputPath: string
): Promise<void> {
  // inputReference is the full URL or videoId
  const url = inputReference.startsWith("http")
    ? inputReference
    : `https://www.youtube.com/watch?v=${inputReference}`;

  const metadata = await getVideoMetadata(url);

  jobManager.updateJob(jobId, {
    status: "downloading",
    stage: "Descargando y convirtiendo",
    started_at: new Date().toISOString(),
  });

  // Update job title if not set
  const currentJob = jobManager.getJob(jobId);
  if (!currentJob?.input_title && metadata.title) {
    jobManager.updateJob(jobId, {
      output_file_name: sanitizeFilename(metadata.title) + `.${outputFormat}`,
    });
  }

  const args = buildYtdlpArgs({
    url,
    format: outputFormat as AudioOutputFormat | VideoOutputFormat,
    quality,
    outputPath,
    ffmpegLocation: path.dirname(CONFIG.media.binaries.ffmpeg),
  });

  await runProcess(CONFIG.media.binaries.ytdlp, args, jobId);

  // Probe output for quality verification (video jobs only)
  const isVideoOutputFormat = ["mp4", "webm", "mkv"].includes(outputFormat);
  if (isVideoOutputFormat) {
    try {
      const probe = await probeOutputFile(outputPath, CONFIG.media.binaries.ffprobe);

      // Determine requested quality selection
      let requestedSelection: VideoQualitySelection | null = null;
      try {
        requestedSelection =
          typeof quality === "string"
            ? parseLegacyQualityString(quality, outputFormat)
            : (quality as VideoQualitySelection);
      } catch {
        // Audio bitrate string or uninterpretable quality — skip quality check
        requestedSelection = null;
      }

      if (
        requestedSelection !== null &&
        requestedSelection.resolutionLimit !== "max" &&
        requestedSelection.fallbackPolicy === "reject" &&
        probe.height !== null &&
        typeof requestedSelection.resolutionLimit === "number" &&
        probe.height < requestedSelection.resolutionLimit * 0.9
      ) {
        jobManager.updateJob(jobId, {
          status: "failed",
          error_code: "QUALITY_NOT_DELIVERED",
          error_message: `Resolución entregada (${probe.height}p) inferior a la solicitada (${requestedSelection.resolutionLimit}p). El vídeo puede no tener ese formato disponible.`,
          stage: "Error",
        });
        return;
      }

      // Log probe results for diagnostics
      console.info(
        `[probe] jobId=${jobId} height=${probe.height} fps=${probe.fps} videoCodec=${probe.videoCodec} audioCodec=${probe.audioCodec} container=${probe.container} duration=${probe.durationSeconds}s size=${probe.fileSizeBytes}B`
      );
    } catch (probeErr) {
      // Non-fatal: probe failure should not block a completed download
      console.warn("[probe] probeOutputFile failed (non-fatal):", probeErr);
    }
  }
}

async function processLocalAudio(
  jobId: string,
  inputPath: string,
  format: AudioOutputFormat,
  quality: string,
  outputPath: string
): Promise<void> {
  jobManager.updateJob(jobId, {
    status: "processing",
    stage: "Convirtiendo audio",
    started_at: new Date().toISOString(),
  });

  const args = buildFfmpegAudioArgs({ inputPath, outputPath, format, quality });
  await runProcess(CONFIG.media.binaries.ffmpeg, args, jobId);
}

async function processLocalVideo(
  jobId: string,
  inputPath: string,
  format: VideoOutputFormat,
  quality: string,
  outputPath: string
): Promise<void> {
  jobManager.updateJob(jobId, {
    status: "processing",
    stage: "Convirtiendo vídeo",
    started_at: new Date().toISOString(),
  });

  const args = buildFfmpegVideoArgs({ inputPath, outputPath, format, quality });
  await runProcess(CONFIG.media.binaries.ffmpeg, args, jobId);
}

async function processLocalGif(
  jobId: string,
  inputPath: string,
  quality: string,
  outputPath: string
): Promise<void> {
  jobManager.updateJob(jobId, {
    status: "processing",
    stage: "Creando GIF",
    started_at: new Date().toISOString(),
  });

  const width = Number.parseInt(quality, 10);
  const scaleWidth = Number.isFinite(width) && width > 0 ? width : 480;
  const args = [
    "-y",
    "-i", inputPath,
    "-t", "10",
    "-vf", `fps=10,scale=${scaleWidth}:-1:flags=lanczos`,
    "-loop", "0",
    outputPath,
  ];
  await runProcess(CONFIG.media.binaries.ffmpeg, args, jobId);
}

async function processLocalThumbnail(
  jobId: string,
  inputPath: string,
  format: string,
  outputPath: string
): Promise<void> {
  jobManager.updateJob(jobId, {
    status: "processing",
    stage: "Extrayendo miniatura",
    started_at: new Date().toISOString(),
  });

  const codecArgs = format === "png" ? ["-frames:v", "1"] : ["-frames:v", "1", "-q:v", "2"];
  const args = ["-y", "-ss", "0", "-i", inputPath, ...codecArgs, outputPath];
  await runProcess(CONFIG.media.binaries.ffmpeg, args, jobId);
}

function verifyImageOutput(outputPath: string, outputFormat: string): { isValid: boolean; reason?: string } {
  const bytes = fs.readFileSync(outputPath);
  if (bytes.length === 0) return { isValid: false, reason: "empty output" };
  if (outputFormat === "gif") {
    return { isValid: bytes.subarray(0, 3).toString("ascii") === "GIF" };
  }
  if (outputFormat === "jpg" || outputFormat === "jpeg") {
    return { isValid: bytes[0] === 0xff && bytes[1] === 0xd8 };
  }
  if (outputFormat === "png") {
    return { isValid: bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) };
  }
  return { isValid: false, reason: `unsupported image output ${outputFormat}` };
}

function runProcess(
  binary: string,
  args: string[],
  jobId: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(binary, args, {
      shell: false,
      windowsHide: true,
      timeout: CONFIG.media.limits.conversionTimeoutSeconds * 1000,
    });

    proc.stdout.on("data", (data: Buffer) => {
      const line = data.toString();
      const progress = parseProgress(line);
      if (progress !== null) {
        jobManager.updateJob(jobId, { progress: Math.min(progress, 90) });
      }
    });

    // ffmpeg outputs to stderr
    proc.stderr.on("data", (data: Buffer) => {
      const line = data.toString();
      const progress = parseProgress(line);
      if (progress !== null) {
        jobManager.updateJob(jobId, { progress: Math.min(progress, 90) });
      }
    });

    proc.on("close", (code: number | null) => {
      if (code !== 0) {
        const err = createAppError("ENGINE_EXECUTE_FAILED", `Proceso finalizado con código ${code}`, {
          stage: "execution",
        });
        reject(err);
        return;
      }
      resolve();
    });

    proc.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "ENOENT") {
        reject(createAppError("TOOL_NOT_AVAILABLE", "Dependencia no encontrada. Comprueba que yt-dlp y ffmpeg están disponibles.", {
          stage: "execution",
        }));
      } else {
        reject(createAppError("ENGINE_EXECUTE_FAILED", err.message, {
          stage: "execution",
          cause: err,
        }));
      }
    });
  });
}
