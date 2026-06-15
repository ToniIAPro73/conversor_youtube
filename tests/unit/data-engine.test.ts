// Unit tests for the pure-TypeScript data conversion engine.
// Tests: format detection routing, lossless/lossy tagging, roundtrip integrity.

import { describe, it, expect, beforeEach } from "vitest";
import { DataEngine } from "../../src/lib/engines/data/data-engine";
import type { UniversalFileDescriptor } from "../../src/lib/domain/descriptors";
import type { EngineProbeResult, ConversionPlan } from "../../src/lib/domain/engines";
import path from "path";
import fs from "fs";
import os from "os";
import crypto from "crypto";

function makeDescriptor(format: string): UniversalFileDescriptor {
  return {
    id: crypto.randomUUID(),
    category: "structured-data",
    originalName: `test.${format}`,
    extension: format,
    detectedMimeType: null,
    detectedFormat: format,
    sizeBytes: 100,
    sha256: null,
    source: { kind: "local-upload", originalName: `test.${format}`, storedRelativePath: `test.${format}` },
    attributes: {
      kind: "structured-data",
      format,
      rowCount: null,
      columnCount: null,
      encoding: "utf-8",
      isTabular: false,
      hasNestedStructures: false,
      hasXmlEntities: false,
    },
    warnings: [],
    analyzedBy: ["file-detector"],
    analyzedAt: new Date().toISOString(),
  };
}

const AVAILABLE_PROBE: EngineProbeResult = {
  available: true,
  version: "typescript-native",
  binaryPath: null,
  capabilities: ["json", "yaml", "toml", "csv"],
};

describe("DataEngine — capabilities", () => {
  const engine = new DataEngine();

  it("returns no capabilities for non-structured-data category", () => {
    const desc = { ...makeDescriptor("json"), category: "image" as const };
    expect(engine.getCapabilities(desc, AVAILABLE_PROBE)).toHaveLength(0);
  });

  it("returns 5 output formats (excluding self) for JSON input", () => {
    const caps = engine.getCapabilities(makeDescriptor("json"), AVAILABLE_PROBE);
    expect(caps.length).toBe(5);
    const outFmts = caps.map((c) => c.outputFormat);
    expect(outFmts).not.toContain("json");
    expect(outFmts).toContain("yaml");
    expect(outFmts).toContain("csv");
  });

  it("marks JSON→YAML as lossless", () => {
    const caps = engine.getCapabilities(makeDescriptor("json"), AVAILABLE_PROBE);
    const yamlCap = caps.find((c) => c.outputFormat === "yaml");
    expect(yamlCap?.lossProfile).toBe("lossless");
  });

  it("marks JSON→CSV as structure-risk (lossy)", () => {
    const caps = engine.getCapabilities(makeDescriptor("json"), AVAILABLE_PROBE);
    const csvCap = caps.find((c) => c.outputFormat === "csv");
    expect(csvCap?.lossProfile).toBe("structure-risk");
  });

  it("marks CSV→TSV as lossless", () => {
    const caps = engine.getCapabilities(makeDescriptor("csv"), AVAILABLE_PROBE);
    const tsvCap = caps.find((c) => c.outputFormat === "tsv");
    expect(tsvCap?.lossProfile).toBe("lossless");
  });

  it("marks CSV→JSON as lossless", () => {
    const caps = engine.getCapabilities(makeDescriptor("csv"), AVAILABLE_PROBE);
    const jsonCap = caps.find((c) => c.outputFormat === "json");
    expect(jsonCap?.lossProfile).toBe("lossless");
  });

  it("returns unavailable-tool state when engine not available", () => {
    const probe: EngineProbeResult = { ...AVAILABLE_PROBE, available: false };
    const caps = engine.getCapabilities(makeDescriptor("json"), probe);
    expect(caps.every((c) => c.state === "unavailable-tool")).toBe(true);
  });

  it("returns no capabilities for unknown format", () => {
    const desc = makeDescriptor("xyz");
    expect(engine.getCapabilities(desc, AVAILABLE_PROBE)).toHaveLength(0);
  });
});

