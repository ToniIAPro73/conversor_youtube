// FFmpeg media conversion engine.
// Handles: audio cross-conversion (MP3, M4A, WAV, FLAC, OGG), video conversion (MP4, WebM, MKV),
// extract audio from video, normalize audio (loudnorm), trim/cut, extract thumbnails/frames,
// extract subtitles, GIF creation.
// Binary discovery: PATH → graceful degradation.
// Security: shell:false, path safety validation, no user-supplied filter strings.

import fs from "fs";
import path from "path";
import type { ConversionEngine, EngineId, EngineProbeResult, ConversionCapability, ConversionPlan, ExecutionResult, ArtifactValidation } from "../../domain/engines";
import type { UniversalFileDescriptor, MediaAttributes, LossProfile } from "../../domain/descriptors";
import { ProcessRunner } from "../../infrastructure/processes/process-runner";
import { ensurePathSafety } from "../../security/path-safety";
import { CONFIG } from "../../config";

const ENGINE_ID: EngineId = "ffmpeg-media";

// ── Format definitions ───────────────────────────────────────────────────────

type AudioFormat = "mp3" | "m4a" | "wav" | "flac" | "ogg";
type VideoFormat = "mp4" | "webm" | "mkv";

interface FormatDef {
  label: string;
  mime: string;
  ext: string;
  lossProfile: LossProfile;
}

const AUDIO_FORMATS: Record<AudioFormat, FormatDef> = {
  mp3:  { label: "MP3",  mime: "audio/mpeg", ext: "mp3",  lossProfile: "lossy" },
  m4a:  { label: "M4A",  mime: "audio/mp4",  ext: "m4a",  lossProfile: "lossy" },
  wav:  { label: "WAV",  mime: "audio/wav",  ext: "wav",  lossProfile: "lossless" },
  flac: { label: "FLAC", mime: "audio/flac", ext: "flac", lossProfile: "lossless" },
  ogg:  { label: "OGG",  mime: "audio/ogg",  ext: "ogg",  lossProfile: "lossy" },
};

const VIDEO_FORMATS: Record<VideoFormat, FormatDef> = {
  mp4:  { label: "MP4",  mime: "video/mp4",           ext: "mp4",  lossProfile: "lossy" },
  webm: { label: "WebM", mime: "video/webm",          ext: "webm", lossProfile: "lossy" },
  mkv:  { label: "MKV",  mime: "video/x-matroska",    ext: "mkv",  lossProfile: "lossy" },
};

const AUDIO_PRESETS: Record<AudioFormat, import("../../domain/engines").ConversionPreset[]> = {
  mp3: [
    { id: "mp3-voice", label: "Voz / Podcast", quality: "96", description: "96 kbps — tamaño reducido, bueno para voz" },
    { id: "mp3-balanced", label: "Compartir (recomendado)", quality: "192", description: "192 kbps — equilibrio calidad/tamaño", isRecommended: true },
    { id: "mp3-high", label: "Alta calidad", quality: "320", description: "320 kbps — máxima calidad MP3" },
  ],
  m4a: [
    { id: "m4a-balanced", label: "Equilibrado", quality: "128", description: "128 kbps AAC — compatible con Apple", isRecommended: true },
    { id: "m4a-high", label: "Alta calidad", quality: "256", description: "256 kbps AAC — buena calidad con tamaño moderado" },
  ],
  wav: [
    { id: "wav-standard", label: "WAV estándar", quality: "0", description: "Sin compresión — ideal para edición", isRecommended: true },
  ],
  flac: [
    { id: "flac-lossless", label: "Sin pérdida", quality: "0", description: "Compresión sin pérdida — archivado de máxima calidad", isRecommended: true },
  ],
  ogg: [
    { id: "ogg-balanced", label: "Equilibrado", quality: "4", description: "Calidad OGG q4 — buena relación calidad/tamaño", isRecommended: true },
    { id: "ogg-high", label: "Alta calidad", quality: "8", description: "Calidad OGG q8 — máxima calidad Vorbis" },
  ],
};

const VIDEO_PRESETS: Record<VideoFormat, import("../../domain/engines").ConversionPreset[]> = {
  mp4: [
    { id: "mp4-480p", label: "Web ligero (480p)", quality: "480", description: "H.264 480p — compatible y ligero" },
    { id: "mp4-720p", label: "HD (720p)", quality: "720", description: "H.264 720p — buena calidad HD" },
    { id: "mp4-1080p", label: "Full HD (1080p) — recomendado", quality: "1080", description: "H.264 1080p — alta definición", isRecommended: true },
  ],
  webm: [
    { id: "webm-720p", label: "Web 720p", quality: "720", description: "VP9 720p — optimizado para web", isRecommended: true },
    { id: "webm-1080p", label: "Web 1080p", quality: "1080", description: "VP9 1080p — alta definición para web" },
  ],
  mkv: [
    { id: "mkv-copy", label: "Sin recodificar (rápido)", quality: "0", description: "Copia directa — sin pérdida de calidad, muy rápido", isRecommended: true },
  ],
};

