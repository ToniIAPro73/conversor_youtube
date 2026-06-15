import path from "path";
import { env, resolveToolPath } from "./env";

export const CONFIG = {
  app: {
    name: env.APP_NAME,
    version: env.APP_VERSION,
  },
  media: {
    // Prefer LINK2MEDIA_* env vars for tool paths (portable distribution),
    // fall back to legacy env vars (YTDLP_BINARY, FFMPEG_BINARY, etc.),
    // then to bare command names for PATH lookup (dev mode).
    tempDir: env.LINK2MEDIA_TEMP_DIR
      ? path.resolve(env.LINK2MEDIA_TEMP_DIR)
      : path.resolve(process.cwd(), env.MEDIA_TEMP_DIR),
    dataDir: env.LINK2MEDIA_DATA_DIR
      ? path.resolve(env.LINK2MEDIA_DATA_DIR)
      : path.resolve(process.cwd(), "data"),
    binaries: {
      ytdlp: resolveToolPath(env.LINK2MEDIA_YTDLP_PATH, env.YTDLP_BINARY),
      ffmpeg: resolveToolPath(env.LINK2MEDIA_FFMPEG_PATH, env.FFMPEG_BINARY),
      ffprobe: resolveToolPath(env.LINK2MEDIA_FFPROBE_PATH, env.FFPROBE_BINARY),
      qpdf: resolveToolPath(env.LINK2MEDIA_QPDF_PATH, "qpdf"),
      sevenzip: resolveToolPath(env.LINK2MEDIA_7ZIP_PATH, "7z"),
      pandoc: resolveToolPath(env.LINK2MEDIA_PANDOC_PATH, "pandoc"),
      libreoffice: resolveToolPath(env.LINK2MEDIA_LIBREOFFICE_PATH, "libreoffice"),
      calibre: resolveToolPath(env.LINK2MEDIA_CALIBRE_PATH, "ebook-convert"),
      tesseract: resolveToolPath(env.LINK2MEDIA_TESSERACT_PATH, "tesseract"),
      tessdataPrefix: env.LINK2MEDIA_TESSDATA_PREFIX || "",
      poppler: env.LINK2MEDIA_POPPLER_PATH || "",
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
