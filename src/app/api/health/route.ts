import { NextResponse } from "next/server";
import fs from "fs";
import { CONFIG } from "@/lib/config";
import { diagnoseAllEngines } from "@/lib/engines/registry";

export const dynamic = "force-dynamic";

interface HealthDependency {
  name: string;
  available: boolean;
  version: string | null;
  path: string | null;
  status: "ok" | "missing" | "error";
  recommendedAction: string | null;
}

export async function GET() {
  const dependencies: HealthDependency[] = [];

  // ── Node.js ───────────────────────────────────────────────────────────────
  dependencies.push({
    name: "Node.js",
    available: true,
    version: process.version,
    path: process.execPath,
    status: "ok",
    recommendedAction: null,
  });

  // ── yt-dlp ────────────────────────────────────────────────────────────────
  const ytdlpOk = fileExists(CONFIG.media.binaries.ytdlp);
  dependencies.push({
    name: "yt-dlp",
    available: ytdlpOk,
    version: null,
    path: CONFIG.media.binaries.ytdlp,
    status: ytdlpOk ? "ok" : "missing",
    recommendedAction: ytdlpOk ? null : "Instala yt-dlp: pip install yt-dlp o descarga desde github.com/yt-dlp/yt-dlp",
  });

  // ── FFmpeg ────────────────────────────────────────────────────────────────
  const ffmpegOk = fileExists(CONFIG.media.binaries.ffmpeg);
  dependencies.push({
    name: "FFmpeg",
    available: ffmpegOk,
    version: null,
    path: CONFIG.media.binaries.ffmpeg,
    status: ffmpegOk ? "ok" : "missing",
    recommendedAction: ffmpegOk ? null : "Instala FFmpeg: ffmpeg.org o usa el paquete portable",
  });

  // ── FFprobe ───────────────────────────────────────────────────────────────
  const ffprobeOk = fileExists(CONFIG.media.binaries.ffprobe);
  dependencies.push({
    name: "FFprobe",
    available: ffprobeOk,
    version: null,
    path: CONFIG.media.binaries.ffprobe,
    status: ffprobeOk ? "ok" : "missing",
    recommendedAction: ffprobeOk ? null : "FFprobe se instala junto con FFmpeg",
  });

  // ── Engine registry diagnostics ──────────────────────────────────────────
  try {
    const engineDiags = await diagnoseAllEngines();

    for (const diag of engineDiags) {
      // Map engine IDs to user-friendly names
      const engineName = ENGINE_DISPLAY_NAMES[diag.engineId] ?? diag.engineId;
      const isAvailable = diag.enabled && diag.probe.available;
      const recommendedAction = getRecommendedAction(diag.engineId, diag.probe.available, diag.enabled);

      dependencies.push({
        name: engineName,
        available: isAvailable,
        version: diag.probe.version,
        path: redactPath(diag.probe.binaryPath),
        status: isAvailable ? "ok" : (diag.probe.error ? "error" : "missing"),
        recommendedAction,
      });
    }
  } catch (err) {
    // If engine diagnostics fail, still return the legacy deps
    console.error("[health] Engine diagnostics failed:", err);
  }

  const allOk = dependencies.every((d) => d.available);
  // Only consider critical deps for overall status (yt-dlp, ffmpeg, ffprobe)
  const criticalOk = ytdlpOk && ffmpegOk && ffprobeOk;

  return NextResponse.json(
    {
      ok: criticalOk,
      app: "Link2Media",
      status: allOk ? "ready" : (criticalOk ? "degraded" : "degraded"),
      dependencies,
      summary: {
        total: dependencies.length,
        available: dependencies.filter((d) => d.available).length,
        missing: dependencies.filter((d) => !d.available).length,
      },
    },
    { status: 200 }
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const ENGINE_DISPLAY_NAMES: Record<string, string> = {
  "sharp-image": "Sharp (Node.js)",
  "data-ts": "Data Engine (Node.js)",
  "qpdf": "QPDF",
  "sevenzip": "7-Zip",
  "pandoc": "Pandoc",
  "libreoffice": "LibreOffice",
};

function getRecommendedAction(
  engineId: string,
  available: boolean,
  enabled: boolean
): string | null {
  if (available && enabled) return null;
  if (!enabled) return `Motor ${ENGINE_DISPLAY_NAMES[engineId] ?? engineId} está deshabilitado`;

  const actions: Record<string, string> = {
    "sharp-image": "Ejecuta: pnpm add sharp",
    "data-ts": "Ejecuta: pnpm add yaml smol-toml fast-xml-parser csv-parse csv-stringify",
    "qpdf": "Instala QPDF: qpdf.sourceforge.net o usa el paquete portable",
    "sevenzip": "Instala 7-Zip: 7-zip.org o usa el paquete portable",
    "pandoc": "Instala Pandoc: pandoc.org o usa el paquete portable",
    "libreoffice": "Instala LibreOffice: libreoffice.org o usa el paquete portable",
  };

  return actions[engineId] ?? null;
}

function redactPath(binaryPath: string | null): string | null {
  if (!binaryPath) return null;
  // Redact absolute paths to show only the last 2 segments
  const parts = binaryPath.split(/[/\\]/);
  if (parts.length > 3) {
    return `.../${parts.slice(-2).join("/")}`;
  }
  return binaryPath;
}

function fileExists(binaryPath: string): boolean {
  // If the path is just a command name (no separators), assume it's on PATH
  if (!binaryPath.includes("/") && !binaryPath.includes("\\")) {
    return true;
  }
  try {
    return fs.existsSync(binaryPath);
  } catch {
    return false;
  }
}
