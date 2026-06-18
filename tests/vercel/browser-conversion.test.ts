import { describe, expect, it } from "vitest";
import { convertStructuredData } from "../../src/lib/browser-conversion";

describe("browser-safe structured conversions", () => {
  it("converts JSON to YAML preserving Unicode", () => {
    const result = convertStructuredData({
      fileName: "entrada.json",
      text: JSON.stringify({ title: "España", emoji: "ñ" }),
      targetFormat: "yaml",
    });

    expect(result.fileName).toBe("entrada.yaml");
    expect(result.text).toContain("España");
    expect(result.text).toContain("ñ");
  });

  it("converts CSV to JSON", () => {
    const result = convertStructuredData({
      fileName: "table.csv",
      text: "name,value\nuno,1\ndos,2\n",
      targetFormat: "json",
    });

    expect(JSON.parse(result.text)).toEqual([
      { name: "uno", value: "1" },
      { name: "dos", value: "2" },
    ]);
  });

  it("rejects invalid JSON", () => {
    expect(() =>
      convertStructuredData({
        fileName: "bad.json",
        text: "{",
        targetFormat: "yaml",
      })
    ).toThrow();
  });

  it("rejects files over the browser limit", () => {
    expect(() =>
      convertStructuredData({
        fileName: "large.json",
        text: " ".repeat(1_000_001),
        targetFormat: "yaml",
      })
    ).toThrow(/1 MB/);
  });
});
