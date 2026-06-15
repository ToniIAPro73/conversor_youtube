// Unit tests for the LibreOffice headless conversion engine.
// Focuses on category routing, capability matrix, and PDF recommendation.
// No execution tests (LibreOffice not installed in dev environment).

import { describe, it, expect } from "vitest";
import { LibreOfficeEngine } from "../../src/lib/engines/document/libreoffice-engine";
import type { UniversalFileDescriptor, FileCategory } from "../../src/lib/domain/descriptors";
import type { EngineProbeResult } from "../../src/lib/domain/engines";
import crypto from "crypto";

function makeDescriptor(ext: string, category: FileCategory): UniversalFileDescriptor {
  const attrsByCategory = {
    document:     { kind: "document" as const, pageCount: null, wordCount: null, hasMacros: false, hasEmbeddedMedia: false, encoding: null, language: null },
    spreadsheet:  { kind: "spreadsheet" as const, sheetCount: 1, rowCount: null, columnCount: null, hasMacros: false, hasFormulas: false, hasCharts: false },
    presentation: { kind: "presentation" as const, slideCount: 5, hasMacros: false, hasEmbeddedMedia: false, hasAnimations: false },
  };

  return {
    id: crypto.randomUUID(),
    category,
    originalName: `test.${ext}`,
    extension: ext,
    detectedMimeType: null,
    detectedFormat: ext,
    sizeBytes: 20_000,
    sha256: null,
    source: { kind: "local-upload", originalName: `test.${ext}`, storedRelativePath: `test.${ext}` },
    attributes: attrsByCategory[category as keyof typeof attrsByCategory] ?? { kind: "unknown" as const },
    warnings: [],
    analyzedBy: [],
    analyzedAt: new Date().toISOString(),
  };
}

const AVAILABLE_PROBE: EngineProbeResult = {
  available: true,
  version: "LibreOffice 7.6",
  binaryPath: "/usr/bin/libreoffice",
  capabilities: ["docx", "xlsx", "pptx"],
};

const UNAVAILABLE_PROBE: EngineProbeResult = {
  available: false,
  version: null,
  binaryPath: null,
  capabilities: [],
  error: "libreoffice not found",
};

describe("LibreOfficeEngine — category routing", () => {
  const engine = new LibreOfficeEngine();

  it("returns no capabilities for image category", () => {
    const desc = { ...makeDescriptor("jpg", "document"), category: "image" as const };
    expect(engine.getCapabilities(desc, AVAILABLE_PROBE)).toHaveLength(0);
  });

  it("returns no capabilities for archive category", () => {
    const desc = { ...makeDescriptor("zip", "document"), category: "archive" as const };
    expect(engine.getCapabilities(desc, AVAILABLE_PROBE)).toHaveLength(0);
  });

  it("returns no capabilities for unknown extension in document category", () => {
    const desc = makeDescriptor("xyz", "document");
    expect(engine.getCapabilities(desc, AVAILABLE_PROBE)).toHaveLength(0);
  });
});

describe("LibreOfficeEngine — document capabilities", () => {
  const engine = new LibreOfficeEngine();

  it("DOCX input offers PDF output", () => {
    const caps = engine.getCapabilities(makeDescriptor("docx", "document"), AVAILABLE_PROBE);
    expect(caps.some((c) => c.outputFormat === "pdf")).toBe(true);
  });

  it("DOCX input offers ODT output", () => {
    const caps = engine.getCapabilities(makeDescriptor("docx", "document"), AVAILABLE_PROBE);
    expect(caps.some((c) => c.outputFormat === "odt")).toBe(true);
  });

  it("DOCX input does not offer DOCX output (same format excluded)", () => {
    const caps = engine.getCapabilities(makeDescriptor("docx", "document"), AVAILABLE_PROBE);
    expect(caps.some((c) => c.outputFormat === "docx")).toBe(false);
  });

  it("ODT input offers DOCX and PDF output", () => {
    const caps = engine.getCapabilities(makeDescriptor("odt", "document"), AVAILABLE_PROBE);
    const fmts = caps.map((c) => c.outputFormat);
    expect(fmts).toContain("docx");
    expect(fmts).toContain("pdf");
  });

  it("DOC input offers PDF output", () => {
    const caps = engine.getCapabilities(makeDescriptor("doc", "document"), AVAILABLE_PROBE);
    expect(caps.some((c) => c.outputFormat === "pdf")).toBe(true);
  });
});

