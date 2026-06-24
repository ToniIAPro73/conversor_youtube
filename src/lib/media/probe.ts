import { spawn } from "child_process";
import fs from "fs";
import { CONFIG } from "../config";
import { createAppError } from "../errors/error-codes";

// --- Legacy simple verifyFile (kept for backwards compat) ---

export interface VerificationResult {
  isValid: boolean;
  hasAudio: boolean;
  hasVideo: boolean;
}

export async function verifyFile(
  filePath: string,
  format: "mp3" | "mp4"
): Promise<VerificationResult> {
  const result = await probeFile(filePath);
  if (!result) return { isValid: false, hasAudio: false, hasVideo: false };

  const hasAudio = result.audioStreams.length > 0;
  const hasVideo = result.videoStreams.length > 0;

  const isValid = format === "mp3" ? hasAudio : hasAudio || hasVideo;
  return { isValid, hasAudio, hasVideo };
}

// --- Full media analysis ---

export interface AudioStreamInfo {
  index: number;
  codec: string;
  sampleRate: number | null;
  channels: number | null;
  channelLayout: string | null;
  bitrate: number | null;
  language: string | null;
  isDefault: boolean;
}

export interface VideoStreamInfo {
  index: number;
  codec: string;
  width: number | null;
  height: number | null;
  fps: number | null;
  bitrate: number | null;
  pixelFormat: string | null;
  isDefault: boolean;
}

export interface SubtitleStreamInfo {
  index: number;
  codec: string;
  language: string | null;
  isDefault: boolean;
  isForced: boolean;
}

export interface MediaDescriptor {
  container: string | null;
  durationSeconds: number | null;
  sizeBytes: number | null;
  bitrate: number | null;
  hasAudio: boolean;
  hasVideo: boolean;
  hasSubtitles: boolean;
  audioStreams: AudioStreamInfo[];
  videoStreams: VideoStreamInfo[];
  subtitleStreams: SubtitleStreamInfo[];
}

interface FfprobeStream {
  index: number;
  codec_type: string;
  codec_name: string;
  sample_rate?: string;
  channels?: number;
  channel_layout?: string;
  bit_rate?: string;
  tags?: Record<string, string>;
  disposition?: { default?: number; forced?: number };
  width?: number;
  height?: number;
  r_frame_rate?: string;
  pix_fmt?: string;
}

interface FfprobeFormat {
  format_name?: string;
  duration?: string;
  size?: string;
  bit_rate?: string;
}

interface FfprobeOutput {
  streams: FfprobeStream[];
  format: FfprobeFormat;
}

export async function probeFile(filePath: string): Promise<MediaDescriptor | null> {
  return new Promise((resolve) => {
    const args = [
      "-v", "error",
      "-show_format",
      "-show_streams",
      "-print_format", "json",
      filePath,
    ];

    const proc = spawn(CONFIG.media.binaries.ffprobe, args, {
      shell: false,
      windowsHide: true,
    });

    let stdout = "";
    let stderr = "";
    const MAX_OUTPUT = 2 * 1024 * 1024;

    proc.stdout.on("data", (d: Buffer) => {
      if (stdout.length < MAX_OUTPUT) stdout += d.toString();
    });
    proc.stderr.on("data", (d: Buffer) => {
      stderr += d.toString().slice(0, 4096);
    });

    const timeout = setTimeout(() => {
      proc.kill("SIGKILL");
      resolve(null);
    }, 30_000);

    proc.on("close", (code) => {
      clearTimeout(timeout);
      if (code !== 0) {
        console.error("[probe] ffprobe error:", stderr.slice(0, 500));
        resolve(null);
        return;
      }

      try {
        const data = JSON.parse(stdout) as FfprobeOutput;
        resolve(parseProbeOutput(data));
      } catch {
        resolve(null);
      }
    });

    proc.on("error", () => {
      clearTimeout(timeout);
      resolve(null);
    });
  });
}

function parseProbeOutput(data: FfprobeOutput): MediaDescriptor {
  const audioStreams: AudioStreamInfo[] = [];
  const videoStreams: VideoStreamInfo[] = [];
  const subtitleStreams: SubtitleStreamInfo[] = [];

  for (const s of data.streams ?? []) {
    if (s.codec_type === "audio") {
      audioStreams.push({
        index: s.index,
        codec: s.codec_name,
        sampleRate: s.sample_rate ? parseInt(s.sample_rate, 10) : null,
        channels: s.channels ?? null,
        channelLayout: s.channel_layout ?? null,
        bitrate: s.bit_rate ? parseInt(s.bit_rate, 10) : null,
        language: s.tags?.language ?? null,
        isDefault: s.disposition?.default === 1,
      });
    } else if (s.codec_type === "video") {
      videoStreams.push({
        index: s.index,
        codec: s.codec_name,
        width: s.width ?? null,
        height: s.height ?? null,
        fps: parseFps(s.r_frame_rate),
        bitrate: s.bit_rate ? parseInt(s.bit_rate, 10) : null,
        pixelFormat: s.pix_fmt ?? null,
        isDefault: s.disposition?.default === 1,
      });
    } else if (s.codec_type === "subtitle") {
      subtitleStreams.push({
        index: s.index,
        codec: s.codec_name,
        language: s.tags?.language ?? null,
        isDefault: s.disposition?.default === 1,
        isForced: s.disposition?.forced === 1,
      });
    }
  }

  const fmt = data.format ?? {};
  return {
    container: fmt.format_name?.split(",")[0] ?? null,
    durationSeconds: fmt.duration ? parseFloat(fmt.duration) : null,
    sizeBytes: fmt.size ? parseInt(fmt.size, 10) : null,
    bitrate: fmt.bit_rate ? parseInt(fmt.bit_rate, 10) : null,
    hasAudio: audioStreams.length > 0,
    hasVideo: videoStreams.length > 0,
    hasSubtitles: subtitleStreams.length > 0,
    audioStreams,
    videoStreams,
    subtitleStreams,
  };
}

