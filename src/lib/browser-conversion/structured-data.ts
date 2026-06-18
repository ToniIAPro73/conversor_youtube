import { XMLBuilder, XMLParser } from "fast-xml-parser";
import * as TOML from "smol-toml";
import YAML from "yaml";
import {
  assertBrowserInputSize,
  getExtension,
  normalizeFormat,
} from "./validators";
import type {
  BrowserConversionInput,
  BrowserConversionResult,
  BrowserStructuredFormat,
} from "./types";

type StructuredValue = unknown;

const MIME_TYPES: Record<BrowserStructuredFormat, string> = {
  json: "application/json;charset=utf-8",
  yaml: "application/yaml;charset=utf-8",
  toml: "application/toml;charset=utf-8",
  xml: "application/xml;charset=utf-8",
  csv: "text/csv;charset=utf-8",
  tsv: "text/tab-separated-values;charset=utf-8",
};

export function convertStructuredData(input: BrowserConversionInput): BrowserConversionResult {
  assertBrowserInputSize(input.text);
  const sourceFormat = normalizeFormat(getExtension(input.fileName));
  if (!sourceFormat) {
    throw new Error("Formato no compatible en modo Web.");
  }

  const parsed = parseStructured(input.text, sourceFormat);
  const warnings: string[] = [];
  const text = serializeStructured(parsed, input.targetFormat, warnings);
  const baseName = input.fileName.replace(/\.[^.]+$/, "") || "anclora-conversion";

  return {
    fileName: `${baseName}.${input.targetFormat}`,
    mimeType: MIME_TYPES[input.targetFormat],
    text,
    warnings,
  };
}

function parseStructured(text: string, format: BrowserStructuredFormat): StructuredValue {
  if (format === "json") return JSON.parse(text);
  if (format === "yaml") return YAML.parse(text);
  if (format === "toml") return TOML.parse(text);
  if (format === "xml") {
    return new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: "@_",
      textNodeName: "#text",
    }).parse(text);
  }
  if (format === "csv") return parseDelimited(text, ",");
  return parseDelimited(text, "\t");
}

function serializeStructured(
  value: StructuredValue,
  format: BrowserStructuredFormat,
  warnings: string[]
): string {
  if (format === "json") return `${JSON.stringify(value, null, 2)}\n`;
  if (format === "yaml") return YAML.stringify(value);
  if (format === "toml") {
    if (!isPlainObject(value)) {
      throw new Error("TOML requiere un objeto en la raíz.");
    }
    return TOML.stringify(value as TOML.TomlTable);
  }
  if (format === "xml") {
    warnings.push("XML puede cambiar detalles de atributos, espacios o nodos de texto.");
    return new XMLBuilder({
      ignoreAttributes: false,
      attributeNamePrefix: "@_",
      textNodeName: "#text",
      format: true,
    }).build(value);
  }
  if (format === "csv") return serializeDelimited(value, ",", warnings);
  return serializeDelimited(value, "\t", warnings);
}

function parseDelimited(text: string, delimiter: "," | "\t"): Array<Record<string, string>> {
  const rows = text.trimEnd().split(/\r?\n/).map((line) => line.split(delimiter));
  const headers = rows.shift();
  if (!headers || headers.length === 0) throw new Error("El archivo tabular está vacío.");
  return rows.map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ""])));
}

function serializeDelimited(value: StructuredValue, delimiter: "," | "\t", warnings: string[]): string {
  if (!Array.isArray(value)) {
    throw new Error("La salida CSV/TSV requiere una lista de objetos.");
  }
  const records = value as Array<Record<string, unknown>>;
  if (records.length === 0) return "";
  if (!records.every(isPlainObject)) {
    throw new Error("La salida CSV/TSV requiere objetos planos.");
  }

  const headers = Array.from(new Set(records.flatMap((record) => Object.keys(record))));
  warnings.push("Los valores anidados se serializan como JSON dentro de la celda.");
  const lines = [
    headers.map((header) => escapeCell(header, delimiter)).join(delimiter),
    ...records.map((record) =>
      headers.map((header) => escapeCell(formatCell(record[header]), delimiter)).join(delimiter)
    ),
  ];
  return `${lines.join("\n")}\n`;
}

function formatCell(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

function escapeCell(value: string, delimiter: "," | "\t"): string {
  const mustQuote = value.includes(delimiter) || value.includes("\"") || value.includes("\n") || value.includes("\r");
  if (!mustQuote) return value;
  return `"${value.replaceAll("\"", "\"\"")}"`;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
