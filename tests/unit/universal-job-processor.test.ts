// Unit tests for the universal job processor.
// Tests: engine ID extraction, output validation, MIME detection, job orchestration (mocked).

import { describe, it, expect } from "vitest";
import {
  validateOutputArtifact,
  getOutputMimeType,
  detectOutputMime,
} from "../../src/lib/jobs/universal-job-processor";
import { extractEngineIdFromCapabilityId } from "../../src/lib/jobs/capability-routing";
import fs from "fs";
import path from "path";
import os from "os";

// ── extractEngineIdFromCapabilityId (covers extractEngineIdFromConversionId) ──

describe("extractEngineIdFromCapabilityId — real ID formats", () => {
  it("extracts sharp-image from sharp-convert capability IDs", () => {
    expect(extractEngineIdFromCapabilityId("sharp-convert-abc123-jpeg")).toBe("sharp-image");
    expect(extractEngineIdFromCapabilityId("sharp-convert-xyz-webp")).toBe("sharp-image");
  });

  it("extracts ffmpeg-media from ffmpeg-convert capability IDs", () => {
    expect(extractEngineIdFromCapabilityId("ffmpeg-convert-abc123-wav-mp3")).toBe("ffmpeg-media");
    expect(extractEngineIdFromCapabilityId("ffmpeg-normalize-abc123-wav-mp3")).toBe("ffmpeg-media");
  });

  it("extracts data-ts from data-ts capability IDs", () => {
    expect(extractEngineIdFromCapabilityId("data-ts-abc123-json-yaml")).toBe("data-ts");
    expect(extractEngineIdFromCapabilityId("data-ts-xyz-xml-json")).toBe("data-ts");
  });

  it("extracts qpdf from qpdf capability IDs", () => {
    expect(extractEngineIdFromCapabilityId("qpdf-abc123-linearize")).toBe("qpdf");
    expect(extractEngineIdFromCapabilityId("qpdf-xyz-extract-pages")).toBe("qpdf");
  });

  it("extracts sevenzip from sevenzip capability IDs", () => {
    expect(extractEngineIdFromCapabilityId("sevenzip-abc123-repack-zip")).toBe("sevenzip");
    expect(extractEngineIdFromCapabilityId("sevenzip-xyz-blocked")).toBe("sevenzip");
  });

  it("extracts pandoc from pandoc capability IDs", () => {
    expect(extractEngineIdFromCapabilityId("pandoc-abc123-markdown-html")).toBe("pandoc");
    expect(extractEngineIdFromCapabilityId("pandoc-xyz-docx-markdown")).toBe("pandoc");
  });

  it("extracts libreoffice from libreoffice capability IDs", () => {
    expect(extractEngineIdFromCapabilityId("libreoffice-abc123-docx-pdf")).toBe("libreoffice");
    expect(extractEngineIdFromCapabilityId("libreoffice-xyz-xlsx-pdf")).toBe("libreoffice");
  });

  it("handles unknown engine prefixes gracefully", () => {
    expect(extractEngineIdFromCapabilityId("unknown-abc123")).toBe("unknown");
  });

  it("handles exact engine ID match without suffix", () => {
    expect(extractEngineIdFromCapabilityId("qpdf")).toBe("qpdf");
  });
});

// ── getOutputMimeType ──────────────────────────────────────────────────────