describe("LibreOfficeEngine — spreadsheet capabilities", () => {
  const engine = new LibreOfficeEngine();

  it("XLSX input offers PDF and ODS", () => {
    const caps = engine.getCapabilities(makeDescriptor("xlsx", "spreadsheet"), AVAILABLE_PROBE);
    const fmts = caps.map((c) => c.outputFormat);
    expect(fmts).toContain("pdf");
    expect(fmts).toContain("ods");
  });

  it("ODS input offers XLSX and PDF", () => {
    const caps = engine.getCapabilities(makeDescriptor("ods", "spreadsheet"), AVAILABLE_PROBE);
    const fmts = caps.map((c) => c.outputFormat);
    expect(fmts).toContain("xlsx");
    expect(fmts).toContain("pdf");
  });
});

describe("LibreOfficeEngine — presentation capabilities", () => {
  const engine = new LibreOfficeEngine();

  it("PPTX input offers PDF and ODP", () => {
    const caps = engine.getCapabilities(makeDescriptor("pptx", "presentation"), AVAILABLE_PROBE);
    const fmts = caps.map((c) => c.outputFormat);
    expect(fmts).toContain("pdf");
    expect(fmts).toContain("odp");
  });

  it("ODP input offers PPTX and PDF", () => {
    const caps = engine.getCapabilities(makeDescriptor("odp", "presentation"), AVAILABLE_PROBE);
    const fmts = caps.map((c) => c.outputFormat);
    expect(fmts).toContain("pptx");
    expect(fmts).toContain("pdf");
  });
});

describe("LibreOfficeEngine — loss profiles and recommendations", () => {
  const engine = new LibreOfficeEngine();

  it("PDF output is always recommended", () => {
    const caps = engine.getCapabilities(makeDescriptor("docx", "document"), AVAILABLE_PROBE);
    const pdf = caps.find((c) => c.outputFormat === "pdf");
    expect(pdf?.recommended).toBe(true);
  });

  it("PDF output has lossy loss profile", () => {
    const caps = engine.getCapabilities(makeDescriptor("docx", "document"), AVAILABLE_PROBE);
    const pdf = caps.find((c) => c.outputFormat === "pdf");
    expect(pdf?.lossProfile).toBe("lossy");
  });

  it("ODT output has metadata-risk loss profile", () => {
    const caps = engine.getCapabilities(makeDescriptor("docx", "document"), AVAILABLE_PROBE);
    const odt = caps.find((c) => c.outputFormat === "odt");
    expect(odt?.lossProfile).toBe("metadata-risk");
  });

  it("all capabilities are desktop-only portability", () => {
    const caps = engine.getCapabilities(makeDescriptor("docx", "document"), AVAILABLE_PROBE);
    expect(caps.every((c) => c.mobilePortability === "desktop-only")).toBe(true);
  });
});

describe("LibreOfficeEngine — availability states", () => {
  const engine = new LibreOfficeEngine();

  it("marks capabilities as available when probe succeeds", () => {
    const caps = engine.getCapabilities(makeDescriptor("docx", "document"), AVAILABLE_PROBE);
    expect(caps.every((c) => c.state === "available")).toBe(true);
  });

  it("marks capabilities as unavailable-tool when probe fails", () => {
    const caps = engine.getCapabilities(makeDescriptor("docx", "document"), UNAVAILABLE_PROBE);
    expect(caps.every((c) => c.state === "unavailable-tool")).toBe(true);
  });

  it("unavailable-tool capabilities include explanatory reason", () => {
    const caps = engine.getCapabilities(makeDescriptor("docx", "document"), UNAVAILABLE_PROBE);
    expect(caps[0]?.unavailableReason).toMatch(/[Ll]ibre[Oo]ffice/);
  });
});
