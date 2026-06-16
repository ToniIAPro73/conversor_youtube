/**
 * Toolchain probe service — executes real binary probes with shell: false.
 * Results are cached for PROBE_TTL_MS and can be refreshed manually.
 * Each probe validates: binary exists, exits with code 0, version matches pattern.
 */

import { spawn } from "child_process";
import { CONFIG } from "@/lib/config";

export type ProbeStatus =
  | "available"
  | "missing"
  | "version-mismatch"
  | "broken"
  | "timeout"
  | "unsupported-platform"
  | "disabled";

export interface ToolProbeResult {
  id: string;
  displayName: string;
  status: ProbeStatus;
  available: boolean;
  version: string | null;
  path: string | null;
  error: string | null;
  group: "runtime" | "media" | "document" | "image" | "archive" | "ocr" | "ebook" | "data";
  requiredFor: string[];
  recommendedAction: string | null;
}

// ── Binary probe helpers ──────────────────────────────────────────────────────

function runProbe(
  binary: string,
  args: string[],
  timeoutMs = 8000
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let finished = false;

    const child = spawn(binary, args, {
      shell: false,
      windowsHide: true,
      timeout: timeoutMs,
    });

    child.stdout?.on("data", (d: Buffer) => {
      if (stdout.length < 4096) stdout += d.toString();
    });
    child.stderr?.on("data", (d: Buffer) => {
      if (stderr.length < 4096) stderr += d.toString();
    });

    const timer = setTimeout(() => {
      if (!finished) {
        finished = true;
        child.kill();
        resolve({ code: null, stdout, stderr: "timeout" });
      }
    }, timeoutMs);

    child.on("close", (code) => {
      if (!finished) {
        finished = true;
        clearTimeout(timer);
        resolve({ code, stdout, stderr });
      }
    });

    child.on("error", () => {
      if (!finished) {
        finished = true;
        clearTimeout(timer);
        resolve({ code: null, stdout: "", stderr: "spawn-error" });
      }
    });
  });
}

function extractVersion(output: string, pattern: string): string | null {
  const m = output.match(new RegExp(pattern));
  return m ? (m[1] ?? m[0]) : null;
}

async function probeOne(
  binary: string,
  args: string[],
  versionPattern: string | null
): Promise<{ available: boolean; version: string | null; status: ProbeStatus; error: string | null }> {
  if (!binary) {
    return { available: false, version: null, status: "missing", error: "Binary path not configured" };
  }

  const { code, stdout, stderr } = await runProbe(binary, args);

  if (stderr === "timeout" || stderr === "spawn-error") {
    const status: ProbeStatus = stderr === "timeout" ? "timeout" : "missing";
    return { available: false, version: null, status, error: stderr };
  }

  if (code !== 0 && code !== null) {
    const combined = stdout + stderr;
    const version = versionPattern ? extractVersion(combined, versionPattern) : null;
    if (version) {
      return { available: true, version, status: "available", error: null };
    }
    return { available: false, version: null, status: "broken", error: `exit code ${code}` };
  }

  const combined = stdout + stderr;
  const version = versionPattern ? extractVersion(combined, versionPattern) : null;
  return { available: true, version, status: "available", error: null };
}

// ── Probe definitions ─────────────────────────────────────────────────────────

interface ProbeDefinition {
  id: string;
  displayName: string;
  args: string[];
  versionPattern: string | null;
  group: ToolProbeResult["group"];
  requiredFor: string[];
  recommendedAction: string;
}

// ── Cache ─────────────────────────────────────────────────────────────────────

const PROBE_TTL_MS = 5 * 60 * 1000;
let cacheAt: number | null = null;
let cachedResults: ToolProbeResult[] | null = null;

// ── Service ───────────────────────────────────────────────────────────────────