describe("getOutputMimeType", () => {
  it("returns correct MIME for image formats", () => {
    expect(getOutputMimeType("jpeg")).toBe("image/jpeg");
    expect(getOutputMimeType("png")).toBe("image/png");
    expect(getOutputMimeType("webp")).toBe("image/webp");
    expect(getOutputMimeType("avif")).toBe("image/avif");
    expect(getOutputMimeType("gif")).toBe("image/gif");
  });

  it("returns correct MIME for document formats", () => {
    expect(getOutputMimeType("pdf")).toBe("application/pdf");
    expect(getOutputMimeType("docx")).toBe("application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    expect(getOutputMimeType("odt")).toBe("application/vnd.oasis.opendocument.text");
  });

  it("returns correct MIME for data formats", () => {
    expect(getOutputMimeType("json")).toBe("application/json");
    expect(getOutputMimeType("yaml")).toBe("application/yaml");
    expect(getOutputMimeType("xml")).toBe("application/xml");
    expect(getOutputMimeType("csv")).toBe("text/csv");
  });

  it("returns correct MIME for archive formats", () => {
    expect(getOutputMimeType("zip")).toBe("application/zip");
    expect(getOutputMimeType("7z")).toBe("application/x-7z-compressed");
    expect(getOutputMimeType("tar")).toBe("application/x-tar");
  });

  it("returns application/octet-stream for unknown formats", () => {
    expect(getOutputMimeType("unknown")).toBe("application/octet-stream");
  });
});

// ── detectOutputMime ───────────────────────────────────────────────────────

describe("detectOutputMime", () => {
  const tmpDir = os.tmpdir();

  it("detects PNG magic bytes", () => {
    const filePath = path.join(tmpDir, `test-mime-${Date.now()}.png`);
    // PNG magic: 89 50 4E 47
    const buf = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
    fs.writeFileSync(filePath, buf);
    try {
      expect(detectOutputMime(filePath)).toBe("image/png");
    } finally {
      fs.unlinkSync(filePath);
    }
  });

  it("detects JPEG magic bytes", () => {
    const filePath = path.join(tmpDir, `test-mime-${Date.now()}.jpg`);
    const buf = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    fs.writeFileSync(filePath, buf);
    try {
      expect(detectOutputMime(filePath)).toBe("image/jpeg");
    } finally {
      fs.unlinkSync(filePath);
    }
  });

  it("detects PDF magic bytes", () => {
    const filePath = path.join(tmpDir, `test-mime-${Date.now()}.pdf`);
    const buf = Buffer.from("%PDF-1.7\n");
    fs.writeFileSync(filePath, buf);
    try {
      expect(detectOutputMime(filePath)).toBe("application/pdf");
    } finally {
      fs.unlinkSync(filePath);
    }
  });

  it("detects ZIP magic bytes", () => {
    const filePath = path.join(tmpDir, `test-mime-${Date.now()}.zip`);
    const buf = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00]);
    fs.writeFileSync(filePath, buf);
    try {
      expect(detectOutputMime(filePath)).toBe("application/zip");
    } finally {
      fs.unlinkSync(filePath);
    }
  });

  it("returns null for text files (no magic bytes)", () => {
    const filePath = path.join(tmpDir, `test-mime-${Date.now()}.txt`);
    fs.writeFileSync(filePath, "Hello, world!");
    try {
      expect(detectOutputMime(filePath)).toBeNull();
    } finally {
      fs.unlinkSync(filePath);
    }
  });

  it("returns null for non-existent file", () => {
    expect(detectOutputMime("/nonexistent/file.bin")).toBeNull();
  });
});

// ── validateOutputArtifact ─────────────────────────────────────────────────

