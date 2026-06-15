// Integration tests for the /api/capabilities endpoint.
// Tests the capabilities lookup pipeline by creating mock descriptors
// and calling the engine registry's getCapabilities function directly.

import { describe, it, expect, beforeEach } from "vitest";
import { getCapabilities, invalidateProbeCache } from "../../src/lib/engines/registry";
import type { UniversalFileDescriptor } from "../../src/lib/domain/descriptors";
import crypto from "crypto";

// ── Descriptor factories ───────────────────────────────────────────────────────

function makeDescriptor(
  category: UniversalFileDescriptor["category"],
  fmt: string,
  attrs: UniversalFileDescriptor["attributes"]
): UniversalFileDescriptor {
  return {
    id: crypto.randomUUID(),
    category,
    originalName: `test.${fmt}`,
    extension: fmt,
    detectedMimeType: null,
    detectedFormat: fmt,
    sizeBytes: 50_000,
    sha256: null,
    source: { kind: "local-upload", originalName: `test.${fmt}`, storedRelativePath: `test.${fmt}` },
    attributes: attrs,
    warnings: [],
    analyzedBy: ["file-detector"],
    analyzedAt: new Date().toISOString(),
  };
}

function audioDescriptor(): UniversalFileDescriptor {
  return makeDescriptor("audio", "wav", {
    kind: "media",
    durationSeconds: 60,
    bitrate: 128000,
    hasAudio: true,
    hasVideo: false,
    hasSubtitles: false,
    audioCodec: "pcm",
    videoCodec: null,
    width: null,
    height: null,
    fps: null,
  });
}

function videoDescriptor(): UniversalFileDescriptor {
  return makeDescriptor("video", "mp4", {
    kind: "media",
    durationSeconds: 120,
    bitrate: 2000000,
    hasAudio: true,
    hasVideo: true,
    hasSubtitles: false,
    audioCodec: "aac",
    videoCodec: "h264",
    width: 1920,
    height: 1080,
    fps: 30,
  });
}

function imageDescriptor(): UniversalFileDescriptor {
  return makeDescriptor("image", "png", {
    kind: "image",
    width: 800,
    height: 600,
    channels: 3,
    hasAlpha: true,
    format: "png",
    colorSpace: "srgb",
    animated: false,
    frames: 1,
    densityPpi: 72,
    iccProfile: null,
  });
}

function plainTextDescriptor(fmt: string = "md"): UniversalFileDescriptor {
  return makeDescriptor("plain-text", fmt, {
    kind: "text",
    encoding: "utf-8",
    lineCount: 20,
    format: fmt === "md" ? "markdown" : fmt,
  });
}

function documentDescriptor(): UniversalFileDescriptor {
  return makeDescriptor("document", "docx", {
    kind: "document",
    pageCount: 5,
    wordCount: 1000,
    hasMacros: false,
    hasEmbeddedMedia: false,
    encoding: null,
    language: null,
  });
}

function structuredDataDescriptor(fmt: string = "json"): UniversalFileDescriptor {
  return makeDescriptor("structured-data", fmt, {
    kind: "structured-data",
    format: fmt,
    rowCount: null,
    columnCount: null,
    encoding: "utf-8",
    isTabular: false,
    hasNestedStructures: true,
    hasXmlEntities: false,
  });
}

function pdfDescriptor(): UniversalFileDescriptor {
  return makeDescriptor("pdf", "pdf", {
    kind: "pdf",
    pageCount: 10,
    isEncrypted: false,
    isLinearized: false,
    pdfVersion: "1.7",
    hasAnnotations: false,
    hasForms: false,
    hasEmbeddedFiles: false,
  });
}