// ── Loss profile helpers ─────────────────────────────────────────────────────

function getAudioLossProfile(outputFmt: AudioFormat): LossProfile {
  return AUDIO_FORMATS[outputFmt].lossProfile;
}

function getVideoLossProfile(operation: string, outputFmt: VideoFormat): LossProfile {
  // Remux (stream copy) is lossless; re-encode is lossy
  if (operation === "remux") return "lossless";
  if (operation === "create-gif") return "lossy";
  // MKV remux uses stream copy
  if (outputFmt === "mkv" && operation === "transcode-video") return "lossless";
  return "lossy";
}

// ── Input format resolution ──────────────────────────────────────────────────

function resolveAudioFormat(descriptor: UniversalFileDescriptor): AudioFormat | null {
  const ext = (descriptor.extension ?? "").toLowerCase();
  const fmt = (descriptor.detectedFormat ?? "").toLowerCase();
  if (ext in AUDIO_FORMATS) return ext as AudioFormat;
  if (fmt in AUDIO_FORMATS) return fmt as AudioFormat;
  return null;
}

function resolveVideoFormat(descriptor: UniversalFileDescriptor): VideoFormat | null {
  const ext = (descriptor.extension ?? "").toLowerCase();
  const fmt = (descriptor.detectedFormat ?? "").toLowerCase();
  if (ext in VIDEO_FORMATS) return ext as VideoFormat;
  if (fmt in VIDEO_FORMATS) return fmt as VideoFormat;
  return null;
}

// ── Capability builders ──────────────────────────────────────────────────────

function buildAudioConvertCapability(
  fromFmt: AudioFormat,
  toFmt: AudioFormat,
  descriptor: UniversalFileDescriptor,
  available: boolean,
): ConversionCapability {
  const toDef = AUDIO_FORMATS[toFmt];
  const isSameFormat = fromFmt === toFmt;
  const warnings: string[] = [];
  if (isSameFormat) warnings.push("El archivo ya está en este formato");

  return {
    id: `ffmpeg-convert-${descriptor.id}-${fromFmt}-${toFmt}`,
    operation: "transcode-audio",
    outputFormat: toDef.ext,
    outputMime: toDef.mime,
    label: `Convertir a ${toDef.label}`,
    description: `${AUDIO_FORMATS[fromFmt].label} → ${toDef.label}`,
    lossProfile: getAudioLossProfile(toFmt),
    state: available ? "available" : "unavailable-tool",
    unavailableReason: available ? undefined : "FFmpeg no está instalado. Instálalo para convertir audio.",
    recommended: toFmt === "mp3",
    presets: AUDIO_PRESETS[toFmt],
    warnings,
    engineId: ENGINE_ID,
    mobilePortability: "desktop-only",
  };
}

function buildNormalizeAudioCapability(
  fromFmt: AudioFormat,
  descriptor: UniversalFileDescriptor,
  available: boolean,
): ConversionCapability {
  return {
    id: `ffmpeg-normalize-${descriptor.id}-${fromFmt}-mp3`,
    operation: "normalize-audio",
    outputFormat: "mp3",
    outputMime: "audio/mpeg",
    label: "Normalizar audio",
    description: `Normalizar volumen (${AUDIO_FORMATS[fromFmt].label})`,
    lossProfile: "metadata-risk",
    state: available ? "available" : "unavailable-tool",
    unavailableReason: available ? undefined : "FFmpeg no está instalado.",
    recommended: false,
    presets: AUDIO_PRESETS.mp3,
    warnings: ["Puede aumentar el tiempo de procesamiento"],
    engineId: ENGINE_ID,
    mobilePortability: "desktop-only",
  };
}