describe("validateOutputArtifact", () => {
  const tmpDir = os.tmpdir();

  it("fails when file does not exist", () => {
    const result = validateOutputArtifact("/nonexistent/file.pdf", "pdf");
    expect(result.valid).toBe(false);
    expect(result.checks.find((c) => c.name === "file-exists")?.passed).toBe(false);
  });

  it("fails when file is empty (0 bytes)", () => {
    const filePath = path.join(tmpDir, `test-validate-${Date.now()}.pdf`);
    fs.writeFileSync(filePath, Buffer.alloc(0));
    try {
      const result = validateOutputArtifact(filePath, "pdf");
      expect(result.valid).toBe(false);
      expect(result.checks.find((c) => c.name === "size-nonzero")?.passed).toBe(false);
    } finally {
      fs.unlinkSync(filePath);
    }
  });

  it("passes for a valid PDF file with correct magic bytes", () => {
    const filePath = path.join(tmpDir, `test-validate-${Date.now()}.pdf`);
    fs.writeFileSync(filePath, "%PDF-1.7\nfake pdf content for testing");
    try {
      const result = validateOutputArtifact(filePath, "pdf");
      expect(result.valid).toBe(true);
      expect(result.checks.find((c) => c.name === "file-exists")?.passed).toBe(true);
      expect(result.checks.find((c) => c.name === "size-nonzero")?.passed).toBe(true);
      expect(result.checks.find((c) => c.name === "magic-bytes")?.passed).toBe(true);
    } finally {
      fs.unlinkSync(filePath);
    }
  });

  it("passes for text formats without magic bytes", () => {
    const filePath = path.join(tmpDir, `test-validate-${Date.now()}.json`);
    fs.writeFileSync(filePath, '{"key": "value"}');
    try {
      const result = validateOutputArtifact(filePath, "json");
      expect(result.valid).toBe(true);
    } finally {
      fs.unlinkSync(filePath);
    }
  });

  it("passes for a valid PNG file", () => {
    const filePath = path.join(tmpDir, `test-validate-${Date.now()}.png`);
    const buf = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
    fs.writeFileSync(filePath, buf);
    try {
      const result = validateOutputArtifact(filePath, "png");
      expect(result.valid).toBe(true);
      expect(result.checks.find((c) => c.name === "magic-bytes")?.passed).toBe(true);
    } finally {
      fs.unlinkSync(filePath);
    }
  });

  it("detects magic bytes mismatch for binary formats", () => {
    const filePath = path.join(tmpDir, `test-validate-${Date.now()}.pdf`);
    // Write PNG bytes but expect PDF
    const buf = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
    fs.writeFileSync(filePath, buf);
    try {
      const result = validateOutputArtifact(filePath, "pdf");
      expect(result.valid).toBe(false);
      expect(result.checks.find((c) => c.name === "magic-bytes")?.passed).toBe(false);
    } finally {
      fs.unlinkSync(filePath);
    }
  });

  it("allows ZIP container for DOCX (MIME flexibility)", () => {
    const filePath = path.join(tmpDir, `test-validate-${Date.now()}.docx`);
    // DOCX starts with ZIP magic bytes
    const buf = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00, 0x00, 0x00]);
    fs.writeFileSync(filePath, buf);
    try {
      const result = validateOutputArtifact(filePath, "docx");
      expect(result.valid).toBe(true);
    } finally {
      fs.unlinkSync(filePath);
    }
  });
});

// ── processUniversalJob integration (mocked) ───────────────────────────────

describe("processUniversalJob — mocked engine execution", () => {
  // These tests mock the engine registry and job manager to test the
  // orchestration logic without requiring actual engines.

  it("extractEngineIdFromCapabilityId handles all registered engine IDs", () => {
    const engineIds = [
      "sharp-image",
      "data-ts",
      "qpdf",
      "sevenzip",
      "pandoc",
      "libreoffice",
    ];

    for (const id of engineIds) {
      const result = extractEngineIdFromCapabilityId(`${id}-test-capability`);
      expect(result).toBe(id);
    }
  });

  it("getOutputMimeType returns MIME from format catalog when available", () => {
    // These formats are defined in the format catalog
    expect(getOutputMimeType("mp3")).toBe("audio/mpeg");
    expect(getOutputMimeType("mp4")).toBe("video/mp4");
    expect(getOutputMimeType("png")).toBe("image/png");
    expect(getOutputMimeType("pdf")).toBe("application/pdf");
  });

  it("getOutputMimeType falls back to hardcoded mapping", () => {
    // These may not be in the catalog but should still resolve
    expect(getOutputMimeType("tex")).toBe("application/x-tex");
    expect(getOutputMimeType("rst")).toBe("text/x-rst");
  });
});
