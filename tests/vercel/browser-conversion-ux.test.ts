/**
 * Tests for the Web UX improvements:
 * - Canonical capabilities matrix
 * - Robust CSV/TSV parser (RFC 4180)
 * - ExternalActionLink (no href="#")
 * - Health route status values
 * - Brand module
 */
import { describe, expect, it } from "vitest";
import {
  BROWSER_CONVERSION_MATRIX,
  BROWSER_ROUTE_COUNT,
  BROWSER_MATRIX_DISPLAY,
  DESKTOP_REQUIRED_CATEGORIES,
  getTargetsForFormat,
} from "../../src/lib/browser-conversion/capabilities";
import { convertStructuredData } from "../../src/lib/browser-conversion";
import { FILESTUDIO_BRAND } from "../../src/lib/filestudio-brand";

// ── Canonical matrix ─────────────────────────────────────────────────────────

describe("BROWSER_CONVERSION_MATRIX", () => {
  it("has exactly 17 routes", () => {
    expect(BROWSER_ROUTE_COUNT).toBe(17);
  });

  it("JSON has 5 targets", () => {
    expect(BROWSER_CONVERSION_MATRIX.json).toHaveLength(5);
    expect(BROWSER_CONVERSION_MATRIX.json).toContain("yaml");
    expect(BROWSER_CONVERSION_MATRIX.json).toContain("toml");
    expect(BROWSER_CONVERSION_MATRIX.json).toContain("xml");
    expect(BROWSER_CONVERSION_MATRIX.json).toContain("csv");
    expect(BROWSER_CONVERSION_MATRIX.json).toContain("tsv");
  });

  it("XML only converts to JSON and YAML (no CSV, no TSV)", () => {
    const xmlTargets = BROWSER_CONVERSION_MATRIX.xml;
    expect(xmlTargets).toContain("json");
    expect(xmlTargets).toContain("yaml");
    expect(xmlTargets).not.toContain("csv");
    expect(xmlTargets).not.toContain("tsv");
  });

  it("getTargetsForFormat returns correct targets for CSV", () => {
    const targets = getTargetsForFormat("csv");
    expect(targets).toContain("tsv");
    expect(targets).toContain("json");
    expect(targets).toHaveLength(2);
  });

  it("BROWSER_MATRIX_DISPLAY has 6 rows matching all source formats", () => {
    expect(BROWSER_MATRIX_DISPLAY).toHaveLength(6);
    const inputs = BROWSER_MATRIX_DISPLAY.map((r) => r.input);
    expect(inputs).toContain("JSON");
    expect(inputs).toContain("CSV");
    expect(inputs).toContain("TSV");
  });

  it("DESKTOP_REQUIRED_CATEGORIES covers audio, video, advanced images, documents, advanced PDF, ebooks, archives, YouTube", () => {
    const labels = DESKTOP_REQUIRED_CATEGORIES.map((c) => c.label);
    expect(labels).toContain("Audio");
    expect(labels).toContain("Vídeo");
    expect(labels).toContain("Imágenes avanzadas");
    expect(labels).toContain("Documentos y Office");
    expect(labels).toContain("PDF avanzado y OCR");
    expect(labels).toContain("Ebooks");
    expect(labels).toContain("Archivos comprimidos");
    expect(labels).toContain("YouTube y funciones avanzadas");
  });
});

// ── Robust CSV parser ─────────────────────────────────────────────────────────

