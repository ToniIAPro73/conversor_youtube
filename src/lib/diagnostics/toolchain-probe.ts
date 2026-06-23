/**
 * Toolchain probe service — executes real binary probes with shell: false.
 * Results are cached for PROBE_TTL_MS and can be refreshed manually.
 * Each probe validates: binary exists, exits with code 0, version matches pattern.
 */

import { spawn } from "child_process";
import path from "path";
import fs from "fs";
import { CONFIG } from "@/lib/config";
import { isAncloraWindowsRuntime } from "@/lib/runtime-platform";

// Resolve the pdftoppm binary from a Poppler directory.
// Windows Poppler distributions may place the binary in Library\bin\ or bin\.
export function resolvePopplerBinary(
  dir: string,
  isWindows = isAncloraWindowsRuntime(),
  existsSync: (path: string) => boolean = fs.existsSync
): string {
  if (!dir) return isWindows ? "pdftoppm.exe" : "pdftoppm";
  if (isWindows) {
    const candidates = [
      path.join(dir, "Library", "bin", "pdftoppm.exe"),
      path.join(dir, "bin", "pdftoppm.exe"),
      path.join(dir, "pdftoppm.exe"),
    ];
    for (const c of candidates) {
      if (existsSync(c)) return c;
    }
    return path.join(dir, "pdftoppm.exe");
  }
  return path.join(dir, "pdftoppm");
}

// Platform-aware installation hints shown when a tool is unavailable.
export function getRecommendedAction(linuxHint: string, windowsHint: string): string {
  return isAncloraWindowsRuntime() ? windowsHint : linuxHint;
}

export function getLibreOfficeProbeArgs(): string[] {
  return isAncloraWindowsRuntime() ? ["--headless", "--version"] : ["--version"];
}

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
  /**
   * Describes the tool's role in the portable distribution:
   * - `required`: essential for the core workflow (YouTube/basic conversion). Absence is a real error.
   * - `included`: bundled in the portable; absence is unexpected.
   * - `optional`: additional capability not included in the base portable; absence is NOT an error.
   * - `unexpected-missing`: should be present per the manifest but wasn't found; diagnostic error.
   */
  portableInclusion: "required" | "included" | "optional" | "unexpected-missing";
  /** Human-readable explanation shown only when portableInclusion === 'optional' and the tool is absent. */
  optionalDescription?: string;
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

