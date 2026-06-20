// Unit tests for Pandoc markdown→docx conversion.
// Validates the engine execute() path, arg construction, format resolution,
// cwd usage, and --data-dir handling for portable distributions.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { PandocEngine } from "../../src/lib/engines/document/pandoc-engine";
import { ProcessRunner } from "../../src/lib/infrastructure/processes/process-runner";
import { CONFIG } from "../../src/lib/config";
import type { ConversionPlan } from "../../src/lib/domain/engines";
import crypto from "crypto";
import fs from "fs";
import path from "path";

function makePlan(overrides?: Partial<ConversionPlan>): ConversionPlan {
  const tempDir = CONFIG.media.tempDir;
  const jobId = crypto.randomUUID();
  const jobDir = path.join(tempDir, jobId);
  const inputDir = path.join(tempDir, "uploads", "test-input-id");
  const inputPath = path.join(inputDir, "sample.md");
  const outputPath = path.join(jobDir, "output.docx");

  return {
    jobId,
    engineId: "pandoc",
    operation: "convert-document",
    inputPath,
    outputPath,
    outputFormat: "docx",
    options: { inputFormat: "markdown" },
    args: [],
    env: {},
    timeoutMs: 120_000,
    estimatedSizeBytes: null,
    ...overrides,
  };
}

// Minimal DOCX (ZIP) header to pass validation
const DOCX_HEADER = Buffer.from([0x50, 0x4b, 0x03, 0x04]);

