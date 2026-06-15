// Unit tests for the Sharp image conversion engine.
// Tests: capability matrix, security gates, output format tagging.
// Note: actual image conversion tests require sharp to be installed.

import { describe, it, expect } from "vitest";
import { SharpEngine } from "../../src/lib/engines/image/sharp-engine";
import type { UniversalFileDescriptor, ImageAttributes } from "../../src/lib/domain/descriptors";
import type { EngineProbeResult } from "../../src/lib/domain/engines";
import crypto from "crypto";

function makeImageDescriptor(
  fmt: string,
  overrides: Partial<ImageAttributes> = {}
): UniversalFileDescriptor {
  const attrs: ImageAttributes = {
    kind: "image",
    width: 1920,
    height: 1080,
    channels: 3,
    hasAlpha: false,
    format: fmt,
    colorSpace: "srgb",
    animated: false,
    frames: 1,
    densityPpi: 72,
    iccProfile: null,
    ...overrides,
  };
  return {
    id: crypto.randomUUID(),
    category: "image",
    originalName: `test.${fmt}`,
    extension: fmt,
    detectedMimeType: `image/${fmt}`,
    detectedFormat: fmt,
    sizeBytes: 100_000,
    sha256: null,
    source: { kind: "local-upload", originalName: `test.${fmt}`, storedRelativePath: `test.${fmt}` },
    attributes: attrs,
    warnings: [],
    analyzedBy: ["file-detector"],
    analyzedAt: new Date().toISOString(),
  };
}

const AVAILABLE_PROBE: EngineProbeResult = {
  available: true,
  version: "sharp@3.0.0",
  binaryPath: "sharp (npm)",
  capabilities: ["jpeg", "png", "webp", "avif", "tiff", "gif"],
};

const UNAVAILABLE_PROBE: EngineProbeResult = {
  available: false,
  version: null,
  binaryPath: null,
  capabilities: [],
  error: "sharp not installed",
};

describe("SharpEngine — capabilities", () => {
  const engine = new SharpEngine();

  it("returns no capabilities for non-image category", () => {
    const desc = { ...makeImageDescriptor("jpeg"), category: "pdf" as const };
    expect(engine.getCapabilities(desc, AVAILABLE_PROBE)).toHaveLength(0);
  });

  it("returns 6 output formats for JPEG input", () => {
    const caps = engine.getCapabilities(makeImageDescriptor("jpeg"), AVAILABLE_PROBE);
    expect(caps.length).toBe(6);
  });

  it("returns 6 output formats for PNG input (including self)", () => {
    const caps = engine.getCapabilities(makeImageDescriptor("png"), AVAILABLE_PROBE);
    expect(caps.length).toBe(6);
    expect(caps.map((c) => c.outputFormat)).toContain("png");
  });

  it("marks WebP as recommended", () => {
    const caps = engine.getCapabilities(makeImageDescriptor("jpeg"), AVAILABLE_PROBE);
    const webp = caps.find((c) => c.outputFormat === "webp");
    expect(webp?.recommended).toBe(true);
  });

  it("tags JPEG as lossy", () => {
    const caps = engine.getCapabilities(makeImageDescriptor("png"), AVAILABLE_PROBE);
    const jpeg = caps.find((c) => c.outputFormat === "jpeg");
    expect(jpeg?.lossProfile).toBe("lossy");
  });

  it("tags PNG as lossless", () => {
    const caps = engine.getCapabilities(makeImageDescriptor("jpeg"), AVAILABLE_PROBE);
    const png = caps.find((c) => c.outputFormat === "png");
    expect(png?.lossProfile).toBe("lossless");
  });

  it("warns about JPEG transparency when input has alpha channel", () => {
    const desc = makeImageDescriptor("png", { hasAlpha: true });
    const caps = engine.getCapabilities(desc, AVAILABLE_PROBE);
    const jpeg = caps.find((c) => c.outputFormat === "jpeg");
    expect(jpeg?.warnings.length).toBeGreaterThan(0);
    expect(jpeg?.warnings[0]).toMatch(/transparencia/i);
  });

  it("returns unavailable-tool when sharp not installed", () => {
    const caps = engine.getCapabilities(makeImageDescriptor("jpeg"), UNAVAILABLE_PROBE);
    expect(caps.every((c) => c.state === "unavailable-tool")).toBe(true);
  });

  it("rejects oversized images (> 256 megapixels)", () => {
    // 20000x20000 = 400 MP
    const desc = makeImageDescriptor("jpeg", { width: 20000, height: 20000 });
    const caps = engine.getCapabilities(desc, AVAILABLE_PROBE);
    expect(caps).toHaveLength(0);
  });

  it("rejects animated images with too many frames", () => {
    const desc = makeImageDescriptor("gif", { animated: true, frames: 201 });
    const caps = engine.getCapabilities(desc, AVAILABLE_PROBE);
    expect(caps).toHaveLength(0);
  });

  it("accepts animated GIF under frame limit", () => {
    const desc = makeImageDescriptor("gif", { animated: true, frames: 50 });
    const caps = engine.getCapabilities(desc, AVAILABLE_PROBE);
    expect(caps.length).toBeGreaterThan(0);
  });

  it("warns about GIF for non-animated images", () => {
    const caps = engine.getCapabilities(makeImageDescriptor("png", { animated: false }), AVAILABLE_PROBE);
    const gif = caps.find((c) => c.outputFormat === "gif");
    expect(gif?.warnings.length).toBeGreaterThan(0);
  });

  it("provides quality presets for WebP output", () => {
    const caps = engine.getCapabilities(makeImageDescriptor("jpeg"), AVAILABLE_PROBE);
    const webp = caps.find((c) => c.outputFormat === "webp");
    expect(webp?.presets.length).toBeGreaterThanOrEqual(2);
    const recommended = webp?.presets.find((p) => p.isRecommended);
    expect(recommended).toBeDefined();
  });

  it("all capabilities carry the sharp-image engineId", () => {
    const caps = engine.getCapabilities(makeImageDescriptor("jpeg"), AVAILABLE_PROBE);
    expect(caps.every((c) => c.engineId === "sharp-image")).toBe(true);
  });

  it("rejects unsupported input format (SVG)", () => {
    const desc = makeImageDescriptor("svg");
    const caps = engine.getCapabilities(desc, AVAILABLE_PROBE);
    expect(caps).toHaveLength(0);
  });
});
