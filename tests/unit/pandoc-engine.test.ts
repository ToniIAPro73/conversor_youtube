// Unit tests for the Pandoc document conversion engine.
// Focuses on capability matrix and loss profile tagging.
// No execution tests (pandoc not installed in dev environment).

import { describe, it, expect, vi } from "vitest";
import { PandocEngine } from "../../src/lib/engines/document/pandoc-engine";
import { ProcessRunner } from "../../src/lib/infrastructure/processes/process-runner";
import { CONFIG } from "../../src/lib/config";
import type { UniversalFileDescriptor } from "../../src/lib/domain/descriptors";
import type { EngineProbeResult, ConversionPlan } from "../../src/lib/domain/engines";
import crypto from "crypto";
import fs from "fs";
import path from "path";

function makeDescriptor(ext: string, fmt?: string): UniversalFileDescriptor {
  return {
    id: crypto.randomUUID(),
    category: ext === "docx" || ext === "odt" || ext === "rtf" ? "document" : "plain-text",
    originalName: `test.${ext}`,
    extension: ext,
    detectedMimeType: null,
    detectedFormat: fmt ?? ext,
    sizeBytes: 5_000,
    sha256: null,
    source: { kind: "local-upload", originalName: `test.${ext}`, storedRelativePath: `test.${ext}` },
    attributes: { kind: "document", pageCount: null, wordCount: null, hasMacros: false, hasEmbeddedMedia: false, encoding: null, language: null },
    warnings: [],
    analyzedBy: [],
    analyzedAt: new Date().toISOString(),
  };
}

function makeTextDescriptor(ext: string): UniversalFileDescriptor {
  return {
    ...makeDescriptor(ext),
    category: "plain-text",
    attributes: { kind: "text", encoding: "utf-8", lineCount: 100, format: ext },
  };
}

const AVAILABLE_PROBE: EngineProbeResult = {
  available: true,
  version: "pandoc 3.1",
  binaryPath: "/usr/bin/pandoc",
  capabilities: ["markdown", "html", "docx", "odt"],
};

const UNAVAILABLE_PROBE: EngineProbeResult = {
  available: false,
  version: null,
  binaryPath: null,
  capabilities: [],
  error: "pandoc not found",
};

describe("PandocEngine — capability matrix", () => {
  const engine = new PandocEngine();

  it("returns no capabilities for image category", () => {
    const desc = { ...makeTextDescriptor("md"), category: "image" as const };
    expect(engine.getCapabilities(desc, AVAILABLE_PROBE)).toHaveLength(0);
  });

  it("returns no capabilities for unknown extension", () => {
    const desc = makeTextDescriptor("xyz");
    expect(engine.getCapabilities(desc, AVAILABLE_PROBE)).toHaveLength(0);
  });

  it("markdown input offers multiple output formats", () => {
    const caps = engine.getCapabilities(makeTextDescriptor("md"), AVAILABLE_PROBE);
    expect(caps.length).toBeGreaterThanOrEqual(4);
    const outFmts = caps.map((c) => c.outputFormat);
    expect(outFmts).toContain("html");
    expect(outFmts).toContain("docx");
    expect(outFmts).toContain("odt");
  });

  it("html input includes markdown output", () => {
    const caps = engine.getCapabilities(makeTextDescriptor("html"), AVAILABLE_PROBE);
    const fmts = caps.map((c) => c.outputFormat);
    expect(fmts).toContain("md");
  });

  it("docx input includes markdown and html output", () => {
    const caps = engine.getCapabilities(makeDescriptor("docx"), AVAILABLE_PROBE);
    const fmts = caps.map((c) => c.outputFormat);
    expect(fmts).toContain("md");
    expect(fmts).toContain("html");
  });

  it("odt input is not advertised through Pandoc", () => {
    const caps = engine.getCapabilities(makeDescriptor("odt"), AVAILABLE_PROBE);
    expect(caps).toHaveLength(0);
  });

  it("rst input includes html output", () => {
    const caps = engine.getCapabilities(makeTextDescriptor("rst"), AVAILABLE_PROBE);
    expect(caps.map((c) => c.outputFormat)).toContain("html");
  });

  it("plain text input offers limited outputs (markdown, html)", () => {
    const caps = engine.getCapabilities(makeTextDescriptor("txt"), AVAILABLE_PROBE);
    expect(caps.length).toBeGreaterThan(0);
    expect(caps.length).toBeLessThanOrEqual(3);
  });
});