export async function probeDiagnosticBinary(
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
  portableInclusion: ToolProbeResult["portableInclusion"];
  optionalDescription?: string;
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
          portableInclusion: "required",
          recommendedAction: getRecommendedAction(
            "Instala yt-dlp: pip install yt-dlp",
            "Incluido en el portable — descárgalo de nuevo si falta: yt-dlp.org"
          ),
        },
        binary: bins.ytdlp,
      },
      {
        def: {
          id: "ffmpeg", displayName: "FFmpeg",
          args: ["-version"], versionPattern: "ffmpeg version (\\S+)",
          group: "media", requiredFor: ["audio", "video", "gif", "thumbnail"],
          portableInclusion: "required",
          recommendedAction: getRecommendedAction(
            "Instala FFmpeg desde ffmpeg.org",
            "Incluido en el portable — descárgalo de nuevo si falta: ffmpeg.org"
          ),
        },
        binary: bins.ffmpeg,
      },
      {
        def: {
          id: "ffprobe", displayName: "FFprobe",
          args: ["-version"], versionPattern: "ffprobe version (\\S+)",
          group: "media", requiredFor: ["media-analysis"],
          portableInclusion: "required",
          recommendedAction: getRecommendedAction(
            "FFprobe se instala junto con FFmpeg",
            "Incluido en el portable junto con FFmpeg"
          ),
        },
        binary: bins.ffprobe,
      },
      {
        def: {
          id: "qpdf", displayName: "QPDF",
          args: ["--version"], versionPattern: "qpdf version (\\d+\\.\\d+\\.\\d+)",
          group: "document", requiredFor: ["pdf"],
          portableInclusion: "included",
          recommendedAction: getRecommendedAction(
            "sudo apt install qpdf",
            "Incluido en el portable — descárgalo de nuevo si falta: qpdf.sourceforge.net"
          ),
        },
        binary: bins.qpdf,
      },
      {
        def: {
          id: "sevenzip", displayName: "7-Zip",
          args: ["i"], versionPattern: "7-Zip (?:\\([az]\\) )?(\\d+\\.\\d+)",
          group: "archive", requiredFor: ["archive"],
          portableInclusion: "included",
          recommendedAction: getRecommendedAction(
            "sudo apt install p7zip-full",
            "Incluido en el portable — descárgalo de nuevo si falta: 7-zip.org"
          ),
        },
        binary: bins.sevenzip,
      },
      {
        def: {
          id: "pandoc", displayName: "Pandoc",
          args: ["--version"], versionPattern: "pandoc (\\d+\\.\\d+\\.\\d+)",
          group: "document", requiredFor: ["document"],
          portableInclusion: "included",
          recommendedAction: getRecommendedAction(
            "Descarga desde pandoc.org",
            "Incluido en el portable — descárgalo de nuevo si falta: pandoc.org"
          ),
        },
        binary: bins.pandoc,
      },
      {
        def: {
          id: "libreoffice", displayName: "LibreOffice",
          // --headless prevents GUI initialization on Windows; ignored gracefully on Linux.
          args: getLibreOfficeProbeArgs(),
          versionPattern: "LibreOffice (\\d+\\.\\d+\\.\\d+(?:\\.\\d+)?)",
          group: "document", requiredFor: ["office-conversion"],
          portableInclusion: "optional",
          optionalDescription: "Conversión de documentos Office (DOCX, XLSX, PPTX). Instala LibreOffice para habilitar esta función.",
          recommendedAction: getRecommendedAction(
            "sudo apt install libreoffice",
            "Instala LibreOffice desde libreoffice.org (se detecta en C:\\Program Files\\LibreOffice)"
          ),
        },
        binary: bins.libreoffice,
      },
      {
        def: {
          id: "calibre", displayName: "Calibre",
          args: ["--version"], versionPattern: "calibre (\\d+\\.\\d+\\.\\d+)",
          group: "ebook", requiredFor: ["ebook"],
          portableInclusion: "optional",
          optionalDescription: "Conversión de libros electrónicos (EPUB, MOBI). Instala Calibre para habilitar esta función.",
          recommendedAction: getRecommendedAction(
            "Instala Calibre desde calibre-ebook.com",
            "Instala Calibre desde calibre-ebook.com (se detecta en C:\\Program Files\\Calibre2)"
          ),
        },
        binary: bins.calibre,
      },
      {
        def: {
          id: "tesseract", displayName: "Tesseract OCR",
          args: ["--version"], versionPattern: "tesseract (\\d+\\.\\d+\\.\\d+)",
          group: "ocr", requiredFor: ["ocr-image", "ocr-pdf"],
          portableInclusion: "optional",
          optionalDescription: "Reconocimiento de texto en imágenes (OCR). Instala Tesseract para habilitar esta función.",
          recommendedAction: getRecommendedAction(
            "sudo apt install tesseract-ocr tesseract-ocr-spa tesseract-ocr-eng",
            "Instala Tesseract desde github.com/UB-Mannheim/tesseract (se detecta en C:\\Program Files\\Tesseract-OCR)"
          ),
        },
        binary: bins.tesseract,
      },
      {
        def: {
          id: "poppler", displayName: "Poppler (pdftoppm)",
          args: ["-v"], versionPattern: "pdftoppm version (\\d+\\.\\d+\\.\\d+)",
          group: "ocr", requiredFor: ["ocr-pdf", "pdf-to-image"],
          portableInclusion: "optional",
          optionalDescription: "Conversión de PDF a imagen. Instala Poppler para habilitar esta función.",
          recommendedAction: getRecommendedAction(
            "sudo apt install poppler-utils",
            "Descarga Poppler para Windows desde github.com/oschwartz10612/poppler-windows y colócalo en tools\\poppler\\ (el portable buscará en Library\\bin\\ y bin\\). Las conversiones PDF→imagen y OCR de PDF quedarán deshabilitadas sin esta herramienta."
          ),
        },
        // Resolve binary from directory: checks Library\bin\, bin\, and root on Windows.
        binary: resolvePopplerBinary(bins.poppler),
      },
    ];

    const results = await Promise.all(
      probes.map(async ({ def, binary }): Promise<ToolProbeResult> => {
        const probe = await probeDiagnosticBinary(binary, def.args, def.versionPattern);
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
          portableInclusion: def.portableInclusion,
          ...(def.optionalDescription !== undefined ? { optionalDescription: def.optionalDescription } : {}),
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