function buildVideoConvertCapability(
  fromFmt: VideoFormat,
  toFmt: VideoFormat,
  descriptor: UniversalFileDescriptor,
  attrs: MediaAttributes,
  available: boolean,
): ConversionCapability {
  const toDef = VIDEO_FORMATS[toFmt];
  const operation = toFmt === "mkv" ? "remux" : "transcode-video";
  const isSameFormat = fromFmt === toFmt;
  const warnings: string[] = [];
  if (isSameFormat) warnings.push("El archivo ya está en este formato");

  // Filter presets to not exceed source resolution
  let presets = VIDEO_PRESETS[toFmt];
  if (attrs.height) {
    presets = presets.filter((p) => {
      const h = parseInt(p.quality, 10);
      return isNaN(h) || h === 0 || h <= attrs.height!;
    });
    if (presets.length === 0) presets = [VIDEO_PRESETS[toFmt][0]];
  }

  return {
    id: `ffmpeg-convert-${descriptor.id}-${fromFmt}-${toFmt}`,
    operation,
    outputFormat: toDef.ext,
    outputMime: toDef.mime,
    label: `Convertir a ${toDef.label}`,
    description: `${VIDEO_FORMATS[fromFmt].label} → ${toDef.label}`,
    lossProfile: getVideoLossProfile(operation, toFmt),
    state: available ? "available" : "unavailable-tool",
    unavailableReason: available ? undefined : "FFmpeg no está instalado. Instálalo para convertir vídeo.",
    recommended: toFmt === "mp4",
    presets,
    warnings,
    engineId: ENGINE_ID,
    mobilePortability: "desktop-only",
  };
}

function buildExtractAudioCapability(
  descriptor: UniversalFileDescriptor,
  available: boolean,
): ConversionCapability {
  return {
    id: `ffmpeg-extract-audio-${descriptor.id}`,
    operation: "extract-audio",
    outputFormat: "mp3",
    outputMime: "audio/mpeg",
    label: "Extraer audio",
    description: "Extrae solo el audio del vídeo",
    lossProfile: "lossless",
    state: available ? "available" : "unavailable-tool",
    unavailableReason: available ? undefined : "FFmpeg no está instalado.",
    recommended: false,
    presets: AUDIO_PRESETS.mp3,
    warnings: [],
    engineId: ENGINE_ID,
    mobilePortability: "desktop-only",
  };
}

function buildGifCapability(
  descriptor: UniversalFileDescriptor,
  attrs: MediaAttributes,
  available: boolean,
): ConversionCapability {
  const duration = attrs.durationSeconds;
  const gifEnabled = duration === null || duration <= 300;
  const warnings: string[] = [];
  if (gifEnabled && duration && duration > 60) {
    warnings.push("GIFs largos pueden tener tamaños muy grandes. Se recomienda un tramo corto.");
  }
  if (!gifEnabled) {
    warnings.push("El vídeo es demasiado largo para GIF. Selecciona un tramo de menos de 5 minutos.");
  }

  return {
    id: `ffmpeg-gif-${descriptor.id}`,
    operation: "create-gif",
    outputFormat: "gif",
    outputMime: "image/gif",
    label: "Crear GIF animado",
    description: "Animación corta sin audio",
    lossProfile: "lossy",
    state: available ? (gifEnabled ? "available" : "experimental") : "unavailable-tool",
    unavailableReason: available ? undefined : "FFmpeg no está instalado.",
    recommended: false,
    presets: [
      { id: "gif-light", label: "Ligero", quality: "320", description: "320px ancho — tamaño reducido" },
      { id: "gif-balanced", label: "Equilibrado", quality: "480", description: "480px ancho — buen equilibrio", isRecommended: true },
      { id: "gif-quality", label: "Alta calidad", quality: "720", description: "720px ancho — mayor calidad" },
    ],
    warnings,
    engineId: ENGINE_ID,
    mobilePortability: "desktop-only",
  };
}

function buildThumbnailCapability(
  descriptor: UniversalFileDescriptor,
  available: boolean,
): ConversionCapability {
  return {
    id: `ffmpeg-thumbnail-${descriptor.id}`,
    operation: "extract-thumbnail",
    outputFormat: "jpg",
    outputMime: "image/jpeg",
    label: "Extraer miniatura",
    description: "Extrae una imagen del vídeo",
    lossProfile: "lossy",
    state: available ? "available" : "unavailable-tool",
    unavailableReason: available ? undefined : "FFmpeg no está instalado.",
    recommended: false,
    presets: [
      { id: "thumb-jpg", label: "JPG", quality: "jpg", description: "Imagen JPEG comprimida", isRecommended: true },
      { id: "thumb-png", label: "PNG", quality: "png", description: "Imagen PNG sin pérdida" },
    ],
    warnings: [],
    engineId: ENGINE_ID,
    mobilePortability: "desktop-only",
  };
}

