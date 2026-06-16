/**
 * Operation catalog tests — validates the catalog structure, getCompatibleOperations,
 * getOutputFormats, and RecipeManager CRUD semantics.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import {
  OPERATION_CATALOG,
  getCompatibleOperations,
  getOutputFormats,
} from "../../src/lib/domain/operations";
import { RecipeManager, RecipeValidationError } from "../../src/lib/jobs/recipe-manager";

// ── Catalog structure ─────────────────────────────────────────────────────────

describe("OPERATION_CATALOG — structure", () => {
  it("has at least 10 operations defined", () => {
    expect(OPERATION_CATALOG.length).toBeGreaterThanOrEqual(10);
  });

  it("every operation has required fields", () => {
    for (const op of OPERATION_CATALOG) {
      expect(op.id, `${op.id}.id`).toBeTruthy();
      expect(op.category, `${op.id}.category`).toBeTruthy();
      expect(op.labelKey, `${op.id}.labelKey`).toBeTruthy();
      expect(op.engineId, `${op.id}.engineId`).toBeTruthy();
      expect(op.inputFormats.length, `${op.id}.inputFormats`).toBeGreaterThan(0);
      expect(op.outputFormats.length, `${op.id}.outputFormats`).toBeGreaterThan(0);
      expect(["lossless", "lossy", "structural-risk", "lossy-controlled"]).toContain(op.lossProfile);
      expect(["portable-domain", "replace-adapter-on-mobile", "desktop-only"]).toContain(op.mobilePortability);
      expect(["low", "medium", "high"]).toContain(op.resourceProfile);
      expect(typeof op.supportsBatch).toBe("boolean");
    }
  });

  it("all operation ids are unique", () => {
    const ids = OPERATION_CATALOG.map((o) => o.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it("PDF operations use qpdf or tesseract engine", () => {
    const pdfOps = OPERATION_CATALOG.filter((o) => o.category === "pdf");
    expect(pdfOps.length).toBeGreaterThan(0);
    for (const op of pdfOps) {
      expect(["qpdf", "tesseract"]).toContain(op.engineId);
    }
  });

  it("image operations use sharp-image engine", () => {
    const imgOps = OPERATION_CATALOG.filter((o) => o.category === "image");
    expect(imgOps.length).toBeGreaterThan(0);
    for (const op of imgOps) {
      expect(op.engineId).toBe("sharp-image");
    }
  });

  it("audio/video operations use ffmpeg-media engine", () => {
    const mediaOps = OPERATION_CATALOG.filter((o) => ["audio", "video"].includes(o.category));
    expect(mediaOps.length).toBeGreaterThan(0);
    for (const op of mediaOps) {
      expect(op.engineId).toBe("ffmpeg-media");
    }
  });
});

// ── getCompatibleOperations ───────────────────────────────────────────────────

describe("getCompatibleOperations", () => {
  const allEngines = new Set(OPERATION_CATALOG.map((o) => o.engineId));

  it("returns operations for pdf format when qpdf available", () => {
    const engines = new Set(["qpdf", "tesseract", "pdftoppm"]);
    const ops = getCompatibleOperations("pdf", engines);
    expect(ops.length).toBeGreaterThan(0);
    expect(ops.every((o) => o.inputFormats.includes("pdf"))).toBe(true);
  });

  it("returns empty for unknown format", () => {
    const ops = getCompatibleOperations("xyz123", allEngines);
    expect(ops).toHaveLength(0);
  });

  it("excludes operations whose engine is not available", () => {
    const noEngines = new Set<string>();
    const ops = getCompatibleOperations("pdf", noEngines);
    expect(ops).toHaveLength(0);
  });

  it("returns image operations for png format", () => {
    const engines = new Set(["sharp-image", "sharp"]);
    const ops = getCompatibleOperations("png", engines);
    expect(ops.length).toBeGreaterThan(0);
  });

  it("returns audio operations for mp3 format", () => {
    const engines = new Set(["ffmpeg-media", "ffmpeg"]);
    const ops = getCompatibleOperations("mp3", engines);
    expect(ops.length).toBeGreaterThan(0);
  });
});

// ── getOutputFormats ──────────────────────────────────────────────────────────

describe("getOutputFormats", () => {
  it("returns output formats for pdf", () => {
    const fmts = getOutputFormats("pdf");
    expect(fmts).toContain("pdf");
  });

  it("returns sorted output formats", () => {
    const fmts = getOutputFormats("mp4");
    expect(fmts).toEqual([...fmts].sort());
  });

  it("returns empty array for unknown format", () => {
    expect(getOutputFormats("unknownabc")).toHaveLength(0);
  });
});

// ── RecipeManager ─────────────────────────────────────────────────────────────

describe("RecipeManager — CRUD", () => {
  let manager: RecipeManager;
  let dataDir: string;
  const origCwd = process.cwd;

  beforeEach(() => {
    // Point data directory to a temp folder
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "anclora-recipe-test-"));
    process.cwd = () => dataDir;
    manager = new RecipeManager();
  });

  afterEach(() => {
    process.cwd = origCwd;
    fs.rmSync(dataDir, { recursive: true, force: true });
  });

  it("starts with empty recipe list", () => {
    expect(manager.list()).toHaveLength(0);
  });

  it("creates a valid recipe", () => {
    const recipe = manager.create({
      name: "Convertir PNG a WebP",
      operations: [{ operationId: "image:convert", options: { format: "webp", quality: 80 } }],
    });
    expect(recipe.id).toBe("convertir-png-a-webp");
    expect(recipe.schemaVersion).toBe("1");
    expect(recipe.concurrency).toBe(1);
    expect(recipe.onError).toBe("skip");
    expect(manager.list()).toHaveLength(1);
  });

  it("retrieves a recipe by id", () => {
    manager.create({ name: "Test recipe", operations: [{ operationId: "pdf:linearize", options: {} }] });
    const found = manager.get("test-recipe");
    expect(found).toBeDefined();
    expect(found!.name).toBe("Test recipe");
  });

  it("returns undefined for unknown id", () => {
    expect(manager.get("no-such-id")).toBeUndefined();
  });

  it("updates an existing recipe", () => {
    manager.create({ name: "MP3 a FLAC", operations: [{ operationId: "media:convert-audio", options: {} }] });
    const updated = manager.update("mp3-a-flac", { description: "Conversión sin pérdida" });
    expect(updated.description).toBe("Conversión sin pérdida");
  });

  it("deletes a recipe", () => {
    manager.create({ name: "To delete", operations: [{ operationId: "pdf:linearize", options: {} }] });
    expect(manager.delete("to-delete")).toBe(true);
    expect(manager.list()).toHaveLength(0);
  });

  it("returns false when deleting non-existent recipe", () => {
    expect(manager.delete("ghost")).toBe(false);
  });

  it("rejects recipe with empty name", () => {
    expect(() =>
      manager.create({ name: "", operations: [{ operationId: "pdf:linearize", options: {} }] })
    ).toThrow(RecipeValidationError);
  });

  it("rejects recipe with no operations", () => {
    expect(() =>
      manager.create({ name: "Empty", operations: [] })
    ).toThrow(RecipeValidationError);
  });

  it("rejects recipe with unknown operation id", () => {
    expect(() =>
      manager.create({ name: "Bad", operations: [{ operationId: "notexist:op", options: {} }] })
    ).toThrow(RecipeValidationError);
  });

  it("rejects duplicate recipe id", () => {
    manager.create({ name: "Dup", operations: [{ operationId: "pdf:linearize", options: {} }] });
    expect(() =>
      manager.create({ name: "Dup", operations: [{ operationId: "pdf:linearize", options: {} }] })
    ).toThrow(RecipeValidationError);
  });

  it("rejects invalid concurrency", () => {
    expect(() =>
      manager.create({ name: "Bad concurrency", operations: [{ operationId: "pdf:linearize", options: {} }], concurrency: 100 })
    ).toThrow(RecipeValidationError);
  });
});
