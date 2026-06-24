import { spawn } from "child_process";
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

export async function getVideoMetadata(url: string): Promise<MetadataResponse> {
  return new Promise((resolve, reject) => {
    const args = [
      "--dump-single-json",
      "--skip-download",
      "--no-playlist",
      url,
    ];

    const proc = spawn(CONFIG.media.binaries.ytdlp, args, {
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
        console.error(`yt-dlp error (code ${code}):`, stderr);
        if (stderr.includes("Video unavailable")) {
          return reject(
            new AppError(ERROR_CODES.VIDEO_UNAVAILABLE, "El vídeo no está disponible.")
          );
        }
        return reject(
          new AppError(
            ERROR_CODES.INTERNAL_ERROR,
            "Error al obtener metadatos del vídeo."
          )
        );
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
        reject(
          new AppError(
            ERROR_CODES.DEPENDENCY_MISSING,
            ERROR_MESSAGES.DEPENDENCY_MISSING,
            500
          )
        );
      } else {
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