function buildExtractFramesCapability(
  descriptor: UniversalFileDescriptor,
  available: boolean,
): ConversionCapability {
  return {
    id: `ffmpeg-frames-${descriptor.id}`,
    operation: "extract-frames",
    outputFormat: "jpg",
    outputMime: "image/jpeg",
    label: "Extraer frames",
    description: "Extrae múltiples frames del vídeo como imágenes",
    lossProfile: "lossy",
    state: available ? "available" : "unavailable-tool",
    unavailableReason: available ? undefined : "FFmpeg no está instalado.",
    recommended: false,
    presets: [
      { id: "frames-1fps", label: "1 fps", quality: "1", description: "1 frame por segundo", isRecommended: true },
      { id: "frames-5fps", label: "5 fps", quality: "5", description: "5 frames por segundo" },
    ],
    warnings: [],
    engineId: ENGINE_ID,
    mobilePortability: "desktop-only",
  };
}

function buildTrimCapability(
  descriptor: UniversalFileDescriptor,
  available: boolean,
): ConversionCapability {
  const ext = (descriptor.extension ?? "mp4").toLowerCase();
  const isVideo = descriptor.category === "video";
  const mime = isVideo ? (VIDEO_FORMATS[ext as VideoFormat]?.mime ?? "video/mp4") : (AUDIO_FORMATS[ext as AudioFormat]?.mime ?? "audio/mpeg");

  return {
    id: `ffmpeg-trim-${descriptor.id}`,
    operation: "trim",
    outputFormat: ext,
    outputMime: mime,
    label: "Recortar",
    description: "Recortar un fragmento del archivo",
    lossProfile: "lossless",
    state: available ? "available" : "unavailable-tool",
    unavailableReason: available ? undefined : "FFmpeg no está instalado.",
    recommended: false,
    presets: [
      { id: "trim-start", label: "Desde el inicio", quality: "0", description: "Recortar desde el inicio hasta un punto", isRecommended: true },
    ],
    warnings: [],
    engineId: ENGINE_ID,
    mobilePortability: "desktop-only",
  };
}

function buildExtractSubtitlesCapability(
  descriptor: UniversalFileDescriptor,
  available: boolean,
): ConversionCapability {
  return {
    id: `ffmpeg-subtitles-${descriptor.id}`,
    operation: "extract-subtitles",
    outputFormat: "srt",
    outputMime: "text/srt",
    label: "Extraer subtítulos",
    description: "Extrae los subtítulos internos del archivo",
    lossProfile: "lossless",
    state: available ? "available" : "unavailable-tool",
    unavailableReason: available ? undefined : "FFmpeg no está instalado.",
    recommended: false,
    presets: [
      { id: "sub-srt", label: "SRT", quality: "srt", description: "Formato de subtítulos más compatible", isRecommended: true },
    ],
    warnings: [],
    engineId: ENGINE_ID,
    mobilePortability: "desktop-only",
  };
}

// ── FFmpeg arg builders ──────────────────────────────────────────────────────

function buildAudioArgs(inputPath: string, outputPath: string, fromFmt: AudioFormat, toFmt: AudioFormat, quality: string, options: Record<string, unknown>): string[] {
  const args: string[] = ["-y", "-i", inputPath];

  // Trim
  if (options.trimStart !== undefined) args.push("-ss", String(options.trimStart));
  if (options.trimEnd !== undefined) args.push("-to", String(options.trimEnd));

  // Audio stream selection
  if (options.audioStreamIndex !== undefined) {
    args.push("-map", `0:a:${options.audioStreamIndex}`);
  }

  // Normalize
  if (options.normalize) {
    args.push("-af", "loudnorm=I=-16:TP=-1.5:LRA=11");
  }

  switch (toFmt) {
    case "mp3":
      args.push("-c:a", "libmp3lame", "-q:a", mapMp3Quality(quality));
      break;
    case "m4a":
      args.push("-c:a", "aac", "-b:a", `${quality}k`);
      break;
    case "wav":
      args.push("-c:a", "pcm_s16le");
      break;
    case "flac":
      args.push("-c:a", "flac");
      break;
    case "ogg":
      args.push("-c:a", "libvorbis", "-q:a", quality || "4");
      break;
  }

  args.push(outputPath);
  return args;
}

