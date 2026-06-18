import { XMLBuilder, XMLParser } from "fast-xml-parser";
import * as TOML from "smol-toml";
import YAML from "yaml";
import { parse as csvParse } from "csv-parse/sync";
import { stringify as csvStringify } from "csv-stringify/sync";
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
    throw new Error("Archivo no compatible. Usa JSON, YAML, TOML, XML, CSV o TSV.");
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

/** Strip UTF-8 BOM if present. */
function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text;
}

function parseStructured(text: string, format: BrowserStructuredFormat): StructuredValue {
  const cleaned = stripBom(text);
  if (format === "json") return JSON.parse(cleaned);
  if (format === "yaml") return YAML.parse(cleaned);
  if (format === "toml") return TOML.parse(cleaned);
  if (format === "xml") {
    return new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: "@_",
      textNodeName: "#text",
    }).parse(cleaned);
  }
  if (format === "csv") return parseDelimited(cleaned, ",");
  return parseDelimited(cleaned, "\t");
}

/**
 * RFC 4180-compliant delimited parser using csv-parse/sync.
 * Supports: quoted fields, embedded commas/tabs, embedded newlines,
 * escaped double-quotes, CRLF and LF, BOM, Unicode, empty rows.
 */
function parseDelimited(text: string, delimiter: "," | "\t"): Array<Record<string, string>> {
  if (!text.trim()) throw new Error("El archivo tabular está vacío.");

  let records: string[][];
  try {
    records = csvParse(text, {
      delimiter,
      relax_column_count: true,
      skip_empty_lines: true,
      trim: false,
      bom: true,
    }) as string[][];
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Error al leer el archivo: ${msg}`);
  }

  if (records.length === 0) throw new Error("El archivo tabular está vacío.");

  const headers = records[0];
  if (!headers || headers.length === 0) throw new Error("El archivo tabular está vacío.");

  // Detect duplicate headers
  const headerSet = new Set<string>();
  const duplicates: string[] = [];
  for (const h of headers) {
    if (headerSet.has(h)) duplicates.push(h);
    headerSet.add(h);
  }

  const dataRows = records.slice(1);
  const result: Array<Record<string, string>> = [];

  for (const row of dataRows) {
    if (row.length === 0) continue;
    if (row.length !== headers.length) {
      throw new Error(
        `Número de columnas inconsistente: la cabecera tiene ${headers.length} columnas pero una fila tiene ${row.length}.`
      );
    }
    result.push(Object.fromEntries(headers.map((header, i) => [header, row[i] ?? ""])));
  }

  // Return duplicates as a side-channel; callers can inspect via a separate fn if needed
  if (duplicates.length > 0) {
    // Attach as non-enumerable metadata so consumers can surface warnings
    Object.defineProperty(result, "__duplicateHeaders", {
      value: duplicates,
      enumerable: false,
      writable: false,
    });
  }

  return result;
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
      throw new Error("TOML requiere un objeto en la raíz. Verifica que el archivo no sea un array.");
    }
    return TOML.stringify(value as TOML.TomlTable);
  }
  if (format === "xml") {
    warnings.push("La conversión a XML puede cambiar detalles de atributos, espacios o nodos de texto.");
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

function serializeDelimited(value: StructuredValue, delimiter: "," | "\t", warnings: string[]): string {
  if (!Array.isArray(value)) {
    throw new Error(
      "No se puede crear un CSV con este contenido. Para convertir a CSV, el archivo debe contener una lista de registros (array de objetos)."
    );
  }
  const records = value as Array<Record<string, unknown>>;
  if (records.length === 0) return "";
  if (!records.every(isPlainObject)) {
    throw new Error("No se puede crear un CSV con este contenido. Para convertir a CSV, el archivo debe contener una lista de objetos planos.");
  }

  const headers = Array.from(new Set(records.flatMap((record) => Object.keys(record))));

  // Check for nested objects that will be JSON-serialized
  const hasNested = records.some((record) =>
    Object.values(record).some((v) => typeof v === "object" && v !== null)
  );
  if (hasNested) {
    warnings.push(
      "Algunos valores contienen estructuras anidadas. Se han serializado como texto JSON dentro de la celda. Puede haber pérdida de estructura al abrir el archivo en una hoja de cálculo."
    );
  }

  try {
    return csvStringify(
      [headers, ...records.map((record) => headers.map((h) => formatCell(record[h])))],
      { delimiter, quoted_string: true }
    ) as string;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Error al generar el archivo: ${msg}`);
  }
}

function formatCell(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
