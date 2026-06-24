import { AudioOutputFormat, VideoOutputFormat } from "../jobs/job-types";
import {
  VideoQualitySelection,
  buildYtdlpFormatSelector,
  parseLegacyQualityString,
} from "../quality/quality-contract";

export type OutputFormat = AudioOutputFormat | VideoOutputFormat;

export interface AudioConversionOptions {
  inputPath: string;
  outputPath: string;
  format: AudioOutputFormat;
  quality: string;
  normalize?: boolean;
  trimStart?: number;
  trimEnd?: number;
  audioStreamIndex?: number;
}

export interface VideoConversionOptions {
  inputPath: string;
  outputPath: string;
  format: VideoOutputFormat;
  quality: string;
  trimStart?: number;
  trimEnd?: number;
  audioStreamIndex?: number;
  videoStreamIndex?: number;
}

export interface YtdlpConversionOptions {
  url: string;
  format: OutputFormat;
  /** Accepts a typed VideoQualitySelection (new callers) or a legacy string (persisted jobs). */
  quality: string | VideoQualitySelection;
  outputPath: string;
  ffmpegLocation?: string;
}

export function buildYtdlpArgs(options: YtdlpConversionOptions): string[] {
  const { url, format, quality, outputPath, ffmpegLocation } = options;

  const baseArgs = [
    "--no-playlist",
    "--newline",
    ...(ffmpegLocation ? ["--ffmpeg-location", ffmpegLocation] : []),
    "--output",
    outputPath,
    "--embed-metadata",
    url,
  ];

  const audioFormats: AudioOutputFormat[] = ["mp3", "m4a", "wav", "flac", "ogg"];
  if (audioFormats.includes(format as AudioOutputFormat)) {
    // Audio quality must be a string; VideoQualitySelection is not valid here.
    const qualityStr = typeof quality === "string" ? quality : "best";
    return [
      "--extract-audio",
      "--audio-format",
      format,
      "--audio-quality",
      mapAudioQuality(qualityStr, format as AudioOutputFormat),
      ...baseArgs,
    ];
  }

  // Video: resolve typed selection or adapt legacy string
  const selection: VideoQualitySelection =
    typeof quality === "string"
      ? parseLegacyQualityString(quality, format)
      : quality;

  const { formatArg, mergeFormat } = buildYtdlpFormatSelector(selection);

  return [
    "--format",
    formatArg,
    "--merge-output-format",
    mergeFormat,
    ...baseArgs,
  ];
}

/** Build ffmpeg args for local file audio conversion */
export function buildFfmpegAudioArgs(opts: AudioConversionOptions): string[] {
  const args: string[] = ["-y", "-i", opts.inputPath];

  if (opts.trimStart !== undefined) {
    args.push("-ss", String(opts.trimStart));
  }
  if (opts.trimEnd !== undefined) {
    args.push("-to", String(opts.trimEnd));
  }

  if (opts.audioStreamIndex !== undefined) {
    args.push("-map", `0:a:${opts.audioStreamIndex}`);
  }

  if (opts.normalize) {
    args.push("-af", "loudnorm=I=-16:TP=-1.5:LRA=11");
  }

  switch (opts.format) {
    case "mp3":
      args.push("-c:a", "libmp3lame", "-q:a", mapMp3Quality(opts.quality));
      break;
    case "m4a":
      args.push("-c:a", "aac", "-b:a", `${opts.quality}k`);
      break;
    case "wav":
      args.push("-c:a", "pcm_s16le");
      break;
    case "flac":
      args.push("-c:a", "flac");
      break;
    case "ogg":
      args.push("-c:a", "libvorbis", "-q:a", "4");
      break;
  }

  args.push(opts.outputPath);
  return args;
}

/** Build ffmpeg args for local file video conversion */
export function buildFfmpegVideoArgs(opts: VideoConversionOptions): string[] {
  const args: string[] = ["-y", "-i", opts.inputPath];

  if (opts.trimStart !== undefined) {
    args.push("-ss", String(opts.trimStart));
  }
  if (opts.trimEnd !== undefined) {
    args.push("-to", String(opts.trimEnd));
  }

  if (opts.videoStreamIndex !== undefined) {
    args.push("-map", `0:v:${opts.videoStreamIndex}`);
  }
  if (opts.audioStreamIndex !== undefined) {
    args.push("-map", `0:a:${opts.audioStreamIndex}`);
  } else {
    args.push("-map", "0:a?");
  }

  const height = parseInt(opts.quality, 10);

  switch (opts.format) {
    case "mp4":
      args.push("-c:v", "libx264", "-preset", "fast", "-crf", "23");
      args.push("-c:a", "aac", "-b:a", "128k");
      if (!Number.isNaN(height)) {
        args.push("-vf", `scale=-2:min(${height}\\,ih)`);
      }
      args.push("-movflags", "+faststart");
      break;
    case "webm":
      args.push("-c:v", "libvpx-vp9", "-crf", "30", "-b:v", "0");
      args.push("-c:a", "libopus", "-b:a", "128k");
      if (!Number.isNaN(height)) {
        args.push("-vf", `scale=-2:min(${height}\\,ih)`);
      }
      break;
    case "mkv":
      args.push("-c:v", "copy", "-c:a", "copy");
      break;
  }

  args.push(opts.outputPath);
  return args;
}

function mapAudioQuality(quality: string, format: AudioOutputFormat): string {
  if (format === "mp3") {
    const bitrate = parseInt(quality, 10);
    if (bitrate >= 320) return "0";
    if (bitrate >= 192) return "2";
    if (bitrate >= 128) return "5";
    return "7";
  }
  return quality;
}

function mapMp3Quality(quality: string): string {
  const bitrate = parseInt(quality, 10);
  if (bitrate >= 320) return "0";
  if (bitrate >= 256) return "1";
  if (bitrate >= 192) return "2";
  if (bitrate >= 128) return "5";
  return "7";
}

// Legacy export for backwards compatibility
export const buildConversionArgs = buildYtdlpArgs;
export type ConversionOptions = YtdlpConversionOptions;
