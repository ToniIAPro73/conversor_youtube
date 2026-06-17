// Regression tests for capability-routing.ts
// Covers the bug where sharp-convert-* and ffmpeg-*-* were not routed to their engines.

import { describe, it, expect } from "vitest";
import {
  extractEngineIdFromCapabilityId,
  extractOutputFormatFromCapabilityId,
} from "../../src/lib/jobs/capability-routing";
import { SharpEngine } from "../../src/lib/engines/image/sharp-engine";
import type { UniversalFileDescriptor, ImageAttributes } from "../../src/lib/domain/descriptors";
import type { EngineProbeResult } from "../../src/lib/domain/engines";

// ── extractEngineIdFromCapabilityId ──────────────────────────────────────────

describe("extractEngineIdFromCapabilityId", () => {
  const id = "abc123def456";

  it("sharp-convert-* → sharp-image", () => {
    expect(extractEngineIdFromCapabilityId(`sharp-convert-${id}-webp`)).toBe("sharp-image");
    expect(extractEngineIdFromCapabilityId(`sharp-convert-${id}-jpeg`)).toBe("sharp-image");
    expect(extractEngineIdFromCapabilityId(`sharp-convert-${id}-avif`)).toBe("sharp-image");
  });

  it("ffmpeg-convert-* → ffmpeg-media", () => {
    expect(extractEngineIdFromCapabilityId(`ffmpeg-convert-${id}-wav-mp3`)).toBe("ffmpeg-media");
    expect(extractEngineIdFromCapabilityId(`ffmpeg-convert-${id}-mp4-webm`)).toBe("ffmpeg-media");
  });

  it("ffmpeg-normalize-* → ffmpeg-media", () => {
    expect(extractEngineIdFromCapabilityId(`ffmpeg-normalize-${id}-wav-mp3`)).toBe("ffmpeg-media");
  });

  it("ffmpeg-extract-audio-* → ffmpeg-media", () => {
    expect(extractEngineIdFromCapabilityId(`ffmpeg-extract-audio-${id}`)).toBe("ffmpeg-media");
  });

  it("ffmpeg-gif-* → ffmpeg-media", () => {
    expect(extractEngineIdFromCapabilityId(`ffmpeg-gif-${id}`)).toBe("ffmpeg-media");
  });

  it("ffmpeg-thumbnail-* → ffmpeg-media", () => {
    expect(extractEngineIdFromCapabilityId(`ffmpeg-thumbnail-${id}`)).toBe("ffmpeg-media");
  });

  it("ffmpeg-trim-* → ffmpeg-media", () => {
    expect(extractEngineIdFromCapabilityId(`ffmpeg-trim-${id}`)).toBe("ffmpeg-media");
  });

  it("ffmpeg-subtitles-* → ffmpeg-media", () => {
    expect(extractEngineIdFromCapabilityId(`ffmpeg-subtitles-${id}`)).toBe("ffmpeg-media");
  });

  it("data-ts-* → data-ts", () => {
    expect(extractEngineIdFromCapabilityId(`data-ts-${id}-json-yaml`)).toBe("data-ts");
  });

  it("qpdf-* → qpdf", () => {
    expect(extractEngineIdFromCapabilityId(`qpdf-${id}-linearize`)).toBe("qpdf");
  });

  it("calibre-* → calibre", () => {
    expect(extractEngineIdFromCapabilityId(`calibre-${id}-epub-mobi`)).toBe("calibre");
  });

  it("libreoffice-* → libreoffice", () => {
    expect(extractEngineIdFromCapabilityId(`libreoffice-${id}-docx-pdf`)).toBe("libreoffice");
  });

  it("sevenzip-* → sevenzip", () => {
    expect(extractEngineIdFromCapabilityId(`sevenzip-${id}-repack-zip`)).toBe("sevenzip");
  });

  it("pandoc-* → pandoc", () => {
    expect(extractEngineIdFromCapabilityId(`pandoc-${id}-markdown-html`)).toBe("pandoc");
  });

  it("tesseract-* → tesseract", () => {
    expect(extractEngineIdFromCapabilityId(`tesseract-${id}-image-txt`)).toBe("tesseract");
  });

  it("exact engine ID match → same ID", () => {
    expect(extractEngineIdFromCapabilityId("sharp-image")).toBe("sharp-image");
    expect(extractEngineIdFromCapabilityId("ffmpeg-media")).toBe("ffmpeg-media");
    expect(extractEngineIdFromCapabilityId("data-ts")).toBe("data-ts");
  });
});