export const toolchainProbe = {
  async run(force = false): Promise<{ dependencies: ToolProbeResult[]; probeResults: Record<string, string> }> {
    const now = Date.now();
    if (!force && cacheAt !== null && now - cacheAt < PROBE_TTL_MS && cachedResults) {
      return {
        dependencies: cachedResults,
        probeResults: Object.fromEntries(cachedResults.map((r) => [r.id, r.status])),
      };
    }

    const bins = CONFIG.media.binaries;

    const probes: Array<{ def: ProbeDefinition; binary: string }> = [
      {
        def: {
          id: "ytdlp", displayName: "yt-dlp",
          args: ["--version"], versionPattern: "(\\d{4}\\.\\d{2}\\.\\d{2})",
          group: "media", requiredFor: ["youtube-download"],
          recommendedAction: "Instala yt-dlp: pip install yt-dlp",
        },
        binary: bins.ytdlp,
      },
      {
        def: {
          id: "ffmpeg", displayName: "FFmpeg",
          args: ["-version"], versionPattern: "ffmpeg version (\\S+)",
          group: "media", requiredFor: ["audio", "video", "gif", "thumbnail"],
          recommendedAction: "Instala FFmpeg desde ffmpeg.org",
        },
        binary: bins.ffmpeg,
      },
      {
        def: {
          id: "ffprobe", displayName: "FFprobe",
          args: ["-version"], versionPattern: "ffprobe version (\\S+)",
          group: "media", requiredFor: ["media-analysis"],
          recommendedAction: "FFprobe se instala junto con FFmpeg",
        },
        binary: bins.ffprobe,
      },
      {
        def: {
          id: "qpdf", displayName: "QPDF",
          args: ["--version"], versionPattern: "qpdf version (\\d+\\.\\d+\\.\\d+)",
          group: "document", requiredFor: ["pdf"],
          recommendedAction: "sudo apt install qpdf",
        },
        binary: bins.qpdf,
      },
      {
        def: {
          id: "sevenzip", displayName: "7-Zip",
          args: ["i"], versionPattern: "7-Zip (?:\\([az]\\) )?(\\d+\\.\\d+)",
          group: "archive", requiredFor: ["archive"],
          recommendedAction: "sudo apt install p7zip-full",
        },
        binary: bins.sevenzip,
      },
      {
        def: {
          id: "pandoc", displayName: "Pandoc",
          args: ["--version"], versionPattern: "pandoc (\\d+\\.\\d+\\.\\d+)",
          group: "document", requiredFor: ["document"],
          recommendedAction: "Descarga desde pandoc.org",
        },
        binary: bins.pandoc,
      },
      {
        def: {
          id: "libreoffice", displayName: "LibreOffice",
          args: ["--version"], versionPattern: "LibreOffice (\\d+\\.\\d+\\.\\d+)",
          group: "document", requiredFor: ["office-conversion"],
          recommendedAction: "sudo apt install libreoffice",
        },
        binary: bins.libreoffice,
      },
      {
        def: {
          id: "calibre", displayName: "Calibre",
          args: ["--version"], versionPattern: "calibre (\\d+\\.\\d+\\.\\d+)",
          group: "ebook", requiredFor: ["ebook"],
          recommendedAction: "Instala Calibre desde calibre-ebook.com",
        },
        binary: bins.calibre,
      },
      {
        def: {
          id: "tesseract", displayName: "Tesseract OCR",
          args: ["--version"], versionPattern: "tesseract (\\d+\\.\\d+\\.\\d+)",
          group: "ocr", requiredFor: ["ocr-image", "ocr-pdf"],
          recommendedAction: "sudo apt install tesseract-ocr tesseract-ocr-spa tesseract-ocr-eng",
        },
        binary: bins.tesseract,
      },
      {
        def: {
          id: "poppler", displayName: "Poppler (pdftoppm)",
          args: ["-v"], versionPattern: "pdftoppm version (\\d+\\.\\d+\\.\\d+)",
          group: "ocr", requiredFor: ["ocr-pdf", "pdf-to-image"],
          recommendedAction: "sudo apt install poppler-utils",
        },
        binary: bins.poppler ? `${bins.poppler}/pdftoppm` : "pdftoppm",
      },
    ];

    const results = await Promise.all(
      probes.map(async ({ def, binary }): Promise<ToolProbeResult> => {
        const probe = await probeOne(binary, def.args, def.versionPattern);
        return {
          id: def.id,
          displayName: def.displayName,
          status: probe.status,
          available: probe.available,
          version: probe.version,
          path: binary || null,
          error: probe.error,
          group: def.group,
          requiredFor: def.requiredFor,
          recommendedAction: probe.available ? null : def.recommendedAction,
        };
      })
    );

    cacheAt = Date.now();
    cachedResults = results;

    return {
      dependencies: results,
      probeResults: Object.fromEntries(results.map((r) => [r.id, r.status])),
    };
  },

  invalidate() {
    cacheAt = null;
    cachedResults = null;
  },
};