describe("CSV/TSV RFC 4180 parser", () => {
  it("handles quoted fields with embedded commas", () => {
    const csv = `name,city\n"Smith, John","New York, NY"\n`;
    const result = convertStructuredData({ fileName: "f.csv", text: csv, targetFormat: "json" });
    const parsed = JSON.parse(result.text);
    expect(parsed[0].name).toBe("Smith, John");
    expect(parsed[0].city).toBe("New York, NY");
  });

  it("handles escaped double-quotes inside quoted fields", () => {
    const csv = `quote\n"He said ""hello"""\n`;
    const result = convertStructuredData({ fileName: "f.csv", text: csv, targetFormat: "json" });
    const parsed = JSON.parse(result.text);
    expect(parsed[0].quote).toBe('He said "hello"');
  });

  it("handles CRLF line endings", () => {
    const csv = `a,b\r\n1,2\r\n3,4\r\n`;
    const result = convertStructuredData({ fileName: "f.csv", text: csv, targetFormat: "json" });
    const parsed = JSON.parse(result.text);
    expect(parsed).toHaveLength(2);
    expect(parsed[0]).toEqual({ a: "1", b: "2" });
  });

  it("strips UTF-8 BOM", () => {
    const bom = "﻿";
    const csv = `${bom}col\nval\n`;
    const result = convertStructuredData({ fileName: "f.csv", text: csv, targetFormat: "json" });
    const parsed = JSON.parse(result.text);
    expect(parsed[0]).toHaveProperty("col");
    expect(parsed[0]).not.toHaveProperty("﻿col");
  });

  it("handles tab-separated values", () => {
    const tsv = `name\tage\nAlice\t30\nBob\t25\n`;
    const result = convertStructuredData({ fileName: "f.tsv", text: tsv, targetFormat: "json" });
    const parsed = JSON.parse(result.text);
    expect(parsed).toHaveLength(2);
    expect(parsed[0]).toEqual({ name: "Alice", age: "30" });
  });

  it("converts TSV to CSV preserving field values", () => {
    const tsv = `a\tb\n1\t2\n`;
    const result = convertStructuredData({ fileName: "f.tsv", text: tsv, targetFormat: "csv" });
    // Re-parse the CSV output to verify values (output may quote fields per RFC 4180)
    const roundtrip = convertStructuredData({ fileName: "result.csv", text: result.text, targetFormat: "json" });
    const rows = JSON.parse(roundtrip.text);
    expect(rows[0]).toEqual({ a: "1", b: "2" });
  });

  it("throws a user-friendly error for column count mismatch", () => {
    const csv = `a,b,c\n1,2\n`;
    expect(() =>
      convertStructuredData({ fileName: "f.csv", text: csv, targetFormat: "json" })
    ).toThrow(/columnas/);
  });

  it("rejects array-root JSON when converting to CSV with user-friendly message", () => {
    const json = JSON.stringify({ key: "value" });
    expect(() =>
      convertStructuredData({ fileName: "f.json", text: json, targetFormat: "csv" })
    ).toThrow(/lista de registros|lista de objetos/);
  });

  it("serializes JSON array to CSV with proper quoting for values with commas", () => {
    const data = [{ city: "Barcelona, Spain", pop: 1600000 }];
    const result = convertStructuredData({
      fileName: "data.json",
      text: JSON.stringify(data),
      targetFormat: "csv",
    });
    expect(result.text).toContain('"Barcelona, Spain"');
    expect(result.text).toContain("1600000");
  });

  it("warns about nested object serialization to CSV", () => {
    const data = [{ name: "Alice", meta: { role: "admin" } }];
    const result = convertStructuredData({
      fileName: "data.json",
      text: JSON.stringify(data),
      targetFormat: "csv",
    });
    expect(result.warnings.some((w) => w.toLowerCase().includes("anidad"))).toBe(true);
  });

  it("handles empty CSV with user-friendly error", () => {
    expect(() =>
      convertStructuredData({ fileName: "f.csv", text: "", targetFormat: "json" })
    ).toThrow(/vacío|compatible/);
  });

  it("handles Unicode content (emoji, accents)", () => {
    const csv = `nombre,emoji\nAntonio,🎸\nÑoño,ñ\n`;
    const result = convertStructuredData({ fileName: "f.csv", text: csv, targetFormat: "json" });
    const parsed = JSON.parse(result.text);
    expect(parsed[0].emoji).toBe("🎸");
    expect(parsed[1].nombre).toBe("Ñoño");
  });
});

// ── Brand module ──────────────────────────────────────────────────────────────

describe("FILESTUDIO_BRAND", () => {
  it("does not reference YouTube", () => {
    const values = Object.values(FILESTUDIO_BRAND).join(" ").toLowerCase();
    expect(values).not.toContain("youtube");
    expect(values).not.toContain("mp3");
    expect(values).not.toContain("mp4");
  });

  it("has correct logo paths", () => {
    expect(FILESTUDIO_BRAND.logoPath).toBe("/brand/logo-anclora-fileStudio.png");
    expect(FILESTUDIO_BRAND.iconPath).toBe("/icon.png");
  });

  it("has site URL", () => {
    expect(FILESTUDIO_BRAND.siteUrl).toMatch(/^https:\/\//);
  });

  it("name is Anclora FileStudio", () => {
    expect(FILESTUDIO_BRAND.name).toBe("Anclora FileStudio");
  });
});

// ── JSON/YAML/TOML conversion ─────────────────────────────────────────────────

describe("JSON/YAML/TOML/XML conversions", () => {
  it("converts JSON to TOML", () => {
    const result = convertStructuredData({
      fileName: "f.json",
      text: JSON.stringify({ name: "test", value: 42 }),
      targetFormat: "toml",
    });
    expect(result.text).toContain('name = "test"');
    expect(result.text).toContain("value = 42");
  });

  it("converts YAML to JSON", () => {
    const result = convertStructuredData({
      fileName: "f.yaml",
      text: "title: Hello\ncount: 3\n",
      targetFormat: "json",
    });
    const parsed = JSON.parse(result.text);
    expect(parsed.title).toBe("Hello");
    expect(parsed.count).toBe(3);
  });

  it("converts TOML to JSON", () => {
    const result = convertStructuredData({
      fileName: "f.toml",
      text: 'name = "world"\nvalue = 99\n',
      targetFormat: "json",
    });
    const parsed = JSON.parse(result.text);
    expect(parsed.name).toBe("world");
    expect(parsed.value).toBe(99);
  });

  it("converts JSON to XML with warning", () => {
    const result = convertStructuredData({
      fileName: "f.json",
      text: JSON.stringify({ root: { item: "test" } }),
      targetFormat: "xml",
    });
    expect(result.text).toContain("<item>");
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it("rejects unsupported file extension with user-friendly error", () => {
    expect(() =>
      convertStructuredData({ fileName: "f.txt", text: "hello", targetFormat: "json" })
    ).toThrow(/no compatible|Usa/);
  });
});
