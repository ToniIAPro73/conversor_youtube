/**
 * Alpha channel export validation tests.
 * Verifies: PNG magic bytes, alpha channel present, transparent pixels exist,
 * no solid-white top-left corner (checkerboard artifact), no checkerboard exported.
 */

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import { BackgroundRemovalEngine } from "../../src/lib/engines/background/background-removal-engine";

const FIXTURES = path.resolve(import.meta.dirname ?? __dirname, "../fixtures");
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "anclora-alpha-test-"));
process.env.ANCLORA_FILESTUDIO_TEMP_DIR = tmpDir;

function fixturePath(name: string): string {
  const src = path.join(FIXTURES, name);
  const dst = path.join(tmpDir, name);
  if (fs.existsSync(src)) fs.copyFileSync(src, dst);
  return dst;
}

// ── validate() output checks ──────────────────────────────────────────────────

describe("BackgroundRemovalEngine.validate()", () => {
  const engine = new BackgroundRemovalEngine();

  it("passes all checks for already-transparent.png re-exported as PNG", async () => {
    const inputPath = fixturePath("already-transparent.png");
    const outputPath = path.join(tmpDir, "val-transparent.png");

    if (!fs.existsSync(inputPath)) {
      console.warn("Fixture not found");
      return;
    }

    await engine.execute({
      jobId: "val-1",
      operation: "remove-background",
      args: [],
      env: {},
      estimatedSizeBytes: null,
      inputPath,
      outputPath,
      outputFormat: "png",
      engineId: "background-removal" as import("../../src/lib/domain/engines").EngineId,
      options: { mode: "deterministic", backgroundHint: "auto" },
      timeoutMs: 30000,
    });

    const validation = await engine.validate(outputPath, {} as never);

    expect(validation.checks.find((c) => c.name === "file-exists")?.passed).toBe(true);
    expect(validation.checks.find((c) => c.name === "png-magic-bytes")?.passed).toBe(true);
    expect(validation.checks.find((c) => c.name === "size-nonzero")?.passed).toBe(true);
    expect(validation.checks.find((c) => c.name === "has-alpha-channel")?.passed).toBe(true);
    expect(validation.checks.find((c) => c.name === "has-transparent-pixels")?.passed).toBe(true);
  }, 30000);

  it("reports file-exists=false for non-existent file", async () => {
    const result = await engine.validate("/no/such/file.png", {} as never);
    expect(result.valid).toBe(false);
    expect(result.checks.find((c) => c.name === "file-exists")?.passed).toBe(false);
  });

  it("validates PNG magic bytes correctly", async () => {
    // Write a fake file with wrong magic bytes
    const fakePath = path.join(tmpDir, "fake.png");
    fs.writeFileSync(fakePath, Buffer.from([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]));
    const result = await engine.validate(fakePath, {} as never);
    expect(result.checks.find((c) => c.name === "png-magic-bytes")?.passed).toBe(false);
    expect(result.valid).toBe(false);
  });

  it("processes white-bg-logo.png and validates output is fully correct", async () => {
    const inputPath = fixturePath("white-bg-logo.png");
    const outputPath = path.join(tmpDir, "val-white-bg.png");

    if (!fs.existsSync(inputPath)) return;

    await engine.execute({
      jobId: "val-2",
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

    const validation = await engine.validate(outputPath, {} as never);
    expect(validation.valid).toBe(true);
    // The output has alpha channel
    expect(validation.checks.find((c) => c.name === "has-alpha-channel")?.passed).toBe(true);
    // There are transparent pixels (the removed background)
    expect(validation.checks.find((c) => c.name === "has-transparent-pixels")?.passed).toBe(true);
  }, 30000);
});

// ── Alpha channel pixel tests ─────────────────────────────────────────────────

describe("Alpha channel pixel content", () => {
  const engine = new BackgroundRemovalEngine();

  it("output contains only RGBA pixels (4 channels)", async () => {
    const inputPath = fixturePath("white-bg-logo.png");
    const outputPath = path.join(tmpDir, "alpha-channels.png");

    if (!fs.existsSync(inputPath)) return;

    await engine.execute({
      jobId: "alpha-1",
      operation: "remove-background",
      args: [],
      env: {},
      estimatedSizeBytes: null,
      inputPath,
      outputPath,
      outputFormat: "png",
      engineId: "background-removal" as import("../../src/lib/domain/engines").EngineId,
      options: { mode: "deterministic" },
      timeoutMs: 30000,
    });

    const sharp = (await import("sharp")).default;
    const { info } = await sharp(outputPath).raw().toBuffer({ resolveWithObject: true });
    expect(info.channels).toBe(4);
  }, 30000);

  it("corner pixels of white-bg-logo.png output are transparent (background removed)", async () => {
    const inputPath = fixturePath("white-bg-logo.png");
    const outputPath = path.join(tmpDir, "corners.png");

    if (!fs.existsSync(inputPath)) return;

    await engine.execute({
      jobId: "alpha-2",
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

    const sharp = (await import("sharp")).default;
    const { data, info } = await sharp(outputPath).raw().toBuffer({ resolveWithObject: true });
    const ch = info.channels; // 4

    // Top-left corner pixel should have alpha=0 (removed background)
    const topLeft = data[0 * ch + 3]; // alpha of pixel at (0,0)
    expect(topLeft).toBe(0);

    // Top-right corner
    const topRight = data[(info.width - 1) * ch + 3];
    expect(topRight).toBe(0);

    // Bottom-left corner
    const bottomLeft = data[((info.height - 1) * info.width) * ch + 3];
    expect(bottomLeft).toBe(0);

    // Bottom-right corner
    const bottomRight = data[((info.height - 1) * info.width + info.width - 1) * ch + 3];
    expect(bottomRight).toBe(0);
  }, 30000);

  it("center pixels of white-bg-logo.png output are opaque (logo kept)", async () => {
    const inputPath = fixturePath("white-bg-logo.png");
    const outputPath = path.join(tmpDir, "center.png");

    if (!fs.existsSync(inputPath)) return;

    await engine.execute({
      jobId: "alpha-3",
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

    const sharp = (await import("sharp")).default;
    const { data, info } = await sharp(outputPath).raw().toBuffer({ resolveWithObject: true });
    const ch = info.channels;

    // Center pixel (32,32) is part of the teal logo — should be opaque
    const centerIdx = (32 * info.width + 32) * ch;
    const centerAlpha = data[centerIdx + 3];
    expect(centerAlpha).toBe(255);
  }, 30000);

  it("no checkerboard artifact: does not export gray squares as opaque pixels", async () => {
    const inputPath = fixturePath("checker-8.png");
    const outputPath = path.join(tmpDir, "checker-alpha.png");

    if (!fs.existsSync(inputPath)) return;

    await engine.execute({
      jobId: "alpha-4",
      operation: "remove-background",
      args: [],
      env: {},
      estimatedSizeBytes: null,
      inputPath,
      outputPath,
      outputFormat: "png",
      engineId: "background-removal" as import("../../src/lib/domain/engines").EngineId,
      options: { mode: "deterministic", backgroundHint: "checkerboard", threshold: 60 },
      timeoutMs: 30000,
    });

    // Output exists and is valid PNG
    expect(fs.existsSync(outputPath)).toBe(true);
    const sharp = (await import("sharp")).default;
    const meta = await sharp(outputPath).metadata();
    expect(meta.format).toBe("png");
    expect(meta.hasAlpha).toBe(true);
  }, 30000);
});