describe("DataEngine — execute roundtrips", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "data-engine-test-"));
  });

  function makePlan(inputPath: string, outputPath: string, fmt: string, inputFormat: string): ConversionPlan {
    return {
      jobId: crypto.randomUUID(),
      engineId: "data-ts",
      operation: "convert-data",
      inputPath,
      outputPath,
      outputFormat: fmt,
      options: { inputFormat },
      args: [],
      env: {},
      timeoutMs: 10_000,
      estimatedSizeBytes: null,
    };
  }

  it("converts JSON → YAML and back", async () => {
    const engine = new DataEngine();
    const data = { name: "test", values: [1, 2, 3] };
    const jsonIn = path.join(tmpDir, "in.json");
    const yamlOut = path.join(tmpDir, "out.yaml");
    const jsonOut2 = path.join(tmpDir, "out2.json");

    fs.writeFileSync(jsonIn, JSON.stringify(data), "utf-8");

    const r1 = await engine.execute(makePlan(jsonIn, yamlOut, "yaml", "json"));
    expect(r1.success).toBe(true);

    const r2 = await engine.execute(makePlan(yamlOut, jsonOut2, "json", "yaml"));
    expect(r2.success).toBe(true);

    const result = JSON.parse(fs.readFileSync(jsonOut2, "utf-8"));
    expect(result).toEqual(data);
  });

  it("converts CSV → TSV", async () => {
    const engine = new DataEngine();
    const csvIn = path.join(tmpDir, "in.csv");
    const tsvOut = path.join(tmpDir, "out.tsv");

    fs.writeFileSync(csvIn, "name,age\nAlice,30\nBob,25\n", "utf-8");

    const r = await engine.execute(makePlan(csvIn, tsvOut, "tsv", "csv"));
    expect(r.success).toBe(true);

    const content = fs.readFileSync(tsvOut, "utf-8");
    expect(content).toContain("\t");
    expect(content).toContain("Alice");
  });

  it("converts JSON → CSV for flat array", async () => {
    const engine = new DataEngine();
    const jsonIn = path.join(tmpDir, "flat.json");
    const csvOut = path.join(tmpDir, "out.csv");

    fs.writeFileSync(jsonIn, JSON.stringify([{ name: "Alice", age: 30 }, { name: "Bob", age: 25 }]), "utf-8");

    const r = await engine.execute(makePlan(jsonIn, csvOut, "csv", "json"));
    expect(r.success).toBe(true);

    const csv = fs.readFileSync(csvOut, "utf-8");
    expect(csv).toContain("name");
    expect(csv).toContain("Alice");
  });

  it("returns success:false for malformed input", async () => {
    const engine = new DataEngine();
    const badJson = path.join(tmpDir, "bad.json");
    const out = path.join(tmpDir, "out.yaml");

    fs.writeFileSync(badJson, "{ not valid json", "utf-8");

    const r = await engine.execute(makePlan(badJson, out, "yaml", "json"));
    expect(r.success).toBe(false);
    expect(r.error).toBeTruthy();
  });
});

describe("DataEngine — validate", () => {
  it("fails validation when output file does not exist", async () => {
    const engine = new DataEngine();
    const plan: ConversionPlan = {
      jobId: "x", engineId: "data-ts", operation: "convert-data",
      inputPath: "/tmp/nonexistent.json", outputPath: "/tmp/nonexistent-out.json",
      outputFormat: "json", options: {}, args: [], env: {}, timeoutMs: 5000, estimatedSizeBytes: null,
    };
    const v = await engine.validate("/tmp/nonexistent-out.json", plan);
    expect(v.valid).toBe(false);
    expect(v.checks.find((c) => c.name === "file-exists")?.passed).toBe(false);
  });
});