function parseFps(rational: string | undefined): number | null {
  if (!rational) return null;
  const parts = rational.split("/");
  if (parts.length !== 2) return null;
  const num = parseFloat(parts[0]);
  const den = parseFloat(parts[1]);
  if (!den || den === 0) return null;
  return Math.round((num / den) * 100) / 100;
}

// --- probeOutputFile: structured probe for post-conversion quality verification ---

export interface ProbeResult {
  width: number | null;
  height: number | null;
  fps: number | null;
  videoCodec: string | null;
  audioCodec: string | null;
  container: string | null;
  durationSeconds: number | null;
  fileSizeBytes: number;
}

/**
 * Runs ffprobe on a completed output file and returns structured media metadata.
 *
 * @throws AppError(DEPENDENCY_MISSING) if ffprobeBinary is not found (ENOENT)
 * @throws AppError(ARTIFACT_VALIDATION_FAILED) if the file does not exist
 * @throws AppError(INTERNAL_ERROR) if ffprobe output is not valid JSON
 */
export async function probeOutputFile(
  filePath: string,
  ffprobeBinary: string
): Promise<ProbeResult> {
  if (!fs.existsSync(filePath)) {
    throw createAppError(
      "ARTIFACT_VALIDATION_FAILED",
      `El archivo de salida no existe: ${filePath}`,
      { stage: "probe" }
    );
  }

  return new Promise((resolve, reject) => {
    const args = [
      "-v", "quiet",
      "-print_format", "json",
      "-show_streams",
      "-show_format",
      filePath,
    ];

    const proc = spawn(ffprobeBinary, args, {
      shell: false,
      windowsHide: true,
    });

    let stdout = "";
    let stderr = "";
    const MAX_OUTPUT = 2 * 1024 * 1024;

    proc.stdout.on("data", (d: Buffer) => {
      if (stdout.length < MAX_OUTPUT) stdout += d.toString();
    });
    proc.stderr.on("data", (d: Buffer) => {
      stderr += d.toString().slice(0, 4096);
    });

    const timeout = setTimeout(() => {
      proc.kill("SIGKILL");
      reject(
        createAppError(
          "PROCESS_TIMEOUT",
          "ffprobe tardó demasiado al analizar el archivo de salida.",
          { stage: "probe" }
        )
      );
    }, 30_000);

    proc.on("close", (code) => {
      clearTimeout(timeout);
      if (code !== 0) {
        console.error("[probeOutputFile] ffprobe error:", stderr.slice(0, 500));
        reject(
          createAppError(
            "ARTIFACT_VALIDATION_FAILED",
            `ffprobe devolvió código ${code} al analizar el archivo de salida.`,
            { stage: "probe" }
          )
        );
        return;
      }

      try {
        const data = JSON.parse(stdout) as FfprobeOutput;
        const stats = fs.statSync(filePath);

        let videoCodec: string | null = null;
        let audioCodec: string | null = null;
        let width: number | null = null;
        let height: number | null = null;
        let fps: number | null = null;

        for (const s of data.streams ?? []) {
          if (s.codec_type === "video" && videoCodec === null) {
            videoCodec = s.codec_name ?? null;
            width = s.width ?? null;
            height = s.height ?? null;
            fps = parseFps(s.r_frame_rate);
          } else if (s.codec_type === "audio" && audioCodec === null) {
            audioCodec = s.codec_name ?? null;
          }
        }

        const fmt = data.format ?? {};
        resolve({
          width,
          height,
          fps,
          videoCodec,
          audioCodec,
          container: fmt.format_name?.split(",")[0] ?? null,
          durationSeconds: fmt.duration ? parseFloat(fmt.duration) : null,
          fileSizeBytes: stats.size,
        });
      } catch {
        reject(
          createAppError(
            "ENGINE_EXECUTE_FAILED",
            "La salida de ffprobe no es JSON válido.",
            { stage: "probe" }
          )
        );
      }
    });

    proc.on("error", (err: NodeJS.ErrnoException) => {
      clearTimeout(timeout);
      if (err.code === "ENOENT") {
        reject(
          createAppError(
            "DEPENDENCY_MISSING",
            `ffprobe no encontrado en: ${ffprobeBinary}`,
            { stage: "probe" }
          )
        );
      } else {
        reject(
          createAppError(
            "ENGINE_EXECUTE_FAILED",
            `Error al ejecutar ffprobe: ${err.message}`,
            { stage: "probe", cause: err }
          )
        );
      }
    });
  });
}