describe("PandocEngine — loss profiles", () => {
  const engine = new PandocEngine();

  it("markdown → plain is lossy", () => {
    const caps = engine.getCapabilities(makeTextDescriptor("md"), AVAILABLE_PROBE);
    const plain = caps.find((c) => c.outputFormat === "txt");
    expect(plain?.lossProfile).toBe("lossy");
    expect(plain?.warnings.length).toBeGreaterThan(0);
  });

  it("markdown → html is lossless", () => {
    const caps = engine.getCapabilities(makeTextDescriptor("md"), AVAILABLE_PROBE);
    const html = caps.find((c) => c.outputFormat === "html");
    expect(html?.lossProfile).toBe("lossless");
  });

  it("docx → markdown is metadata-risk", () => {
    const caps = engine.getCapabilities(makeDescriptor("docx"), AVAILABLE_PROBE);
    const md = caps.find((c) => c.outputFormat === "md");
    expect(md?.lossProfile).toBe("metadata-risk");
  });

  it("docx → odt is metadata-risk", () => {
    const caps = engine.getCapabilities(makeDescriptor("docx"), AVAILABLE_PROBE);
    const odt = caps.find((c) => c.outputFormat === "odt");
    expect(odt?.lossProfile).toBe("metadata-risk");
  });
});

describe("PandocEngine — availability states", () => {
  const engine = new PandocEngine();

  it("marks all capabilities as available when probe succeeds", () => {
    const caps = engine.getCapabilities(makeTextDescriptor("md"), AVAILABLE_PROBE);
    expect(caps.every((c) => c.state === "available")).toBe(true);
  });

  it("marks all capabilities as unavailable-tool when probe fails", () => {
    const caps = engine.getCapabilities(makeTextDescriptor("md"), UNAVAILABLE_PROBE);
    expect(caps.every((c) => c.state === "unavailable-tool")).toBe(true);
  });

  it("unavailable-tool capabilities include explanatory reason", () => {
    const caps = engine.getCapabilities(makeTextDescriptor("md"), UNAVAILABLE_PROBE);
    expect(caps[0]?.unavailableReason).toMatch(/[Pp]andoc/);
  });
});

describe("PandocEngine — recommendations", () => {
  const engine = new PandocEngine();

  it("html is recommended output for markdown input", () => {
    const caps = engine.getCapabilities(makeTextDescriptor("md"), AVAILABLE_PROBE);
    const recommended = caps.filter((c) => c.recommended);
    const fmts = recommended.map((c) => c.outputFormat);
    expect(fmts).toContain("html");
  });

  it("markdown is recommended output for docx input", () => {
    const caps = engine.getCapabilities(makeDescriptor("docx"), AVAILABLE_PROBE);
    const recommended = caps.filter((c) => c.recommended);
    expect(recommended.length).toBeGreaterThan(0);
  });
});


describe("PandocEngine — TXT execution regression", () => {
  it("uses the markdown reader instead of the invalid plain reader for TXT input", async () => {
    const tempDir = path.join(
      CONFIG.media.tempDir,
      "tests",
      `pandoc-${crypto.randomUUID()}`
    );

    const inputPath = path.join(tempDir, "input.txt");
    const outputPath = path.join(tempDir, "output.html");

    fs.mkdirSync(tempDir, { recursive: true });
    fs.writeFileSync(inputPath, "Contenido de texto plano", "utf-8");

    const runSpy = vi
      .spyOn(ProcessRunner.prototype, "run")
      .mockImplementation(async () => {
        fs.writeFileSync(
          outputPath,
          "<!doctype html><html><body>Contenido</body></html>",
          "utf-8"
        );

        return {
          exitCode: 0,
          stdout: "",
          stderr: "",
          timedOut: false,
          durationMs: 1,
        };
      });

    const plan: ConversionPlan = {
      jobId: "pandoc-txt-regression",
      engineId: "pandoc",
      operation: "convert-document",
      inputPath,
      outputPath,
      outputFormat: "html",
      options: {
        inputFormat: "txt",
      },
      args: [],
      env: {},
      timeoutMs: 120_000,
      estimatedSizeBytes: null,
    };

    try {
      const result = await new PandocEngine().execute(plan);

      expect(
        result.success,
        JSON.stringify(
          {
            result,
            processRunnerCalls: runSpy.mock.calls.length,
          },
          null,
          2
        )
      ).toBe(true);
      expect(runSpy).toHaveBeenCalledTimes(1);

      const processOptions = runSpy.mock.calls[0]?.[0];
      expect(processOptions).toBeDefined();

      const fromIndex = processOptions!.args.indexOf("-f");
      const toIndex = processOptions!.args.indexOf("-t");

      expect(fromIndex).toBeGreaterThanOrEqual(0);
      expect(toIndex).toBeGreaterThanOrEqual(0);

      expect(processOptions!.args[fromIndex + 1]).toBe("markdown");
      expect(processOptions!.args[fromIndex + 1]).not.toBe("plain");
      expect(processOptions!.args[toIndex + 1]).toBe("html");
    } finally {
      runSpy.mockRestore();
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