function buildVideoArgs(inputPath: string, outputPath: string, toFmt: VideoFormat, quality: string, options: Record<string, unknown>): string[] {
  const args: string[] = ["-y", "-i", inputPath];

  // Trim
  if (options.trimStart !== undefined) args.push("-ss", String(options.trimStart));
  if (options.trimEnd !== undefined) args.push("-to", String(options.trimEnd));

  // Stream selection
  if (options.videoStreamIndex !== undefined) {
    args.push("-map", `0:v:${options.videoStreamIndex}`);
  }
  if (options.audioStreamIndex !== undefined) {
    args.push("-map", `0:a:${options.audioStreamIndex}`);
  } else {
    args.push("-map", "0:a?");
  }

  const height = parseInt(quality, 10);

  switch (toFmt) {
    case "mp4":
      args.push("-c:v", "libx264", "-preset", "fast", "-crf", "23");
      args.push("-c:a", "aac", "-b:a", "128k");
      if (!Number.isNaN(height) && height > 0) {
        args.push("-vf", `scale=-2:min(${height}\\,ih)`);
      }
      args.push("-movflags", "+faststart");
      break;
    case "webm":
      args.push("-c:v", "libvpx-vp9", "-crf", "30", "-b:v", "0");
      args.push("-c:a", "libopus", "-b:a", "128k");
      if (!Number.isNaN(height) && height > 0) {
        args.push("-vf", `scale=-2:min(${height}\\,ih)`);
      }
      break;
    case "mkv":
      args.push("-c:v", "copy", "-c:a", "copy");
      break;
  }

  args.push(outputPath);
  return args;
}

function buildExtractAudioArgs(inputPath: string, outputPath: string, outputFmt: AudioFormat, quality: string, options: Record<string, unknown>): string[] {
  const args: string[] = ["-y", "-i", inputPath, "-vn"];

  if (options.trimStart !== undefined) args.push("-ss", String(options.trimStart));
  if (options.trimEnd !== undefined) args.push("-to", String(options.trimEnd));

  if (options.normalize) {
    args.push("-af", "loudnorm=I=-16:TP=-1.5:LRA=11");
  }

  switch (outputFmt) {
    case "mp3":
      args.push("-c:a", "libmp3lame", "-q:a", mapMp3Quality(quality));
      break;
    case "m4a":
      args.push("-c:a", "aac", "-b:a", `${quality}k`);
      break;
    case "wav":
      args.push("-c:a", "pcm_s16le");
      break;
    case "flac":
      args.push("-c:a", "flac");
      break;
    case "ogg":
      args.push("-c:a", "libvorbis", "-q:a", quality || "4");
      break;
  }

  args.push(outputPath);
  return args;
}

function buildGifArgs(inputPath: string, outputPath: string, quality: string, options: Record<string, unknown>): string[] {
  const width = quality || "480";
  const args: string[] = ["-y", "-i", inputPath];

  if (options.trimStart !== undefined) args.push("-ss", String(options.trimStart));
  if (options.trimEnd !== undefined) args.push("-to", String(options.trimEnd));

  args.push("-vf", `fps=10,scale=${width}:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse`);
  args.push("-loop", "0");
  args.push(outputPath);
  return args;
}

function buildThumbnailArgs(inputPath: string, outputPath: string, options: Record<string, unknown>): string[] {
  const timestamp = options.thumbnailTimestamp ?? "00:00:01";
  const fmt = (options.thumbnailFormat as string) ?? "jpg";
  const actualOutput = fmt === "png" ? outputPath.replace(/\.\w+$/, ".png") : outputPath;
  const args = ["-y", "-i", inputPath, "-ss", String(timestamp), "-frames:v", "1", "-q:v", "2", actualOutput];
  return args;
}

function buildExtractSubtitlesArgs(inputPath: string, outputPath: string, options: Record<string, unknown>): string[] {
  const streamIndex = options.subtitleStreamIndex ?? 0;
  const args = ["-y", "-i", inputPath, "-map", `0:s:${streamIndex}`, "-f", "srt", outputPath];
  return args;
}

function buildTrimArgs(inputPath: string, outputPath: string, options: Record<string, unknown>): string[] {
  const args: string[] = ["-y", "-i", inputPath, "-c", "copy"];

  if (options.trimStart !== undefined) args.push("-ss", String(options.trimStart));
  if (options.trimEnd !== undefined) args.push("-to", String(options.trimEnd));

  args.push(outputPath);
  return args;
}

function buildExtractFramesArgs(inputPath: string, outputPath: string, quality: string, options: Record<string, unknown>): string[] {
  const fps = quality || "1";
  const args: string[] = ["-y", "-i", inputPath];

  if (options.trimStart !== undefined) args.push("-ss", String(options.trimStart));
  if (options.trimEnd !== undefined) args.push("-to", String(options.trimEnd));

  args.push("-vf", `fps=${fps}`);
  // Use a pattern for output to get multiple frames
  const outputPattern = outputPath.replace(/\.\w+$/, "_%04d.jpg");
  args.push(outputPattern);
  return args;
}

