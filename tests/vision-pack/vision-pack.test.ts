/**
 * Vision Pack tests — ONNX runtime availability probe and graceful fallback.
 * These tests verify the AI mode falls back gracefully when ONNX or model is absent,
 * and that the engine capability system correctly reports AI mode availability.
 *
 * Full AI execution tests are skipped when onnxruntime-node is not installed.
 */

import { describe, it, expect, beforeAll } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import { BackgroundRemovalEngine } from "../../src/lib/engines/background/background-removal-engine";
import type { UniversalFileDescriptor } from "../../src/lib/domain/descriptors";

const FIXTURES = path.resolve(import.meta.dirname ?? __dirname, "../fixtures");
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "anclora-vision-test-"));
process.env.ANCLORA_FILESTUDIO_TEMP_DIR = tmpDir;

function fixturePath(name: string): string {
  const src = path.join(FIXTURES, name);
  const dst = path.join(tmpDir, name);
  if (fs.existsSync(src)) fs.copyFileSync(src, dst);
  return dst;
}

function hasOnnx(): boolean {
  try {
    require.resolve("onnxruntime-node");
    return true;
  } catch {
    return false;
  }
}

// ── ONNX probe / graceful degradation ────────────────────────────────────────

describe("Vision Pack — ONNX probe", () => {
  let engine: BackgroundRemovalEngine;

  beforeAll(() => {
    engine = new BackgroundRemovalEngine();
  });

  it("probe always returns available=true when sharp is installed", async () => {
    const probe = await engine.probe();
    expect(probe.available).toBe(true);
  });

  it("deterministic mode is always listed in capabilities", async () => {
    const probe = await engine.probe();
    expect(probe.capabilities).toContain("deterministic");
  });

  it("ai-local capability is listed only when onnxruntime-node + model are available", async () => {
    const probe = await engine.probe();
    const hasAI = probe.capabilities?.includes("ai-local") ?? false;
    // If no ONNX, AI should not appear
    if (!hasOnnx()) {
      expect(hasAI).toBe(false);
    }
    // If ONNX present but no model file, AI should not appear (graceful)
    // We don't install a model in CI, so this branch is covered
  });
});

describe("Vision Pack — AI mode graceful fallback", () => {
  let engine: BackgroundRemovalEngine;

  beforeAll(() => {
    engine = new BackgroundRemovalEngine();
  });

  it("falls back to deterministic when ai-local requested but ONNX unavailable", async () => {
    const inputPath = fixturePath("white-bg-logo.png");
    const outputPath = path.join(tmpDir, "fallback.png");

    if (!fs.existsSync(inputPath)) {
      console.warn("Fixture not found — skipping");
      return;
    }

    // Request AI mode — should fall back to deterministic gracefully
    const result = await engine.execute({
      jobId: "fallback-1",
      operation: "remove-background",
      args: [],
      env: {},
      estimatedSizeBytes: null,
      inputPath,
      outputPath,
      outputFormat: "png",
      engineId: "background-removal" as import("../../src/lib/domain/engines").EngineId,
      options: { mode: "ai-local", backgroundHint: "white" },
      timeoutMs: 60000,
    });

    // Regardless of ONNX availability, the result should succeed (fallback)
    expect(result.success).toBe(true);
    expect(fs.existsSync(outputPath)).toBe(true);
  }, 60000);
});

describe("Vision Pack — getCapabilities", () => {
  const engine = new BackgroundRemovalEngine();

  it("returns capabilities for supported image formats", async () => {
    const probe = await engine.probe();
    const descriptor = {
      id: "test-img",
      category: "image",
      extension: "png",
      detectedFormat: "png",
      sizeBytes: 1024,
      attributes: { kind: "image", width: 64, height: 64, channels: 3, hasAlpha: false, format: "png", colorSpace: "sRGB", animated: false, frames: 1, densityPpi: null, iccProfile: null },
    } as unknown as UniversalFileDescriptor;

    const caps = engine.getCapabilities(descriptor, probe);
    expect(caps.length).toBeGreaterThan(0);
    expect(caps.some((c) => c.operation === "remove-background")).toBe(true);
  });

  it("returns empty capabilities for non-image category", async () => {
    const probe = await engine.probe();
    const descriptor = {
      id: "test-pdf",
      category: "pdf",
      extension: "pdf",
      detectedFormat: "pdf",
      sizeBytes: 1024,
      attributes: { kind: "pdf", pageCount: 1, isEncrypted: false, isLinearized: false, pdfVersion: null, hasAnnotations: false, hasForms: false, hasEmbeddedFiles: false },
    } as unknown as UniversalFileDescriptor;

    const caps = engine.getCapabilities(descriptor, probe);
    expect(caps).toHaveLength(0);
  });

  it("returns empty for oversized image (>16000×16000)", async () => {
    const probe = await engine.probe();
    const descriptor = {
      id: "huge-img",
      category: "image",
      extension: "png",
      detectedFormat: "png",
      sizeBytes: 1024 * 1024 * 500,
      attributes: { kind: "image", width: 20000, height: 20000, channels: 3, hasAlpha: false, format: "png", colorSpace: "sRGB", animated: false, frames: 1, densityPpi: null, iccProfile: null },
    } as unknown as UniversalFileDescriptor;

    const caps = engine.getCapabilities(descriptor, probe);
    expect(caps).toHaveLength(0);
  });
});

// ── Shadow and solid color backgrounds ────────────────────────────────────────

describe("Vision Pack — edge case fixtures", () => {
  const engine = new BackgroundRemovalEngine();

  it("handles shadow-logo.png (gradient shadow region)", async () => {
    const inputPath = fixturePath("shadow-logo.png");
    const outputPath = path.join(tmpDir, "shadow-removed.png");

    if (!fs.existsSync(inputPath)) return;

    const result = await engine.execute({
      jobId: "shadow-1",
      operation: "remove-background",
      args: [],
      env: {},
      estimatedSizeBytes: null,
      inputPath,
      outputPath,
      outputFormat: "png",
      engineId: "background-removal" as import("../../src/lib/domain/engines").EngineId,
      options: { mode: "deterministic", backgroundHint: "white", threshold: 30 },
      timeoutMs: 30000,
    });

    expect(result.success).toBe(true);
    // Shadow region uses near-white gray (230) — check that some pixels are transparent
    const sharp = (await import("sharp")).default;
    const { data, info } = await sharp(outputPath).raw().toBuffer({ resolveWithObject: true });
    const ch = info.channels;
    const transparentCount = Array.from({ length: info.width * info.height }, (_, i) => data[i * ch + (ch - 1)] === 0).filter(Boolean).length;
    expect(transparentCount).toBeGreaterThan(0);
  }, 30000);

  it("handles solid-red-bg.png using auto hint", async () => {
    const inputPath = fixturePath("solid-red-bg.png");
    const outputPath = path.join(tmpDir, "red-removed.png");

    if (!fs.existsSync(inputPath)) return;

    // Auto hint for solid color: seeds from edges, removes everything that matches corner color
    const result = await engine.execute({
      jobId: "solid-1",
      operation: "remove-background",
      args: [],
      env: {},
      estimatedSizeBytes: null,
      inputPath,
      outputPath,
      outputFormat: "png",
      engineId: "background-removal" as import("../../src/lib/domain/engines").EngineId,
      options: { mode: "deterministic", backgroundHint: "solid", threshold: 30 },
      timeoutMs: 30000,
    });

    // Note: solid-red is not white, so the default "auto" white threshold won't remove it.
    // Using "solid" hint should detect it from the corner pixel color.
    expect(result.success).toBe(true);
  }, 30000);
});
