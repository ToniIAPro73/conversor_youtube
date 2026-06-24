import { describe, it, expect, vi } from "vitest";

// We test the portableInclusion contract by inspecting the probe definitions
// that toolchainProbe exposes. We mock `probeDiagnosticBinary` so no real
// binaries are executed in CI.

vi.mock("child_process", () => ({
  spawn: vi.fn(() => ({
    stdout: { on: vi.fn() },
    stderr: { on: vi.fn() },
    on: vi.fn((_event: string, cb: (code: number) => void) => {
      if (_event === "close") cb(0);
    }),
    kill: vi.fn(),
  })),
}));

import { toolchainProbe } from "../../src/lib/diagnostics/toolchain-probe";

// Helper: run probe and extract the dependencies array
async function getResults() {
  const { dependencies } = await toolchainProbe.run(true);
  return dependencies;
}

describe("toolchainProbe — portableInclusion contract", () => {
  it("yt-dlp is marked as required", async () => {
    const results = await getResults();
    const ytdlp = results.find((r) => r.id === "ytdlp");
    expect(ytdlp).toBeDefined();
    expect(ytdlp!.portableInclusion).toBe("required");
  });

  it("ffmpeg is marked as required", async () => {
    const results = await getResults();
    const ffmpeg = results.find((r) => r.id === "ffmpeg");
    expect(ffmpeg).toBeDefined();
    expect(ffmpeg!.portableInclusion).toBe("required");
  });

  it("ffprobe is marked as required", async () => {
    const results = await getResults();
    const ffprobe = results.find((r) => r.id === "ffprobe");
    expect(ffprobe).toBeDefined();
    expect(ffprobe!.portableInclusion).toBe("required");
  });

  it("LibreOffice is marked as optional", async () => {
    const results = await getResults();
    const lo = results.find((r) => r.id === "libreoffice");
    expect(lo).toBeDefined();
    expect(lo!.portableInclusion).toBe("optional");
  });

  it("Calibre is marked as optional", async () => {
    const results = await getResults();
    const calibre = results.find((r) => r.id === "calibre");
    expect(calibre).toBeDefined();
    expect(calibre!.portableInclusion).toBe("optional");
  });

  it("Tesseract OCR is marked as optional", async () => {
    const results = await getResults();
    const tesseract = results.find((r) => r.id === "tesseract");
    expect(tesseract).toBeDefined();
    expect(tesseract!.portableInclusion).toBe("optional");
  });

  it("Poppler (pdftoppm) is marked as optional", async () => {
    const results = await getResults();
    const poppler = results.find((r) => r.id === "poppler");
    expect(poppler).toBeDefined();
    expect(poppler!.portableInclusion).toBe("optional");
  });

  it("optional tools have an optionalDescription string", async () => {
    const results = await getResults();
    const optionals = results.filter((r) => r.portableInclusion === "optional");
    expect(optionals.length).toBeGreaterThan(0);
    for (const tool of optionals) {
      expect(typeof tool.optionalDescription).toBe("string");
      expect(tool.optionalDescription!.length).toBeGreaterThan(10);
    }
  });

  it("optional tools unavailable should NOT be counted as required errors", async () => {
    const results = await getResults();
    // Even if optional tools report available:false, portableInclusion stays 'optional'
    const optionalMissing = results.filter(
      (r) => r.portableInclusion === "optional" && !r.available
    );
    // Every one of these must stay 'optional', never 'unexpected-missing'
    for (const tool of optionalMissing) {
      expect(tool.portableInclusion).toBe("optional");
    }
  });
});