function mapMp3Quality(quality: string): string {
  const bitrate = parseInt(quality, 10);
  if (bitrate >= 320) return "0";
  if (bitrate >= 256) return "1";
  if (bitrate >= 192) return "2";
  if (bitrate >= 128) return "5";
  return "7";
}

// ── Binary discovery ─────────────────────────────────────────────────────────

function findFfmpegBinary(): string {
  // 1. Prefer LINK2MEDIA_FFMPEG_PATH env var (portable distribution)
  const envPath = CONFIG.media.binaries.ffmpeg;
  if (envPath && envPath !== "ffmpeg") return envPath;
  // 2. Portable path relative to cwd
  const portablePaths = [
    path.resolve(process.cwd(), "tools", "ffmpeg", "bin", "ffmpeg.exe"),
    path.resolve(process.cwd(), "tools", "ffmpeg", "ffmpeg.exe"),
    path.resolve(process.cwd(), "tools", "ffmpeg", "ffmpeg"),
  ];
  for (const p of portablePaths) {
    if (fs.existsSync(p)) return p;
  }
  // 3. Fall back to PATH
  return "ffmpeg";
}

function findFfprobeBinary(): string {
  // 1. Prefer LINK2MEDIA_FFPROBE_PATH env var (portable distribution)
  const envPath = CONFIG.media.binaries.ffprobe;
  if (envPath && envPath !== "ffprobe") return envPath;
  // 2. Portable path relative to cwd
  const portablePaths = [
    path.resolve(process.cwd(), "tools", "ffmpeg", "bin", "ffprobe.exe"),
    path.resolve(process.cwd(), "tools", "ffmpeg", "ffprobe.exe"),
    path.resolve(process.cwd(), "tools", "ffmpeg", "ffprobe"),
  ];
  for (const p of portablePaths) {
    if (fs.existsSync(p)) return p;
  }
  // 3. Fall back to PATH
  return "ffprobe";
}

// ── Engine implementation ────────────────────────────────────────────────────

export class FFmpegEngine implements ConversionEngine {
  readonly id: EngineId = ENGINE_ID;
  readonly supportedCategories = ["audio", "video"] as const;

  private _probeResult: EngineProbeResult | null = null;
  private _ffmpegRunner: ProcessRunner | null = null;
  private _ffprobeRunner: ProcessRunner | null = null;

  private getFfmpegRunner(): ProcessRunner {
    if (!this._ffmpegRunner) this._ffmpegRunner = new ProcessRunner(findFfmpegBinary(), 300_000);
    return this._ffmpegRunner;
  }

  private getFfprobeRunner(): ProcessRunner {
    if (!this._ffprobeRunner) this._ffprobeRunner = new ProcessRunner(findFfprobeBinary(), 30_000);
    return this._ffprobeRunner;
  }

  async probe(): Promise<EngineProbeResult> {
    if (this._probeResult) return this._probeResult;

    try {
      const [ffmpegResult, ffprobeResult] = await Promise.all([
        this.getFfmpegRunner().probe(["-version"]),
        this.getFfprobeRunner().probe(["-version"]),
      ]);

      const available = ffmpegResult.available && ffprobeResult.available;
      const version = ffmpegResult.version ?? null;
      const capabilities: string[] = [];

      if (available) {
        capabilities.push(
          "transcode-audio", "transcode-video", "extract-audio", "normalize-audio",
          "remux", "trim", "create-gif", "extract-thumbnail", "extract-frames",
          "extract-subtitles",
        );
      }

      this._probeResult = {
        available,
        version,
        binaryPath: ffmpegResult.binaryPath,
        capabilities,
        error: !available
          ? !ffmpegResult.available
            ? "FFmpeg no encontrado. Instálalo para convertir archivos de audio y vídeo."
            : "FFprobe no encontrado. Instálalo junto con FFmpeg."
          : undefined,
      };
    } catch (err) {
      this._probeResult = {
        available: false,
        version: null,
        binaryPath: null,
        capabilities: [],
        error: `Error al detectar FFmpeg: ${String(err)}`,
      };
    }

    return this._probeResult;
  }

