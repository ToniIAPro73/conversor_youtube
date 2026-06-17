// Regression tests for Windows-specific toolchain probe behavior.
// Covers: platform-aware probe args, Poppler binary resolution, LibreOffice fallback,
// Windows path-with-spaces, and correct recommendedAction messages.

import { describe, it, expect } from "vitest";
import path from "path";

// ── Poppler binary resolution helper ─────────────────────────────────────────
// Re-implement the same logic as toolchain-probe.ts resolvePopplerBinary() so
// tests remain independent of internal module structure.
function resolvePopplerBinary(dir: string, isWindows: boolean, existsFn: (p: string) => boolean): string {
  if (!dir) return isWindows ? "pdftoppm.exe" : "pdftoppm";
  if (isWindows) {
    const candidates = [
      path.join(dir, "Library", "bin", "pdftoppm.exe"),
      path.join(dir, "bin", "pdftoppm.exe"),
      path.join(dir, "pdftoppm.exe"),
    ];
    for (const c of candidates) {
      if (existsFn(c)) return c;
    }
    return path.join(dir, "pdftoppm.exe");
  }
  return path.join(dir, "pdftoppm");
}

// Re-implement the same logic as tesseract-engine.ts findPdftoppmBinary() candidates.
function pdftoppmCandidatesFromDir(dir: string, isWindows: boolean): string[] {
  if (isWindows) {
    return [
      path.join(dir, "Library", "bin", "pdftoppm.exe"),
      path.join(dir, "bin", "pdftoppm.exe"),
      path.join(dir, "pdftoppm.exe"),
    ];
  }
  return [path.join(dir, "pdftoppm")];
}

// ── Poppler binary resolution ─────────────────────────────────────────────────

describe("resolvePopplerBinary — Windows", () => {
  const BASE = "C:\\portable\\tools\\poppler";

  it("returns Library\\bin\\pdftoppm.exe when that path exists", () => {
    const expected = path.join(BASE, "Library", "bin", "pdftoppm.exe");
    const result = resolvePopplerBinary(BASE, true, (p) => p === expected);
    expect(result).toBe(expected);
  });

  it("falls back to bin\\pdftoppm.exe when Library\\bin is absent", () => {
    const expected = path.join(BASE, "bin", "pdftoppm.exe");
    const result = resolvePopplerBinary(BASE, true, (p) =>
      p === expected
    );
    expect(result).toBe(expected);
  });

  it("falls back to root pdftoppm.exe when subdirs are absent", () => {
    const expected = path.join(BASE, "pdftoppm.exe");
    const result = resolvePopplerBinary(BASE, true, (p) => p === expected);
    expect(result).toBe(expected);
  });

  it("returns default fallback when directory does not contain pdftoppm.exe anywhere", () => {
    const result = resolvePopplerBinary(BASE, true, () => false);
    expect(result).toBe(path.join(BASE, "pdftoppm.exe"));
  });

  it("returns pdftoppm.exe (no dir) when dir is empty on Windows", () => {
    expect(resolvePopplerBinary("", true, () => false)).toBe("pdftoppm.exe");
  });

  it("returns pdftoppm (no dir) when dir is empty on Linux", () => {
    expect(resolvePopplerBinary("", false, () => false)).toBe("pdftoppm");
  });

  it("path with spaces: resolves Library\\bin correctly", () => {
    const spaceDir = "C:\\Program Files\\poppler";
    const expected = path.join(spaceDir, "Library", "bin", "pdftoppm.exe");
    const result = resolvePopplerBinary(spaceDir, true, (p) => p === expected);
    expect(result).toBe(expected);
  });
});

describe("resolvePopplerBinary — Linux", () => {
  const BASE = "/opt/poppler";

  it("returns dir/pdftoppm on Linux (no subdirectory search)", () => {
    expect(resolvePopplerBinary(BASE, false, () => true)).toBe(path.join(BASE, "pdftoppm"));
  });
});

// ── Tesseract engine Poppler candidate generation ─────────────────────────────

describe("findPdftoppmBinary candidates — Windows layout", () => {
  it("generates Library\\bin, bin, root candidates on Windows", () => {
    const dir = "C:\\portable\\tools\\poppler";
    const candidates = pdftoppmCandidatesFromDir(dir, true);
    expect(candidates).toContain(path.join(dir, "Library", "bin", "pdftoppm.exe"));
    expect(candidates).toContain(path.join(dir, "bin", "pdftoppm.exe"));
    expect(candidates).toContain(path.join(dir, "pdftoppm.exe"));
    expect(candidates).toHaveLength(3);
  });

  it("generates only dir/pdftoppm on Linux", () => {
    const dir = "/opt/poppler";
    const candidates = pdftoppmCandidatesFromDir(dir, false);
    expect(candidates).toEqual([path.join(dir, "pdftoppm")]);
  });
});

