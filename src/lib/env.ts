import { z } from "zod";

const envSchema = z.object({
  APP_NAME: z.string().default("Anclora FileStudio"),
  APP_VERSION: z.string().default("0.2.0"),

  // ── Tool paths: ANCLORA_FILESTUDIO_* env vars (portable distribution) ─────────
  // These are set by the Windows portable launcher scripts.
  // In development mode, engines fall back to PATH lookups.
  ANCLORA_FILESTUDIO_FFMPEG_PATH: z.string().default(""),
  ANCLORA_FILESTUDIO_FFPROBE_PATH: z.string().default(""),
  ANCLORA_FILESTUDIO_YTDLP_PATH: z.string().default(""),
  ANCLORA_FILESTUDIO_QPDF_PATH: z.string().default(""),
  ANCLORA_FILESTUDIO_7ZIP_PATH: z.string().default(""),
  ANCLORA_FILESTUDIO_PANDOC_PATH: z.string().default(""),
  ANCLORA_FILESTUDIO_LIBREOFFICE_PATH: z.string().default(""),
  ANCLORA_FILESTUDIO_CALIBRE_PATH: z.string().default(""),
  ANCLORA_FILESTUDIO_TESSERACT_PATH: z.string().default(""),
  ANCLORA_FILESTUDIO_TESSDATA_PREFIX: z.string().default(""),
  ANCLORA_FILESTUDIO_POPPLER_PATH: z.string().default(""),
  ANCLORA_FILESTUDIO_DATA_DIR: z.string().default(""),
  ANCLORA_FILESTUDIO_TEMP_DIR: z.string().default(""),
  ANCLORA_FILESTUDIO_LOGS_DIR: z.string().default(""),
  ANCLORA_FILESTUDIO_PLATFORM: z.string().default(""),
  ANCLORA_FILESTUDIO_DEPLOYMENT_TARGET: z.string().default(""),
  ANCLORA_FILESTUDIO_ENABLE_SERVER_CONVERSIONS: z.string().default(""),
  ANCLORA_FILESTUDIO_ENABLE_CLOUD_UPLOADS: z.string().default(""),
  NEXT_PUBLIC_ANCLORA_FILESTUDIO_MODE: z.string().default(""),
  NEXT_PUBLIC_ENABLE_BROWSER_DATA_CONVERSIONS: z.string().default(""),
  NEXT_PUBLIC_WINDOWS_DOWNLOAD_URL: z.string().default(""),
  NEXT_PUBLIC_LINUX_DOWNLOAD_URL: z.string().default(""),
  NEXT_PUBLIC_SUPPORT_URL: z.string().default(""),
  NEXT_PUBLIC_FILESTUDIO_SERVICE_URL: z.string().default(""),

  // ── Legacy binary paths (backward compatibility) ──────────────────────
  MEDIA_TEMP_DIR: z.string().default(".tmp/media"),
  YTDLP_BINARY: z.string().default("yt-dlp"),
  FFMPEG_BINARY: z.string().default("ffmpeg"),
  FFPROBE_BINARY: z.string().default("ffprobe"),

  // ── Limits ────────────────────────────────────────────────────────────
  MAX_VIDEO_DURATION_SECONDS: z.coerce.number().default(7200),
  MAX_CONCURRENT_JOBS: z.coerce.number().default(2),
  MAX_ACTIVE_JOBS_PER_CLIENT: z.coerce.number().default(1),
  METADATA_TIMEOUT_SECONDS: z.coerce.number().default(30),
  CONVERSION_TIMEOUT_SECONDS: z.coerce.number().default(1200),
  JOB_TTL_MINUTES: z.coerce.number().default(60),
  DOWNLOAD_TOKEN_TTL_MINUTES: z.coerce.number().default(15),

  RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().default(60),
  RATE_LIMIT_MAX_METADATA_REQUESTS: z.coerce.number().default(10),
  RATE_LIMIT_MAX_JOB_REQUESTS: z.coerce.number().default(3),

  NODE_ENV: z.enum(["development", "test", "production"]).default("production"),
});

export const env = envSchema.parse(process.env);
export type Env = z.infer<typeof envSchema>;

/**
 * Resolve a tool path: prefers ANCLORA_FILESTUDIO_* env var, falls back to the
 * provided default (typically a PATH-based command name) in development mode.
 */
export function resolveToolPath(envVarPath: string, fallback: string): string {
  if (envVarPath) return envVarPath;
  // In development/test mode, fall back to PATH lookup
  if (env.NODE_ENV !== "production") return fallback;
  // In production (portable dist), return the fallback too — engines will probe
  return fallback;
}
