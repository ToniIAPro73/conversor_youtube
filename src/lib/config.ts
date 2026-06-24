import path from "path";
import { env, resolveToolPath } from "./env";
import { isAncloraWindowsRuntime } from "./runtime-platform";

export const CONFIG = {
  app: {
    name: env.APP_NAME,
    version: env.APP_VERSION,
  },
  media: {
    // Prefer ANCLORA_FILESTUDIO_* env vars for tool paths (portable distribution),
    // fall back to legacy env vars (YTDLP_BINARY, FFMPEG_BINARY, etc.),
    // then to bare command names for PATH lookup (dev mode).
    tempDir: env.ANCLORA_FILESTUDIO_TEMP_DIR
      ? path.resolve(env.ANCLORA_FILESTUDIO_TEMP_DIR)
      : path.resolve(process.cwd(), env.MEDIA_TEMP_DIR),
    dataDir: env.ANCLORA_FILESTUDIO_DATA_DIR
      ? path.resolve(env.ANCLORA_FILESTUDIO_DATA_DIR)
      : path.resolve(process.cwd(), "data"),
    logsDir: env.ANCLORA_FILESTUDIO_LOGS_DIR
      ? path.resolve(env.ANCLORA_FILESTUDIO_LOGS_DIR)
      : env.ANCLORA_FILESTUDIO_DATA_DIR
        ? path.resolve(env.ANCLORA_FILESTUDIO_DATA_DIR, "..", "logs")
        : path.resolve(process.cwd(), ".tmp", "logs"),
    binaries: {
      ytdlp: resolveToolPath(env.ANCLORA_FILESTUDIO_YTDLP_PATH, env.YTDLP_BINARY),
      ffmpeg: resolveToolPath(env.ANCLORA_FILESTUDIO_FFMPEG_PATH, env.FFMPEG_BINARY),
      ffprobe: resolveToolPath(env.ANCLORA_FILESTUDIO_FFPROBE_PATH, env.FFPROBE_BINARY),
      qpdf: resolveToolPath(env.ANCLORA_FILESTUDIO_QPDF_PATH, "qpdf"),
      sevenzip: resolveToolPath(env.ANCLORA_FILESTUDIO_7ZIP_PATH, "7z"),
      pandoc: resolveToolPath(env.ANCLORA_FILESTUDIO_PANDOC_PATH, "pandoc"),
      // On Windows prefer soffice.com; soffice.exe can hang when probed from Node.
      libreoffice: resolveToolPath(
        env.ANCLORA_FILESTUDIO_LIBREOFFICE_PATH,
        isAncloraWindowsRuntime() ? "soffice.com" : "libreoffice"
      ),
      calibre: resolveToolPath(env.ANCLORA_FILESTUDIO_CALIBRE_PATH, "ebook-convert"),
      tesseract: resolveToolPath(env.ANCLORA_FILESTUDIO_TESSERACT_PATH, "tesseract"),
      tessdataPrefix: env.ANCLORA_FILESTUDIO_TESSDATA_PREFIX || "",
      poppler: env.ANCLORA_FILESTUDIO_POPPLER_PATH || "",
    },
    limits: {
      maxDurationSeconds: env.MAX_VIDEO_DURATION_SECONDS,
      maxConcurrentJobs: env.MAX_CONCURRENT_JOBS,
      maxActiveJobsPerClient: env.MAX_ACTIVE_JOBS_PER_CLIENT,
      metadataTimeoutSeconds: env.METADATA_TIMEOUT_SECONDS,
      conversionTimeoutSeconds: env.CONVERSION_TIMEOUT_SECONDS,
      jobTtlMinutes: env.JOB_TTL_MINUTES,
      downloadTokenTtlMinutes: env.DOWNLOAD_TOKEN_TTL_MINUTES,
    },
  },
  security: {
    rateLimit: {
      windowSeconds: env.RATE_LIMIT_WINDOW_SECONDS,
      maxMetadataRequests: env.RATE_LIMIT_MAX_METADATA_REQUESTS,
      maxJobRequests: env.RATE_LIMIT_MAX_JOB_REQUESTS,
    },
  },
} as const;