describe("PandocEngine — markdown→docx execution", () => {
  let runSpy: ReturnType<typeof vi.spyOn>;
  let tempDir: string;

  beforeEach(() => {
    tempDir = path.join(
      CONFIG.media.tempDir,
      "tests",
      `pandoc-md-docx-${crypto.randomUUID()}`,
    );
    fs.mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    runSpy?.mockRestore();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("passes correct -f markdown -t docx args to Pandoc", async () => {
    const inputDir = path.join(tempDir, "uploads", "test-id");
    const inputPath = path.join(inputDir, "test.md");
    const outputPath = path.join(tempDir, "job123", "output.docx");

    fs.mkdirSync(inputDir, { recursive: true });
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(inputPath, "# Hello\n\nWorld", "utf-8");

    const plan = makePlan({ inputPath, outputPath });

    runSpy = vi
      .spyOn(ProcessRunner.prototype, "run")
      .mockImplementation(async (_opts) => {
        // Simulate Pandoc creating DOCX output
        const docxContent = Buffer.concat([
          DOCX_HEADER,
          Buffer.alloc(100, 0x42),
        ]);
        fs.writeFileSync(outputPath, docxContent);
        return {
          exitCode: 0,
          stdout: "",
          stderr: "",
          timedOut: false,
          durationMs: 50,
        };
      });

    const engine = new PandocEngine();
    const result = await engine.execute(plan);

    expect(result.success).toBe(true);
    expect(result.outputSizeBytes).toBeGreaterThan(0);
    expect(runSpy).toHaveBeenCalledTimes(1);

    const callOpts = runSpy.mock.calls[0]![0]!;
    const fIdx = callOpts.args.indexOf("-f");
    const tIdx = callOpts.args.indexOf("-t");
    const oIdx = callOpts.args.indexOf("-o");

    expect(fIdx).toBeGreaterThanOrEqual(0);
    expect(tIdx).toBeGreaterThanOrEqual(0);
    expect(oIdx).toBeGreaterThanOrEqual(0);

    expect(callOpts.args[fIdx + 1]).toBe("markdown");
    expect(callOpts.args[tIdx + 1]).toBe("docx");
    expect(callOpts.args[oIdx + 1]).toBe(outputPath);
  });

  it("does NOT include --standalone for docx output", async () => {
    const inputDir = path.join(tempDir, "uploads", "test-id");
    const inputPath = path.join(inputDir, "test.md");
    const outputPath = path.join(tempDir, "job123", "output.docx");

    fs.mkdirSync(inputDir, { recursive: true });
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(inputPath, "# Hello", "utf-8");

    const plan = makePlan({ inputPath, outputPath });

    runSpy = vi
      .spyOn(ProcessRunner.prototype, "run")
      .mockImplementation(async () => {
        fs.writeFileSync(
          outputPath,
          Buffer.concat([DOCX_HEADER, Buffer.alloc(50)]),
        );
        return {
          exitCode: 0,
          stdout: "",
          stderr: "",
          timedOut: false,
          durationMs: 10,
        };
      });

    const engine = new PandocEngine();
    await engine.execute(plan);

    const callOpts = runSpy.mock.calls[0]![0]!;
    expect(callOpts.args).not.toContain("--standalone");
  });

  it("includes --standalone for html output", async () => {
    const inputDir = path.join(tempDir, "uploads", "test-id");
    const inputPath = path.join(inputDir, "test.md");
    const outputPath = path.join(tempDir, "job123", "output.html");

    fs.mkdirSync(inputDir, { recursive: true });
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(inputPath, "# Hello", "utf-8");

    const plan = makePlan({ inputPath, outputPath, outputFormat: "html" });

    runSpy = vi
      .spyOn(ProcessRunner.prototype, "run")
      .mockImplementation(async () => {
        fs.writeFileSync(
          outputPath,
          "<!doctype html><html><body></body></html>",
          "utf-8",
        );
        return {
          exitCode: 0,
          stdout: "",
          stderr: "",
          timedOut: false,
          durationMs: 10,
        };
      });

    const engine = new PandocEngine();
    await engine.execute(plan);

    const callOpts = runSpy.mock.calls[0]![0]!;
    expect(callOpts.args).toContain("--standalone");
  });

  it("sets cwd to the input file directory", async () => {
    const inputDir = path.join(tempDir, "uploads", "input-with-resources");
    const inputPath = path.join(inputDir, "doc.md");
    const outputPath = path.join(tempDir, "job456", "output.docx");

    fs.mkdirSync(inputDir, { recursive: true });
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(inputPath, "# Test\n\n![image](./img.png)", "utf-8");

    const plan = makePlan({ inputPath, outputPath });

    runSpy = vi
      .spyOn(ProcessRunner.prototype, "run")
      .mockImplementation(async () => {
        fs.writeFileSync(
          outputPath,
          Buffer.concat([DOCX_HEADER, Buffer.alloc(50)]),
        );
        return {
          exitCode: 0,
          stdout: "",
          stderr: "",
          timedOut: false,
          durationMs: 10,
        };
      });

    const engine = new PandocEngine();
    await engine.execute(plan);

    const callOpts = runSpy.mock.calls[0]![0]!;
    expect(callOpts.cwd).toBe(inputDir);
  });

  it("returns detailed error when Pandoc exits non-zero", async () => {
    const inputDir = path.join(tempDir, "uploads", "test-id");
    const inputPath = path.join(inputDir, "bad.md");
    const outputPath = path.join(tempDir, "job789", "output.docx");

    fs.mkdirSync(inputDir, { recursive: true });
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(inputPath, "# Test", "utf-8");

    const plan = makePlan({ inputPath, outputPath });

    runSpy = vi
      .spyOn(ProcessRunner.prototype, "run")
      .mockImplementation(async () => {
        return {
          exitCode: 83,
          stdout: "",
          stderr: "pandoc: Cannot find data directory",
          timedOut: false,
          durationMs: 5,
        };
      });

    const engine = new PandocEngine();
    const result = await engine.execute(plan);

    expect(result.success).toBe(false);
    expect(result.error).toContain("exit 83");
    expect(result.error).toContain("Cannot find data directory");
  });

  it("returns error when input file does not exist", async () => {
    const inputPath = path.join(tempDir, "uploads", "nonexistent", "ghost.md");
    const outputPath = path.join(tempDir, "job000", "output.docx");

    fs.mkdirSync(path.dirname(outputPath), { recursive: true });

    const plan = makePlan({ inputPath, outputPath });

    const engine = new PandocEngine();
    const result = await engine.execute(plan);

    expect(result.success).toBe(false);
    expect(result.error).toContain("no encontrado");
  });

  it("returns error when Pandoc exits 0 but output file is missing", async () => {
    const inputDir = path.join(tempDir, "uploads", "test-id");
    const inputPath = path.join(inputDir, "test.md");
    const outputPath = path.join(tempDir, "jobabc", "output.docx");

    fs.mkdirSync(inputDir, { recursive: true });
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(inputPath, "# Hello", "utf-8");

    const plan = makePlan({ inputPath, outputPath });

    runSpy = vi
      .spyOn(ProcessRunner.prototype, "run")
      .mockImplementation(async () => {
        // Pandoc exits 0 but does NOT create the output file
        return {
          exitCode: 0,
          stdout: "",
          stderr: "",
          timedOut: false,
          durationMs: 10,
        };
      });

    const engine = new PandocEngine();
    const result = await engine.execute(plan);

    expect(result.success).toBe(false);
    expect(result.error).toContain("no generó el archivo de salida");
  });

  it("resolves inputFormat from plan.options.inputFormat over extension", async () => {
    const inputDir = path.join(tempDir, "uploads", "test-id");
    // File has .txt extension but inputFormat says "markdown"
    const inputPath = path.join(inputDir, "readme.txt");
    const outputPath = path.join(tempDir, "jobtxt", "output.docx");

    fs.mkdirSync(inputDir, { recursive: true });
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(inputPath, "# Actually Markdown", "utf-8");

    const plan = makePlan({
      inputPath,
      outputPath,
      options: { inputFormat: "markdown" },
    });

    runSpy = vi
      .spyOn(ProcessRunner.prototype, "run")
      .mockImplementation(async () => {
        fs.writeFileSync(
          outputPath,
          Buffer.concat([DOCX_HEADER, Buffer.alloc(50)]),
        );
        return {
          exitCode: 0,
          stdout: "",
          stderr: "",
          timedOut: false,
          durationMs: 10,
        };
      });

    const engine = new PandocEngine();
    const result = await engine.execute(plan);

    expect(result.success).toBe(true);
    const callOpts = runSpy.mock.calls[0]![0]!;
    const fIdx = callOpts.args.indexOf("-f");
    expect(callOpts.args[fIdx + 1]).toBe("markdown");
  });

  it("input path with the last arg is the inputPath (not output)", async () => {
    const inputDir = path.join(tempDir, "uploads", "test-id");
    const inputPath = path.join(inputDir, "test.md");
    const outputPath = path.join(tempDir, "jobxyz", "output.docx");

    fs.mkdirSync(inputDir, { recursive: true });
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(inputPath, "# Test", "utf-8");

    const plan = makePlan({ inputPath, outputPath });

    runSpy = vi
      .spyOn(ProcessRunner.prototype, "run")
      .mockImplementation(async () => {
        fs.writeFileSync(
          outputPath,
          Buffer.concat([DOCX_HEADER, Buffer.alloc(50)]),
        );
        return {
          exitCode: 0,
          stdout: "",
          stderr: "",
          timedOut: false,
          durationMs: 10,
        };
      });

    const engine = new PandocEngine();
    await engine.execute(plan);

    const callOpts = runSpy.mock.calls[0]![0]!;
    const lastArg = callOpts.args[callOpts.args.length - 1];
    expect(lastArg).toBe(inputPath);
  });
});
