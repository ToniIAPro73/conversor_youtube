import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { CONFIG } from "../config";
import { AppError, ERROR_CODES, ERROR_MESSAGES } from "../errors";
import { MetadataResponse } from "../youtube/schemas";

export interface VideoFormat {
  formatId: string;
  width: number | null;
  height: number | null;
  fps: number | null;
  ext: string;
  vcodec: string | null;
  acodec: string | null;
  isVideoOnly: boolean;
  fileSizeBytes: number | null;
  fileSizeApproxBytes: number | null;
  tbr: number | null;
}

interface YtdlpFormat {
  format_id?: string;
  vcodec?: string;
  acodec?: string;
  height?: number;
  width?: number;
  fps?: number;
  ext?: string;
  filesize?: number;
  filesize_approx?: number;
  tbr?: number;
}

// ---------------------------------------------------------------------------
// Stderr classification — maps raw yt-dlp output to user-safe error info
// ---------------------------------------------------------------------------

type YtdlpErrorCategory = {
  code: keyof typeof ERROR_CODES;
  message: string;
};

function classifyYtdlpFailure(stderr: string, exitCode: number | null): YtdlpErrorCategory {
  // Null exit code means the process was killed (timeout or signal)
  if (exitCode === null) {
    return {
      code: "CONVERSION_TIMEOUT",
      message: "El análisis del vídeo tardó demasiado tiempo. Inténtalo de nuevo.",
    };
  }

  const s = stderr.toLowerCase();

  // Video unavailable / deleted
  if (
    s.includes("video unavailable") ||
    s.includes("this video is not available") ||
    s.includes("has been removed")
  ) {
    return { code: "VIDEO_UNAVAILABLE", message: "El vídeo no está disponible o ha sido eliminado." };
  }

  // Authentication / age restriction / bot check
  if (
    s.includes("sign in") ||
    s.includes("confirm your age") ||
    s.includes("not a bot") ||
    s.includes("confirm you") ||
    s.includes("requires authentication")
  ) {
    return {
      code: "CONTENT_RESTRICTED",
      message: "Este vídeo requiere verificación de edad, inicio de sesión o confirmar que no eres un bot.",
    };
  }

  // Rate limiting
  if (s.includes("429") || s.includes("too many requests") || s.includes("rate limit")) {
    return {
      code: "RATE_LIMITED",
      message: "YouTube está limitando las peticiones. Espera unos minutos e inténtalo de nuevo.",
    };
  }

  // yt-dlp outdated
  if (
    s.includes("outdated") ||
    s.includes("please update") ||
    (s.includes("update") && s.includes("yt-dlp"))
  ) {
    return {
      code: "INTERNAL_ERROR",
      message: "La versión de yt-dlp incluida necesita actualización. Descarga el portable más reciente.",
    };
  }

  // SSL certificate failure
  if (
    s.includes("ssl") ||
    s.includes("certificate_verify_failed") ||
    s.includes("certificate verify failed") ||
    s.includes("certificate error")
  ) {
    return {
      code: "INTERNAL_ERROR",
      message:
        "Error de certificado SSL al conectar con YouTube. Comprueba la configuración de red o proxy.",
    };
  }

  // Network / connection errors
  if (
    s.includes("network") ||
    s.includes("urlopen error") ||
    s.includes("name or service not known") ||
    s.includes("connection refused") ||
    s.includes("no route to host") ||
    s.includes("errno 11001") ||  // Windows DNS resolution failure
    s.includes("getaddrinfo failed")
  ) {
    return {
      code: "INTERNAL_ERROR",
      message: "Error de red al analizar el vídeo. Comprueba la conexión a Internet.",
    };
  }

  // Generic catch-all
  return { code: "INTERNAL_ERROR", message: "Error al obtener metadatos del vídeo." };
}

// ---------------------------------------------------------------------------
// Sanitize stderr for log writing — strip tokens and limit length
// ---------------------------------------------------------------------------

function sanitizeStderr(raw: string): string {
  return raw
    .replace(/https?:\/\/[^\s"')]+/g, (url) => {
      try {
        const u = new URL(url);
        u.search = u.search ? "?[params-redacted]" : "";
        return u.toString();
      } catch {
        return "[url]";
      }
    })
    .slice(0, 3000);
}

// ---------------------------------------------------------------------------
// Write structured entry to logs/ytdlp-errors.log (non-fatal)
// ---------------------------------------------------------------------------

function appendYtdlpErrorLog(entry: {
  ts: string;
  cmd: string;
  exitCode: number | null;
  stderr: string;
}): void {
  try {
    fs.mkdirSync(CONFIG.media.logsDir, { recursive: true });
    const logFile = path.join(CONFIG.media.logsDir, "ytdlp-errors.log");
    fs.appendFileSync(logFile, JSON.stringify(entry) + "\n", "utf8");
  } catch {
    // Non-fatal: log failure must not block the error flow
  }
}

// ---------------------------------------------------------------------------
// Validate that the configured binary path looks usable
// ---------------------------------------------------------------------------

