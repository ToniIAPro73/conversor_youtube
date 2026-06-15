import { z } from "zod";

const envSchema = z.object({
  APP_NAME: z.string().default("Link2Media"),
  APP_VERSION: z.string().default("0.1.0"),

  // ── Tool paths: LINK2MEDIA_* env vars (portable distribution) ─────────
  // These are set by the Windows portable launcher scripts.
  // In development mode, engines fall back to PATH lookups.
  LINK2MEDIA_FFMPEG_PATH: z.string().default(""),
  LINK2MEDIA_FFPROBE_PATH: z.string().default(""),
  LINK2MEDIA_YTDLP_PATH: z.string().default(""),
  LINK2MEDIA_QPDF_PATH: z.string().default(""),
  LINK2MEDIA_7ZIP_PATH: z.string().default(""),
  LINK2MEDIA_PANDOC_PATH: z.string().default(""),
  LINK2MEDIA_LIBREOFFICE_PATH: z.string().default(""),
  LINK2MEDIA_CALIBRE_PATH: z.string().default(""),
  LINK2MEDIA_TESSERACT_PATH: z.string().default(""),
  LINK2MEDIA_TESSDATA_PREFIX: z.string().default(""),
  LINK2MEDIA_POPPLER_PATH: z.string().default(""),
  LINK2MEDIA_DATA_DIR: z.string().default(""),
  LINK2MEDIA_TEMP_DIR: z.string().default(""),

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
 * Resolve a tool path: prefers LINK2MEDIA_* env var, falls back to the
 * provided default (typically a PATH-based command name) in development mode.
 */
export function resolveToolPath(link2mediaEnvVar: string, fallback: string): string {
  if (link2mediaEnvVar) return link2mediaEnvVar;
  // In development/test mode, fall back to PATH lookup
  if (env.NODE_ENV !== "production") return fallback;
  // In production (portable dist), return the fallback too — engines will probe
  return fallback;
}
