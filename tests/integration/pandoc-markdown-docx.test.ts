// Integration test for Pandoc markdown→docx conversion.
// Requires Pandoc to be installed on the system. Skips gracefully if not available.
// Validates the full pipeline: file → engine.execute() → DOCX artifact validation.
// Input files are copied to the temp dir (as in production) to satisfy path safety.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PandocEngine } from "../../src/lib/engines/document/pandoc-engine";
import { CONFIG } from "../../src/lib/config";
import type {
  ConversionPlan,
  EngineProbeResult,
} from "../../src/lib/domain/engines";
import crypto from "crypto";
import fs from "fs";
import path from "path";

const engine = new PandocEngine();
let probeResult: EngineProbeResult;
let testDir: string;

beforeAll(async () => {
  probeResult = await engine.probe();
  testDir = path.join(
    CONFIG.media.tempDir,
    "tests",
    `integ-pandoc-${crypto.randomUUID()}`,
  );
  fs.mkdirSync(testDir, { recursive: true });
});

afterAll(() => {
  if (testDir && fs.existsSync(testDir)) {
    fs.rmSync(testDir, { recursive: true, force: true });
  }
});

/** Copy a fixture into the test temp dir (required by path safety). */
function copyFixture(fixtureName: string): string {
  const fixtureDir = path.resolve(__dirname, "..", "fixtures");
  const src = path.join(fixtureDir, fixtureName);
  const inputDir = path.join(testDir, "uploads", crypto.randomUUID());
  fs.mkdirSync(inputDir, { recursive: true });
  const dest = path.join(inputDir, fixtureName);
  fs.copyFileSync(src, dest);
  return dest;
}

describe("PandocEngine — markdown→docx integration", () => {
  it("converts sample.md to docx with valid output", async () => {
    if (!probeResult.available) return;

    const inputPath = copyFixture("sample.md");
    const jobDir = path.join(testDir, "job-sample");
    fs.mkdirSync(jobDir, { recursive: true });
    const outputPath = path.join(jobDir, "output.docx");

    const plan: ConversionPlan = {
      jobId: "integ-sample-md-docx",
      engineId: "pandoc",
      operation: "convert-document",
      inputPath,
      outputPath,
      outputFormat: "docx",
      options: { inputFormat: "md" },
      args: [],
      env: {},
      timeoutMs: 60_000,
      estimatedSizeBytes: null,
    };

    const result = await engine.execute(plan);

    expect(result.success, `Execute failed: ${result.error}`).toBe(true);
    expect(result.outputSizeBytes).toBeGreaterThan(0);
    expect(fs.existsSync(outputPath)).toBe(true);

    // Validate DOCX is a valid ZIP (PK header)
    const header = Buffer.alloc(4);
    const fd = fs.openSync(outputPath, "r");
    fs.readSync(fd, header, 0, 4, 0);
    fs.closeSync(fd);
    expect(header[0]).toBe(0x50); // P
    expect(header[1]).toBe(0x4b); // K
    expect(header[2]).toBe(0x03);
    expect(header[3]).toBe(0x04);
  });

  it("converts Prompt_Maestro_Desktop_PRO.md to docx", async () => {
    if (!probeResult.available) return;

    const inputPath = copyFixture("Prompt_Maestro_Desktop_PRO.md");
    const jobDir = path.join(testDir, "job-prompt-maestro");
    fs.mkdirSync(jobDir, { recursive: true });
    const outputPath = path.join(jobDir, "Prompt_Maestro_Desktop_PRO.docx");

    const plan: ConversionPlan = {
      jobId: "integ-prompt-maestro-docx",
      engineId: "pandoc",
      operation: "convert-document",
      inputPath,
      outputPath,
      outputFormat: "docx",
      options: { inputFormat: "markdown" },
      args: [],
      env: {},
      timeoutMs: 60_000,
      estimatedSizeBytes: null,
    };

    const result = await engine.execute(plan);

    expect(result.success, `Execute failed: ${result.error}`).toBe(true);
    expect(result.outputSizeBytes).toBeGreaterThan(1000);
    expect(fs.existsSync(outputPath)).toBe(true);

    const stat = fs.statSync(outputPath);
    expect(stat.size).toBeGreaterThan(1000);
    expect(stat.size).toBeLessThan(500_000);
  });

  it("validates output passes engine validation", async () => {
    if (!probeResult.available) return;

    const inputPath = copyFixture("sample.md");
    const jobDir = path.join(testDir, "job-validate");
    fs.mkdirSync(jobDir, { recursive: true });
    const outputPath = path.join(jobDir, "validated.docx");

    const plan: ConversionPlan = {
      jobId: "integ-validate-docx",
      engineId: "pandoc",
      operation: "convert-document",
      inputPath,
      outputPath,
      outputFormat: "docx",
      options: { inputFormat: "md" },
      args: [],
      env: {},
      timeoutMs: 60_000,
      estimatedSizeBytes: null,
    };

    const execResult = await engine.execute(plan);
    expect(execResult.success).toBe(true);

    const validation = await engine.validate(outputPath, plan);
    expect(validation.valid).toBe(true);
    expect(validation.checks.every((c) => c.passed)).toBe(true);
  });

  it("uses markdown reader for detectedFormat=markdown", async () => {
    if (!probeResult.available) return;

    const inputContent =
      "# Bug Regression Test\n\nThis tests the markdown detectedFormat path.";
    const inputDir = path.join(testDir, "uploads", "detected-format-test");
    fs.mkdirSync(inputDir, { recursive: true });
    const inputPath = path.join(inputDir, "test.md");
    fs.writeFileSync(inputPath, inputContent, "utf-8");

    const jobDir = path.join(testDir, "job-detected-format");
    fs.mkdirSync(jobDir, { recursive: true });
    const outputPath = path.join(jobDir, "output.docx");

    const plan: ConversionPlan = {
      jobId: "integ-detected-format",
      engineId: "pandoc",
      operation: "convert-document",
      inputPath,
      outputPath,
      outputFormat: "docx",
      options: { inputFormat: "markdown" },
      args: [],
      env: {},
      timeoutMs: 60_000,
      estimatedSizeBytes: null,
    };

    const result = await engine.execute(plan);
    expect(result.success, `Execute failed: ${result.error}`).toBe(true);
    expect(result.outputSizeBytes).toBeGreaterThan(0);
  });
});