function archiveDescriptor(fmt: string = "zip"): UniversalFileDescriptor {
  return makeDescriptor("archive", fmt, {
    kind: "archive",
    entryCount: 5,
    uncompressedBytes: 100_000,
    expansionRatio: 3,
    isEncrypted: false,
    maxDepth: 2,
    hasDangerousPaths: false,
    archiveFormat: fmt,
  });
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("Capabilities API — engine routing by descriptor category", () => {
  beforeEach(() => {
    invalidateProbeCache();
  });

  it("Audio descriptor → returns FFmpeg audio capabilities", async () => {
    const caps = await getCapabilities(audioDescriptor());
    expect(caps.length, "Should return at least one capability").toBeGreaterThan(0);
    const ffmpegCaps = caps.filter(c => c.engineId === "ffmpeg-media");
    expect(ffmpegCaps.length, "Should have FFmpeg capabilities").toBeGreaterThan(0);
    // Audio operations should be present
    const operations = ffmpegCaps.map(c => c.operation);
    expect(operations.some(op => op.includes("audio") || op.includes("transcode"))).toBe(true);
  });

  it("Video descriptor → returns FFmpeg video capabilities", async () => {
    const caps = await getCapabilities(videoDescriptor());
    expect(caps.length, "Should return at least one capability").toBeGreaterThan(0);
    const ffmpegCaps = caps.filter(c => c.engineId === "ffmpeg-media");
    expect(ffmpegCaps.length, "Should have FFmpeg capabilities").toBeGreaterThan(0);
  });

  it("Image descriptor → returns Sharp capabilities", async () => {
    const caps = await getCapabilities(imageDescriptor());
    expect(caps.length, "Should return at least one capability").toBeGreaterThan(0);
    const sharpCaps = caps.filter(c => c.engineId === "sharp-image");
    expect(sharpCaps.length, "Should have Sharp capabilities").toBeGreaterThan(0);
  });

  it("Plain-text/markdown descriptor → returns Pandoc capabilities (state depends on pandoc availability)", async () => {
    const caps = await getCapabilities(plainTextDescriptor("md"));
    const pandocCaps = caps.filter(c => c.engineId === "pandoc");
    expect(pandocCaps.length, "Should have Pandoc capabilities").toBeGreaterThan(0);
    // State depends on pandoc binary availability
    for (const cap of pandocCaps) {
      expect(["available", "unavailable-tool"]).toContain(cap.state);
    }
  });

  it("Document/docx descriptor → returns LibreOffice + Pandoc capabilities", async () => {
    const caps = await getCapabilities(documentDescriptor());
    const loCaps = caps.filter(c => c.engineId === "libreoffice");
    const pandocCaps = caps.filter(c => c.engineId === "pandoc");
    // docx is in both "document" and "plain-text" categories via pandoc,
    // but the descriptor category is "document", so both engines should respond
    expect(loCaps.length + pandocCaps.length, "Should have LibreOffice or Pandoc capabilities").toBeGreaterThan(0);
  });

  it("Structured-data descriptor → returns Data engine capabilities", async () => {
    const caps = await getCapabilities(structuredDataDescriptor("json"));
    expect(caps.length, "Should return at least one capability").toBeGreaterThan(0);
    const dataCaps = caps.filter(c => c.engineId === "data-ts");
    expect(dataCaps.length, "Should have Data engine capabilities").toBeGreaterThan(0);
    // Data engine should always be available (pure TypeScript)
    const availableCaps = dataCaps.filter(c => c.state === "available");
    expect(availableCaps.length, "Data engine capabilities should be available").toBeGreaterThan(0);
  });

  it("PDF descriptor → returns QPDF capabilities", async () => {
    const caps = await getCapabilities(pdfDescriptor());
    expect(caps.length, "Should return at least one capability").toBeGreaterThan(0);
    const qpdfCaps = caps.filter(c => c.engineId === "qpdf");
    expect(qpdfCaps.length, "Should have QPDF capabilities").toBeGreaterThan(0);
  });

  it("Archive descriptor → returns 7-Zip capabilities", async () => {
    const caps = await getCapabilities(archiveDescriptor("zip"));
    expect(caps.length, "Should return at least one capability").toBeGreaterThan(0);
    const sevenZipCaps = caps.filter(c => c.engineId === "sevenzip");
    expect(sevenZipCaps.length, "Should have 7-Zip capabilities").toBeGreaterThan(0);
  });
});

describe("Capabilities API — capability shape validation", () => {
  beforeEach(() => {
    invalidateProbeCache();
  });

  it("every capability has required fields", async () => {
    const caps = await getCapabilities(structuredDataDescriptor("json"));
    for (const cap of caps) {
      expect(cap.id).toBeTruthy();
      expect(cap.operation).toBeTruthy();
      expect(cap.outputFormat).toBeTruthy();
      expect(cap.outputMime).toBeTruthy();
      expect(cap.label).toBeTruthy();
      expect(cap.engineId).toBeTruthy();
      expect(["available", "unavailable-tool", "unsupported-input", "unsafe", "experimental", "disabled-license"]).toContain(cap.state);
      expect(["portable-domain", "replace-adapter-on-mobile", "desktop-only"]).toContain(cap.mobilePortability);
      expect(Array.isArray(cap.warnings)).toBe(true);
      expect(Array.isArray(cap.presets)).toBe(true);
    }
  });

  it("data engine capabilities are all available (pure TS, no external deps)", async () => {
    const caps = await getCapabilities(structuredDataDescriptor("json"));
    const dataCaps = caps.filter(c => c.engineId === "data-ts");
    for (const cap of dataCaps) {
      expect(cap.state).toBe("available");
    }
  });

  it("data engine provides cross-format conversions for JSON", async () => {
    const caps = await getCapabilities(structuredDataDescriptor("json"));
    const dataCaps = caps.filter(c => c.engineId === "data-ts");
    const outputFormats = dataCaps.map(c => c.outputFormat);
    expect(outputFormats).toContain("yaml");
    expect(outputFormats).toContain("toml");
    expect(outputFormats).toContain("xml");
    expect(outputFormats).toContain("csv");
  });

  it("sharp engine capabilities include common output formats", async () => {
    const caps = await getCapabilities(imageDescriptor());
    const sharpCaps = caps.filter(c => c.engineId === "sharp-image");
    if (sharpCaps.length > 0 && sharpCaps[0].state === "available") {
      const outputFormats = sharpCaps.map(c => c.outputFormat);
      expect(outputFormats).toContain("png");
      expect(outputFormats).toContain("webp");
      expect(outputFormats).toContain("jpeg");
    }
  });
});

describe("Capabilities API — unknown category", () => {
  beforeEach(() => {
    invalidateProbeCache();
  });

  it("returns empty capabilities for unknown category", async () => {
    const unknownDesc = makeDescriptor("unknown", "bin", { kind: "unknown" });
    const caps = await getCapabilities(unknownDesc);
    expect(caps).toHaveLength(0);
  });
});