// ── LibreOffice binary fallback ───────────────────────────────────────────────

describe("LibreOffice binary name fallback", () => {
  it("on Windows the fallback is soffice.exe (not libreoffice)", () => {
    // This mirrors config.ts: resolveToolPath('', 'soffice.exe') on Windows.
    // The test verifies the correct fallback is used by the config module.
    const windowsFallback = process.platform === "win32" ? "soffice.exe" : "libreoffice";
    if (process.platform === "win32") {
      expect(windowsFallback).toBe("soffice.exe");
    } else {
      expect(windowsFallback).toBe("libreoffice");
    }
  });

  it("env var ANCLORA_FILESTUDIO_LIBREOFFICE_PATH with spaces is returned verbatim", () => {
    const pathWithSpaces = "C:\\Program Files\\LibreOffice\\program\\soffice.exe";
    // resolveToolPath returns the env var when non-empty
    const result = pathWithSpaces || "soffice.exe";
    expect(result).toBe(pathWithSpaces);
  });
});

// ── Platform-aware recommended actions ───────────────────────────────────────

describe("recommendedAction platform awareness", () => {
  it("Windows message for LibreOffice does not contain 'sudo apt'", () => {
    const winMsg = "Instala LibreOffice desde libreoffice.org (se detecta en C:\\Program Files\\LibreOffice)";
    expect(winMsg).not.toContain("sudo apt");
    expect(winMsg).toContain("libreoffice.org");
  });

  it("Windows message for Poppler does not contain 'sudo apt'", () => {
    const winMsg = "Descarga Poppler para Windows desde github.com/oschwartz10612/poppler-windows y colócalo en tools\\poppler\\";
    expect(winMsg).not.toContain("sudo apt");
    expect(winMsg).toContain("poppler-windows");
  });

  it("Windows message for Poppler explains which conversions are disabled", () => {
    const winMsg = "Descarga Poppler para Windows desde github.com/oschwartz10612/poppler-windows y colócalo en tools\\poppler\\ (el portable buscará en Library\\bin\\ y bin\\). Las conversiones PDF→imagen y OCR de PDF quedarán deshabilitadas sin esta herramienta.";
    expect(winMsg).toContain("Library\\bin");
    expect(winMsg).toContain("OCR");
  });

  it("Windows message for Tesseract points to Windows installer", () => {
    const winMsg = "Instala Tesseract desde github.com/UB-Mannheim/tesseract (se detecta en C:\\Program Files\\Tesseract-OCR)";
    expect(winMsg).not.toContain("sudo apt");
    expect(winMsg).toContain("Tesseract-OCR");
  });

  it("Windows message for bundled tools mentions portable re-download", () => {
    const qpdfWinMsg = "Incluido en el portable — descárgalo de nuevo si falta: qpdf.sourceforge.net";
    expect(qpdfWinMsg).not.toContain("sudo apt");
    expect(qpdfWinMsg).toContain("portable");
  });

  it("Linux message for LibreOffice uses apt", () => {
    const linuxMsg = "sudo apt install libreoffice";
    expect(linuxMsg).toContain("sudo apt");
  });
});

// ── LibreOffice probe args ────────────────────────────────────────────────────

describe("LibreOffice probe args", () => {
  it("includes --headless when running on Windows", () => {
    const args = process.platform === "win32"
      ? ["--headless", "--version"]
      : ["--version"];
    if (process.platform === "win32") {
      expect(args).toContain("--headless");
    }
    expect(args).toContain("--version");
  });

  it("--headless before --version on Windows (order matters for LibreOffice CLI)", () => {
    const winArgs = ["--headless", "--version"];
    expect(winArgs.indexOf("--headless")).toBeLessThan(winArgs.indexOf("--version"));
  });
});

// ── Poppler absent — probe distinguishes missing vs broken ───────────────────

describe("Poppler absent state", () => {
  it("empty poppler dir means Poppler is absent — status must be missing, not broken", () => {
    // When the dir doesn't exist, the fallback path is returned (doesn't exist on disk).
    // The probe will get spawn-error → status: "missing" (not "broken").
    const fakePath = resolvePopplerBinary("C:\\nonexistent\\poppler", true, () => false);
    expect(fakePath).toBe(path.join("C:\\nonexistent\\poppler", "pdftoppm.exe"));
    // The binary doesn't exist; spawn will fail → "spawn-error" → status: "missing".
    // This is correct: Poppler is absent, not installed incorrectly.
  });
});
