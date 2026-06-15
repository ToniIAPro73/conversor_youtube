// Unit tests for the engine registry.
// Tests: correct engine routing per category, probe cache, diagnosis output.

import { describe, it, expect, beforeEach } from "vitest";
import { getCapabilities, getEngine, diagnoseAllEngines, invalidateProbeCache } from "../../src/lib/engines/registry";
import type { UniversalFileDescriptor } from "../../src/lib/domain/descriptors";
import crypto from "crypto";

function makeDesc(category: UniversalFileDescriptor["category"], fmt: string): UniversalFileDescriptor {
  const attrsByCategory = {
    image: { kind: "image" as const, width: 800, height: 600, channels: 3, hasAlpha: false, format: fmt, colorSpace: "srgb", animated: false, frames: 1, densityPpi: 72, iccProfile: null },
    pdf: { kind: "pdf" as const, pageCount: 5, isEncrypted: false, isLinearized: false, pdfVersion: "1.7", hasAnnotations: false, hasForms: false, hasEmbeddedFiles: false },
    archive: { kind: "archive" as const, entryCount: 10, uncompressedBytes: 1_000_000, expansionRatio: 3, isEncrypted: false, maxDepth: 2, hasDangerousPaths: false, archiveFormat: fmt },
    "structured-data": { kind: "structured-data" as const, format: fmt, rowCount: null, columnCount: null, encoding: "utf-8", isTabular: false, hasNestedStructures: false, hasXmlEntities: false },
  } as const;

  const attrs = attrsByCategory[category as keyof typeof attrsByCategory] ?? { kind: "unknown" as const };

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
    analyzedBy: [],
    analyzedAt: new Date().toISOString(),
  };
}

describe("Engine registry — routing", () => {
  beforeEach(() => {
    invalidateProbeCache();
  });

  it("returns image capabilities for image descriptor", async () => {
    const caps = await getCapabilities(makeDesc("image", "jpeg"));
    expect(caps.length).toBeGreaterThan(0);
    expect(caps.every((c) => c.engineId === "sharp-image")).toBe(true);
  });

  it("returns data capabilities for structured-data descriptor", async () => {
    const caps = await getCapabilities(makeDesc("structured-data", "json"));
    expect(caps.length).toBeGreaterThan(0);
    expect(caps.every((c) => c.engineId === "data-ts")).toBe(true);
  });

  it("returns pdf capabilities for pdf descriptor", async () => {
    const caps = await getCapabilities(makeDesc("pdf", "pdf"));
    expect(caps.length).toBeGreaterThan(0);
    expect(caps.every((c) => c.engineId === "qpdf")).toBe(true);
  });

  it("returns archive capabilities for archive descriptor", async () => {
    const caps = await getCapabilities(makeDesc("archive", "zip"));
    expect(caps.length).toBeGreaterThan(0);
    expect(caps.every((c) => c.engineId === "sevenzip")).toBe(true);
  });

  it("returns empty array for unknown category", async () => {
    const caps = await getCapabilities(makeDesc("unknown", "bin"));
    expect(caps).toHaveLength(0);
  });
});

describe("Engine registry — getEngine", () => {
  it("resolves sharp-image engine by id", () => {
    const engine = getEngine("sharp-image");
    expect(engine).not.toBeNull();
    expect(engine?.id).toBe("sharp-image");
  });

  it("resolves data-ts engine by id", () => {
    expect(getEngine("data-ts")?.id).toBe("data-ts");
  });

  it("resolves qpdf engine by id", () => {
    expect(getEngine("qpdf")?.id).toBe("qpdf");
  });

  it("resolves sevenzip engine by id", () => {
    expect(getEngine("sevenzip")?.id).toBe("sevenzip");
  });

  it("returns null for unknown engine id", () => {
    expect(getEngine("does-not-exist")).toBeNull();
  });
});

describe("Engine registry — diagnoseAllEngines", () => {
  it("returns an entry for each registered engine", async () => {
    const results = await diagnoseAllEngines();
    const ids = results.map((r) => r.engineId);
    expect(ids).toContain("sharp-image");
    expect(ids).toContain("data-ts");
    expect(ids).toContain("qpdf");
    expect(ids).toContain("sevenzip");
  });

  it("each entry has required fields", async () => {
    const results = await diagnoseAllEngines();
    for (const r of results) {
      expect(r).toHaveProperty("engineId");
      expect(r).toHaveProperty("probe");
      expect(r).toHaveProperty("categories");
      expect(Array.isArray(r.categories)).toBe(true);
    }
  });

  it("data-ts engine is reported as available (all deps installed)", async () => {
    const results = await diagnoseAllEngines();
    const dataEntry = results.find((r) => r.engineId === "data-ts");
    expect(dataEntry?.probe.available).toBe(true);
  });
});