  getCapabilities(
    descriptor: UniversalFileDescriptor,
    probeResult: EngineProbeResult,
  ): ConversionCapability[] {
    if (descriptor.category !== "audio" && descriptor.category !== "video") return [];

    const attrs = descriptor.attributes as MediaAttributes;
    const caps: ConversionCapability[] = [];
    const available = probeResult.available;

    // Audio capabilities
    if (descriptor.category === "audio" && attrs.hasAudio) {
      const fromFmt = resolveAudioFormat(descriptor);
      if (fromFmt) {
        // Audio cross-conversion
        const audioFormats: AudioFormat[] = ["mp3", "m4a", "wav", "flac", "ogg"];
        for (const toFmt of audioFormats) {
          caps.push(buildAudioConvertCapability(fromFmt, toFmt, descriptor, available));
        }
        // Normalize audio
        caps.push(buildNormalizeAudioCapability(fromFmt, descriptor, available));
        // Trim
        caps.push(buildTrimCapability(descriptor, available));
      }
    }

    // Video capabilities
    if (descriptor.category === "video") {
      const fromFmt = resolveVideoFormat(descriptor);

      if (attrs.hasVideo && fromFmt) {
        // Video cross-conversion
        const videoFormats: VideoFormat[] = ["mp4", "webm", "mkv"];
        for (const toFmt of videoFormats) {
          caps.push(buildVideoConvertCapability(fromFmt, toFmt, descriptor, attrs, available));
        }
      }

      // Extract audio from video (requires audio stream)
      if (attrs.hasAudio) {
        caps.push(buildExtractAudioCapability(descriptor, available));
      }

      // GIF (video with or without known format)
      if (attrs.hasVideo) {
        caps.push(buildGifCapability(descriptor, attrs, available));
        // Thumbnail
        caps.push(buildThumbnailCapability(descriptor, available));
        // Extract frames
        caps.push(buildExtractFramesCapability(descriptor, available));
      }

      // Trim (video)
      if (fromFmt) {
        caps.push(buildTrimCapability(descriptor, available));
      }

      // Subtitles extraction
      if (attrs.hasSubtitles) {
        caps.push(buildExtractSubtitlesCapability(descriptor, available));
      }
    }

    return caps;
  }

