// Acceptance test for Windows portable Pandoc markdown→docx conversion.
// Tests the exact same path the Desktop PRO app uses:
// 1. Upload simulation (write file to temp/uploads)
// 2. Build descriptor
// 3. Get capabilities
// 4. Execute conversion
// 5. Validate output artifact
//
// Skips if Pandoc is not available (CI without Pandoc installed).

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PandocEngine } from "../../src/lib/engines/document/pandoc-engine";
import { validateOutputArtifact } from "../../src/lib/jobs/universal-job-processor";
import { CONFIG } from "../../src/lib/config";
import type {
  ConversionPlan,
  EngineProbeResult,
} from "../../src/lib/domain/engines";
import type { UniversalFileDescriptor } from "../../src/lib/domain/descriptors";
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
    `acceptance-pandoc-${crypto.randomUUID()}`,
  );
  fs.mkdirSync(testDir, { recursive: true });
});

afterAll(() => {
  if (testDir && fs.existsSync(testDir)) {
    fs.rmSync(testDir, { recursive: true, force: true });
  }
});

describe("Windows portable acceptance — markdown→docx", () => {
  it("full pipeline: upload → capabilities → execute → validate", async () => {
    if (!probeResult.available) return;

    // 1. Simulate upload
    const inputId = crypto.randomUUID();
    const uploadDir = path.join(testDir, "uploads", inputId);
    fs.mkdirSync(uploadDir, { recursive: true });

    const fixtureContent = fs.readFileSync(
      path.resolve(
        __dirname,
        "..",
        "fixtures",
        "Prompt_Maestro_Desktop_PRO.md",
      ),
      "utf-8",
    );
    const inputPath = path.join(uploadDir, "Prompt_Maestro_Desktop_PRO.md");
    fs.writeFileSync(inputPath, fixtureContent, "utf-8");

    // 2. Build descriptor (simulate what file-detector produces for .md)
    const descriptor: UniversalFileDescriptor = {
      id: inputId,
      category: "plain-text",
      originalName: "Prompt_Maestro_Desktop_PRO.md",
      extension: "md",
      detectedMimeType: "text/markdown",
      detectedFormat: "markdown",
      sizeBytes: fs.statSync(inputPath).size,
      sha256: null,
      source: {
        kind: "local-upload",
        originalName: "Prompt_Maestro_Desktop_PRO.md",
        storedRelativePath: `uploads/${inputId}/Prompt_Maestro_Desktop_PRO.md`,
      },
      attributes: {
        kind: "text",
        encoding: "utf-8",
        lineCount: null,
        format: "markdown",
      },
      warnings: [],
      analyzedBy: ["file-detector"],
      analyzedAt: new Date().toISOString(),
    };

    // 3. Get capabilities
    const capabilities = engine.getCapabilities(descriptor, probeResult);
    const docxCap = capabilities.find((c) => c.outputFormat === "docx");
    expect(docxCap).toBeDefined();
    expect(docxCap!.state).toBe("available");

    // 4. Build plan (exactly as universal-job-processor does)
    const jobId = crypto.randomUUID();
    const jobDir = path.join(testDir, jobId);
    fs.mkdirSync(jobDir, { recursive: true });
    const outputPath = path.join(jobDir, "output.docx");

    const plan: ConversionPlan = {
      jobId,
      engineId: "pandoc",
      operation: docxCap!.operation,
      inputPath,
      outputPath,
      outputFormat: "docx",
      options: { inputFormat: descriptor.detectedFormat },
      args: [],
      env: {},
      timeoutMs: 120_000,
      estimatedSizeBytes: descriptor.sizeBytes * 2,
    };

    // 5. Execute
    const result = await engine.execute(plan);
    expect(result.success, `Pandoc execute failed: ${result.error}`).toBe(true);
    expect(result.outputSizeBytes).toBeGreaterThan(0);
    expect(result.durationMs).toBeGreaterThan(0);

    // 6. Engine validation
    const engineValidation = await engine.validate(outputPath, plan);
    expect(engineValidation.valid).toBe(true);

    // 7. Deep artifact validation (same as universal-job-processor)
    const deepValidation = validateOutputArtifact(outputPath, "docx");
    expect(
      deepValidation.valid,
      `Deep validation failed: ${JSON.stringify(deepValidation)}`,
    ).toBe(true);

    // 8. Verify DOCX structure (ZIP with word/document.xml)
    const fileBuf = fs.readFileSync(outputPath);
    const fileStr = fileBuf.toString("binary");
    expect(fileStr).toContain("word/document.xml");
  });

  it("handles unicode content in markdown correctly", async () => {
    if (!probeResult.available) return;

    const inputId = crypto.randomUUID();
    const uploadDir = path.join(testDir, "uploads", inputId);
    fs.mkdirSync(uploadDir, { recursive: true });

    const unicodeContent = [
      "# Documento con Caracteres Especiales",
      "",
      "Símbolos: € © ® ™ « » — –",
      "",
      "Acentos: á é í ó ú ñ ü",
      "",
      "Emojis: 🚀 📁 ✅",
    ].join("\n");

    const inputPath = path.join(uploadDir, "unicode_test.md");
    fs.writeFileSync(inputPath, unicodeContent, "utf-8");

    const jobDir = path.join(testDir, crypto.randomUUID());
    fs.mkdirSync(jobDir, { recursive: true });
    const outputPath = path.join(jobDir, "output.docx");

    const plan: ConversionPlan = {
      jobId: "unicode-test",
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