function validateBinaryPath(binPath: string): void {
  // If the configured path is just a bare command name (e.g. "yt-dlp"),
  // we depend on PATH. That's acceptable in dev but emit a warning in production.
  if (!path.isAbsolute(binPath)) {
    console.warn(
      `[metadata] yt-dlp binary is not an absolute path: "${binPath}". ` +
      `Set ANCLORA_FILESTUDIO_YTDLP_PATH to the bundled binary path in portable mode.`
    );
    return;
  }
  // In production portable mode, verify the file actually exists
  if (!fs.existsSync(binPath)) {
    throw new AppError(
      ERROR_CODES.DEPENDENCY_MISSING,
      ERROR_MESSAGES.DEPENDENCY_MISSING,
      500
    );
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function getVideoMetadata(url: string): Promise<MetadataResponse> {
  const ytdlpBin = CONFIG.media.binaries.ytdlp;

  // Early validation — catch missing binary before spawning
  validateBinaryPath(ytdlpBin);

  return new Promise((resolve, reject) => {
    const args = [
      "--dump-single-json",
      "--skip-download",
      "--no-playlist",
      "--socket-timeout",
      "20",
      url,
    ];

    const proc = spawn(ytdlpBin, args, {
      shell: false,
      windowsHide: true,
      timeout: CONFIG.media.limits.metadataTimeoutSeconds * 1000,
    });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    proc.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    proc.on("close", (code) => {
      if (code !== 0) {
        const sanitized = sanitizeStderr(stderr);
        const category = classifyYtdlpFailure(stderr, code);

        // Always log yt-dlp failures with command info and sanitized stderr
        console.error(
          `[metadata] yt-dlp exited (code=${code ?? "killed"}) cmd="${ytdlpBin} ${args.join(" ")}"`,
          sanitized
        );
        appendYtdlpErrorLog({
          ts: new Date().toISOString(),
          cmd: `${path.basename(ytdlpBin)} ${args.join(" ")}`,
          exitCode: code,
          stderr: sanitized,
        });

        return reject(new AppError(ERROR_CODES[category.code], category.message, 500));
      }

      try {
        const data = JSON.parse(stdout);

        const durationSeconds = data.duration || 0;
        if (durationSeconds > CONFIG.media.limits.maxDurationSeconds) {
          return reject(
            new AppError(
              ERROR_CODES.DURATION_LIMIT_EXCEEDED,
              "El vídeo excede la duración máxima permitida."
            )
          );
        }

        const formats = (data.formats || []) as YtdlpFormat[];
        const availableHeights = Array.from(
          new Set(
            formats
              .filter((f) => f.vcodec !== "none" && f.height)
              .map((f) => f.height as number)
          )
        ).sort((a, b) => b - a);

        const videoFormats: VideoFormat[] = formats
          .filter((f) => f.vcodec && f.vcodec !== "none" && f.height && f.height > 0)
          .map((f) => ({
            formatId: f.format_id ?? "",
            width: f.width ?? null,
            height: f.height ?? null,
            fps: f.fps ?? null,
            ext: f.ext ?? "",
            vcodec: f.vcodec ?? null,
            acodec: f.acodec && f.acodec !== "none" ? f.acodec : null,
            isVideoOnly: !f.acodec || f.acodec === "none",
            fileSizeBytes: f.filesize ?? null,
            fileSizeApproxBytes: f.filesize_approx ?? null,
            tbr: f.tbr ?? null,
          }));

        resolve({
          videoId: data.id,
          title: data.title,
          channel: data.uploader || data.channel,
          thumbnailUrl: data.thumbnail,
          durationSeconds: durationSeconds,
          durationLabel: formatDuration(durationSeconds),
          availableHeights,
          supported: true,
          videoFormats,
        });
      } catch {
        reject(
          new AppError(
            ERROR_CODES.INTERNAL_ERROR,
            "Error al procesar la respuesta de metadatos."
          )
        );
      }
    });

    proc.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "ENOENT") {
        console.error(`[metadata] yt-dlp binary not found: "${ytdlpBin}"`);
        appendYtdlpErrorLog({
          ts: new Date().toISOString(),
          cmd: ytdlpBin,
          exitCode: null,
          stderr: `ENOENT: binary not found at "${ytdlpBin}"`,
        });
        reject(
          new AppError(
            ERROR_CODES.DEPENDENCY_MISSING,
            ERROR_MESSAGES.DEPENDENCY_MISSING,
            500
          )
        );
      } else {
        console.error(`[metadata] yt-dlp spawn error:`, err);
        appendYtdlpErrorLog({
          ts: new Date().toISOString(),
          cmd: ytdlpBin,
          exitCode: null,
          stderr: `spawn error: ${err.code ?? err.message}`,
        });
        reject(
          new AppError(ERROR_CODES.INTERNAL_ERROR, "Error al ejecutar yt-dlp.", 500)
        );
      }
    });
  });
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return [h, m, s]
    .map((v) => v.toString().padStart(2, "0"))
    .filter((v, i) => v !== "00" || i > 0)
    .join(":");
}