  async execute(
    plan: ConversionPlan,
    onProgress?: (progress: number, stage: string) => void,
  ): Promise<ExecutionResult> {
    const start = Date.now();
    onProgress?.(10, "Preparando");

    try {
      ensurePathSafety(plan.inputPath);
      ensurePathSafety(plan.outputPath);
    } catch (err) {
      return { success: false, outputPath: plan.outputPath, outputSizeBytes: 0, durationMs: 0, logs: [], warnings: [], error: String(err) };
    }

    const operation = plan.operation;
    const opts = plan.options;
    let args: string[];

    onProgress?.(20, "Construyendo comando");

    switch (operation) {
      case "transcode-audio": {
        const fromFmt = (opts.inputFormat as AudioFormat) ?? (plan.inputPath.split(".").pop()?.toLowerCase() as AudioFormat);
        const toFmt = plan.outputFormat as AudioFormat;
        const quality = (opts.quality as string) ?? "192";
        args = buildAudioArgs(plan.inputPath, plan.outputPath, fromFmt, toFmt, quality, opts);
        break;
      }
      case "transcode-video": {
        const toFmt = plan.outputFormat as VideoFormat;
        const quality = (opts.quality as string) ?? "1080";
        args = buildVideoArgs(plan.inputPath, plan.outputPath, toFmt, quality, opts);
        break;
      }
      case "remux": {
        const toFmt = plan.outputFormat as VideoFormat;
        const quality = (opts.quality as string) ?? "0";
        args = buildVideoArgs(plan.inputPath, plan.outputPath, toFmt, quality, opts);
        break;
      }
      case "extract-audio": {
        const outputFmt = (opts.audioFormat as AudioFormat) ?? "mp3";
        const quality = (opts.quality as string) ?? "192";
        args = buildExtractAudioArgs(plan.inputPath, plan.outputPath, outputFmt, quality, opts);
        break;
      }
      case "normalize-audio": {
        const fromFmt = (opts.inputFormat as AudioFormat) ?? "mp3";
        const quality = (opts.quality as string) ?? "192";
        const normalizeOpts = { ...opts, normalize: true };
        args = buildAudioArgs(plan.inputPath, plan.outputPath, fromFmt, "mp3", quality, normalizeOpts);
        break;
      }
      case "create-gif": {
        const quality = (opts.quality as string) ?? "480";
        args = buildGifArgs(plan.inputPath, plan.outputPath, quality, opts);
        break;
      }
      case "extract-thumbnail": {
        args = buildThumbnailArgs(plan.inputPath, plan.outputPath, opts);
        break;
      }
      case "extract-frames": {
        const quality = (opts.quality as string) ?? "1";
        args = buildExtractFramesArgs(plan.inputPath, plan.outputPath, quality, opts);
        break;
      }
      case "extract-subtitles": {
        args = buildExtractSubtitlesArgs(plan.inputPath, plan.outputPath, opts);
        break;
      }
      case "trim": {
        args = buildTrimArgs(plan.inputPath, plan.outputPath, opts);
        break;
      }
      default:
        return {
          success: false,
          outputPath: plan.outputPath,
          outputSizeBytes: 0,
          durationMs: Date.now() - start,
          logs: [],
          warnings: [],
          error: `Operación no soportada: ${operation}`,
        };
    }

    onProgress?.(30, "Procesando con FFmpeg");

    // Parse progress from FFmpeg stderr
    const result = await this.getFfmpegRunner().run({
      args,
      timeoutMs: plan.timeoutMs,
      onProgress: (line, stream) => {
        // FFmpeg outputs progress to stderr
        if (stream === "stderr") {
          const progress = parseFfmpegProgress(line, opts.durationSeconds as number | undefined);
          if (progress !== null) {
            onProgress?.(30 + Math.round(progress * 0.6), "Convirtiendo");
          }
        }
      },
    });

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
      error: success ? undefined : `ffmpeg exit ${result.exitCode}: ${result.stderr.slice(0, 300)}`,
    };
  }

  async validate(outputPath: string, plan: ConversionPlan): Promise<ArtifactValidation> {
    const checks: ArtifactValidation["checks"] = [];

    // File exists
    const exists = fs.existsSync(outputPath);
    checks.push({ name: "file-exists", passed: exists });
    if (!exists) return { valid: false, checks };

    // Size > 0
    const stat = fs.statSync(outputPath);
    checks.push({ name: "size-nonzero", passed: stat.size > 0, detail: `${stat.size} bytes` });

    // ffprobe validation for media files
    if (plan.operation !== "extract-subtitles" && plan.operation !== "extract-thumbnail" && plan.operation !== "extract-frames") {
      try {
        const probeResult = await this.getFfprobeRunner().run({
          args: ["-v", "error", "-show_format", "-show_streams", "-print_format", "json", outputPath],
          timeoutMs: 10_000,
        });

        if (probeResult.exitCode === 0) {
          const data = JSON.parse(probeResult.stdout);
          const streams = data.streams ?? [];
          const hasStreams = streams.length > 0;
          checks.push({ name: "ffprobe-readable", passed: hasStreams, detail: `${streams.length} streams` });

          // Verify expected stream type
          const operation = plan.operation;
          if (operation === "extract-audio" || operation === "transcode-audio" || operation === "normalize-audio") {
            const hasAudio = streams.some((s: { codec_type: string }) => s.codec_type === "audio");
            checks.push({ name: "has-audio-stream", passed: hasAudio });
          }
          if (operation === "transcode-video" || operation === "remux") {
            const hasVideo = streams.some((s: { codec_type: string }) => s.codec_type === "video");
            checks.push({ name: "has-video-stream", passed: hasVideo });
          }
        } else {
          checks.push({ name: "ffprobe-readable", passed: false, detail: `exit code ${probeResult.exitCode}` });
        }
      } catch (err) {
        checks.push({ name: "ffprobe-readable", passed: false, detail: String(err) });
      }
    }

    return { valid: checks.every((c) => c.passed), checks };
  }
}

// ── FFmpeg progress parsing ──────────────────────────────────────────────────

/**
 * Parse FFmpeg progress line to calculate percentage.
 * FFmpeg outputs lines like: "frame=  120 fps= 30 q=28.0 size=    1024kB time=00:00:04.00 bitrate= 2097.2kbits/s speed=  1x"
 * The `time=` field indicates current processing position.
 * If total duration is known, we can calculate percentage.
 */
function parseFfmpegProgress(line: string, totalDurationSeconds?: number): number | null {
  const timeMatch = line.match(/time=(\d+):(\d+):(\d+\.?\d*)/);
  if (!timeMatch) return null;

  const hours = parseFloat(timeMatch[1]);
  const minutes = parseFloat(timeMatch[2]);
  const seconds = parseFloat(timeMatch[3]);
  const currentTime = hours * 3600 + minutes * 60 + seconds;

  if (totalDurationSeconds && totalDurationSeconds > 0) {
    return Math.min(100, (currentTime / totalDurationSeconds) * 100);
  }

  // Without duration, return null (indeterminate)
  return null;
}

export const ffmpegEngine = new FFmpegEngine();