// ── extractOutputFormatFromCapabilityId ──────────────────────────────────────

describe("extractOutputFormatFromCapabilityId", () => {
  const id = "abc123def456";

  it("extracts webp from sharp-convert-*-webp", () => {
    expect(extractOutputFormatFromCapabilityId(`sharp-convert-${id}-webp`)).toBe("webp");
  });

  it("extracts mp3 from ffmpeg-convert-*-wav-mp3", () => {
    expect(extractOutputFormatFromCapabilityId(`ffmpeg-convert-${id}-wav-mp3`)).toBe("mp3");
  });

  it("extracts yaml from data-ts-*-json-yaml", () => {
    expect(extractOutputFormatFromCapabilityId(`data-ts-${id}-json-yaml`)).toBe("yaml");
  });

  it("returns null for unknown format suffix", () => {
    expect(extractOutputFormatFromCapabilityId(`something-${id}-zzzzz`)).toBeNull();
  });
});

// ── SharpEngine capability ID format ─────────────────────────────────────────

describe("SharpEngine capability ID format matches routing", () => {
  const engine = new SharpEngine();
  const descriptorId = "test-descriptor-abc";

  const descriptor: UniversalFileDescriptor = {
    id: descriptorId,
    category: "image",
    originalName: "test.png",
    extension: "png",
    detectedMimeType: "image/png",
    detectedFormat: "png",
    sizeBytes: 1000,
    sha256: null,
    source: { kind: "local-upload", originalName: "test.png", storedRelativePath: "test.png" },
    attributes: {
      kind: "image",
      width: 100,
      height: 100,
      channels: 3,
      hasAlpha: false,
      format: "png",
      colorSpace: "srgb",
      animated: false,
      frames: 1,
      densityPpi: 72,
      iccProfile: null,
    } as ImageAttributes,
    warnings: [],
    analyzedBy: ["file-detector"],
    analyzedAt: new Date().toISOString(),
  };

  const probe: EngineProbeResult = {
    available: true,
    version: "0.35.1",
    binaryPath: "sharp@0.35.1 (libvips 8.18.3)",
    capabilities: ["jpeg", "png", "webp", "avif", "tiff", "gif"],
  };

  it("generates capability IDs starting with sharp-convert-", () => {
    const caps = engine.getCapabilities(descriptor, probe);
    expect(caps.length).toBeGreaterThan(0);
    for (const cap of caps) {
      expect(cap.id).toMatch(/^sharp-convert-/);
    }
  });

  it("PNG→WebP capability ID resolves to sharp-image engine", () => {
    const caps = engine.getCapabilities(descriptor, probe);
    const webpCap = caps.find((c) => c.outputFormat === "webp");
    expect(webpCap).toBeDefined();
    expect(webpCap!.id).toBe(`sharp-convert-${descriptorId}-webp`);
    expect(extractEngineIdFromCapabilityId(webpCap!.id)).toBe("sharp-image");
  });

  it("output format extracted from WebP capability ID is webp", () => {
    const caps = engine.getCapabilities(descriptor, probe);
    const webpCap = caps.find((c) => c.outputFormat === "webp");
    expect(webpCap).toBeDefined();
    expect(extractOutputFormatFromCapabilityId(webpCap!.id)).toBe("webp");
  });

  it("all capability IDs correctly resolve to sharp-image", () => {
    const caps = engine.getCapabilities(descriptor, probe);
    for (const cap of caps) {
      expect(extractEngineIdFromCapabilityId(cap.id)).toBe("sharp-image");
    }
  });
});
