import { spawn } from "child_process";
import { CONFIG } from "../config";
import { AppError, ERROR_CODES } from "../errors";
import { MetadataResponse } from "../youtube/schemas";

interface YtdlpFormat {
  vcodec?: string;
  height?: number;
}

export async function getVideoMetadata(url: string): Promise<MetadataResponse> {
  return new Promise((resolve, reject) => {
    const args = [
      "--dump-single-json",
      "--skip-download",
      "--no-playlist",
      url,
    ];

    const process = spawn(CONFIG.media.binaries.ytdlp, args, {
      timeout: CONFIG.media.limits.metadataTimeoutSeconds * 1000,
    });

    let stdout = "";
    let stderr = "";

    process.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    process.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    process.on("close", (code) => {
      if (code !== 0) {
        console.error(`yt-dlp error (code ${code}):`, stderr);
        if (stderr.includes("Video unavailable")) {
          return reject(new AppError(ERROR_CODES.VIDEO_UNAVAILABLE, "El vídeo no está disponible."));
        }
        return reject(new AppError(ERROR_CODES.INTERNAL_ERROR, "Error al obtener metadatos del vídeo."));
      }

      try {
        const data = JSON.parse(stdout);
        
        const durationSeconds = data.duration || 0;
        if (durationSeconds > CONFIG.media.limits.maxDurationSeconds) {
          return reject(new AppError(ERROR_CODES.DURATION_LIMIT_EXCEEDED, "El vídeo excede la duración máxima permitida."));
        }

        const formats = (data.formats || []) as YtdlpFormat[];
        const availableHeights = Array.from(
          new Set(
            formats
              .filter((f) => f.vcodec !== "none" && f.height)
              .map((f) => f.height as number)
          )
        ).sort((a, b) => b - a);

        resolve({
          videoId: data.id,
          title: data.title,
          channel: data.uploader || data.channel,
          thumbnailUrl: data.thumbnail,
          durationSeconds: durationSeconds,
          durationLabel: formatDuration(durationSeconds),
          availableHeights,
          supported: true,
        });
      } catch {
        reject(new AppError(ERROR_CODES.INTERNAL_ERROR, "Error al procesar la respuesta de metadatos."));
      }
    });

    process.on("error", (err: any) => {
      if (err.code === "ENOENT") {
        reject(new AppError(ERROR_CODES.DEPENDENCY_MISSING, ERROR_MESSAGES.DEPENDENCY_MISSING, 500));
      } else {
        reject(new AppError(ERROR_CODES.INTERNAL_ERROR, "Error al ejecutar yt-dlp.", 500));
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
