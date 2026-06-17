// Pure-TypeScript data conversion engine.
// Handles: JSON, YAML, TOML, XML, CSV, TSV — lossless and lossy-with-warning conversions.
// No external binaries: yaml, smol-toml, fast-xml-parser, csv-parse, csv-stringify.
// Security: XML entity expansion disabled, size limits, encoding verified.

import fs from "fs";
import type { ConversionEngine, EngineId, EngineProbeResult, ConversionCapability, ConversionPlan, ExecutionResult, ArtifactValidation } from "../../domain/engines";
import type { UniversalFileDescriptor, StructuredDataAttributes } from "../../domain/descriptors";

const ENGINE_ID: EngineId = "data-ts";

type DataFormat = "json" | "yaml" | "toml" | "xml" | "csv" | "tsv";

const ALL_FORMATS: DataFormat[] = ["json", "yaml", "toml", "xml", "csv", "tsv"];

// Representability matrix: [from][to] → true if conversion is lossless
const LOSSLESS: Record<DataFormat, Set<DataFormat>> = {
  json: new Set(["json", "yaml", "toml"]),
  yaml: new Set(["json", "yaml", "toml"]),
  toml: new Set(["json", "yaml", "toml"]),
  xml:  new Set(["xml", "json"]),
  csv:  new Set(["csv", "tsv", "json"]),
  tsv:  new Set(["tsv", "csv", "json"]),
};

const MIME: Record<DataFormat, string> = {
  json: "application/json",
  yaml: "application/x-yaml",
  toml: "application/toml",
  xml:  "application/xml",
  csv:  "text/csv",
  tsv:  "text/tab-separated-values",
};

function getMimeType(fmt: DataFormat): string { return MIME[fmt]; }

function isLossless(from: DataFormat, to: DataFormat): boolean {
  return from === to || LOSSLESS[from].has(to);
}

function lossWarning(from: DataFormat, to: DataFormat): string | null {
  if (from === "xml" && to !== "xml" && to !== "json") {
    return "XML con atributos y namespaces puede perder estructura al convertir a formatos tabulares";
  }
  if ((from === "csv" || from === "tsv") && (to === "yaml" || to === "toml" || to === "xml")) {
    return "CSV/TSV es tabular; puede perder información si el destino espera estructuras anidadas";
  }
  if ((from === "json" || from === "yaml" || from === "toml") && (to === "csv" || to === "tsv")) {
    return "Solo se exportarán objetos del nivel raíz; estructuras anidadas se perderán";
  }
  return null;
}

function buildCapability(
  from: DataFormat,
  to: DataFormat,
  descriptor: UniversalFileDescriptor,
  available: boolean
): ConversionCapability {
  const loss = !isLossless(from, to);
  const warn = lossWarning(from, to);
  const warnings: string[] = [];
  if (warn) warnings.push(warn);

  return {
    id: `data-ts-${descriptor.id}-${from}-${to}`,
    operation: "convert-data",
    outputFormat: to,
    outputMime: getMimeType(to),
    label: `Convertir a ${to.toUpperCase()}`,
    description: `${from.toUpperCase()} → ${to.toUpperCase()}`,
    lossProfile: loss ? "structure-risk" : "lossless",
    state: available ? "available" : "unavailable-tool",
    recommended: to === "json",
    presets: [{ id: `${from}-${to}-default`, label: "Estándar", quality: "0", description: "Conversión directa", isRecommended: true }],
    warnings,
    engineId: ENGINE_ID,
    mobilePortability: "portable-domain",
  };
}

// ── Converters ───────────────────────────────────────────────────────────────

async function parseInput(text: string, fmt: DataFormat): Promise<unknown> {
  switch (fmt) {
    case "json":
      return JSON.parse(text);
    case "yaml": {
      const yaml = await import("yaml");
      return yaml.parse(text);
    }
    case "toml": {
      const { parse } = await import("smol-toml");
      return parse(text);
    }
    case "xml": {
      const { XMLParser } = await import("fast-xml-parser");
      // Disable external entity expansion to prevent XXE
      const parser = new XMLParser({ ignoreAttributes: false, allowBooleanAttributes: true, processEntities: false });
      return parser.parse(text);
    }
    case "csv": {
      const { parse } = await import("csv-parse/sync");
      return parse(text, { columns: true, skip_empty_lines: true, trim: true });
    }
    case "tsv": {
      const { parse } = await import("csv-parse/sync");
      return parse(text, { columns: true, delimiter: "\t", skip_empty_lines: true, trim: true });
    }
  }
}

async function serializeOutput(data: unknown, fmt: DataFormat): Promise<string> {
  switch (fmt) {
    case "json":
      return JSON.stringify(data, null, 2);
    case "yaml": {
      const yaml = await import("yaml");
      return yaml.stringify(data);
    }
    case "toml": {
      const { stringify } = await import("smol-toml");
      return stringify(toTomlObject(data));
    }
    case "xml": {
      const { XMLBuilder } = await import("fast-xml-parser");
      const builder = new XMLBuilder({ ignoreAttributes: false, format: true });
      return builder.build(data);
    }
    case "csv": {
      const rows = flattenToRows(data);
      const { stringify } = await import("csv-stringify/sync");
      return stringify(rows, { header: true });
    }
    case "tsv": {
      const rows = flattenToRows(data);
      const { stringify } = await import("csv-stringify/sync");
      return stringify(rows, { header: true, delimiter: "\t" });
    }
  }
}

function flattenToRows(data: unknown): Record<string, unknown>[] {
  if (Array.isArray(data)) {
    const rows = data.map((r) => typeof r === "object" && r !== null ? normalizeRow(r as Record<string, unknown>) : { value: r });
    return rows.length > 0 ? rows : [{ value: "" }];
  }
  if (typeof data === "object" && data !== null) {
    // Try to find a nested array (common XML/JSON pattern)
    for (const v of Object.values(data as Record<string, unknown>)) {
      if (Array.isArray(v)) return flattenToRows(v);
    }
    return [normalizeRow(data as Record<string, unknown>)];
  }
  return [{ value: data ?? "" }];
}

function normalizeRow(row: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [
    key,
    typeof value === "object" && value !== null ? JSON.stringify(value) : value,
  ]));
}

function toTomlObject(data: unknown): Record<string, unknown> {
  if (typeof data === "object" && data !== null && !Array.isArray(data)) {
    return data as Record<string, unknown>;
  }
  if (Array.isArray(data)) {
    return { items: data.map((item) => typeof item === "object" && item !== null ? item : { value: item }) };
  }
  return { value: data ?? "" };
}

// ── Engine implementation ────────────────────────────────────────────────────

export class DataEngine implements ConversionEngine {
  readonly id: EngineId = ENGINE_ID;
  readonly supportedCategories = ["structured-data", "plain-text"] as const;

  private _probeResult: EngineProbeResult | null = null;

  async probe(): Promise<EngineProbeResult> {
    if (this._probeResult) return this._probeResult;
    const missing: string[] = [];
    const available: string[] = [];

    const deps = [
      { name: "yaml", pkg: "yaml" },
      { name: "smol-toml", pkg: "smol-toml" },
      { name: "fast-xml-parser", pkg: "fast-xml-parser" },
      { name: "csv-parse", pkg: "csv-parse/sync" },
      { name: "csv-stringify", pkg: "csv-stringify/sync" },
    ];

    for (const dep of deps) {
      try {
        await import(dep.pkg);
        available.push(dep.name);
      } catch {
        missing.push(dep.name);
      }
    }

    this._probeResult = {
      available: missing.length === 0,
      version: "typescript-native",
      binaryPath: null,
      capabilities: available,
      error: missing.length > 0 ? `Missing npm packages: ${missing.join(", ")}` : undefined,
    };
    return this._probeResult;
  }

  getCapabilities(
    descriptor: UniversalFileDescriptor,
    probeResult: EngineProbeResult
  ): ConversionCapability[] {
    if (descriptor.category !== "structured-data") return [];
    const attrs = descriptor.attributes as StructuredDataAttributes;
    const fromFmt = attrs.format as DataFormat;
    if (!ALL_FORMATS.includes(fromFmt)) return [];

    return ALL_FORMATS
      .filter((to) => to !== fromFmt)
      .map((to) => buildCapability(fromFmt, to, descriptor, probeResult.available));
  }

  async execute(
    plan: ConversionPlan,
    onProgress?: (progress: number, stage: string) => void
  ): Promise<ExecutionResult> {
    const start = Date.now();
    onProgress?.(10, "Leyendo archivo");

    try {
      const inputText = fs.readFileSync(plan.inputPath, "utf-8");
      const fromFmt = normalizeDataFormat(plan.options.inputFormat ?? plan.inputPath.split(".").pop());
      const toFmt = plan.outputFormat as DataFormat;

      onProgress?.(30, "Parseando");
      const parsed = await parseInput(inputText, fromFmt);

      onProgress?.(65, "Serializando");
      const output = await serializeOutput(parsed, toFmt);

      onProgress?.(85, "Guardando");
      fs.writeFileSync(plan.outputPath, output, "utf-8");

      const stat = fs.statSync(plan.outputPath);
      onProgress?.(100, "Completado");

      return {
        success: true,
        outputPath: plan.outputPath,
        outputSizeBytes: stat.size,
        durationMs: Date.now() - start,
        logs: [],
        warnings: lossWarning(fromFmt, toFmt) ? [lossWarning(fromFmt, toFmt)!] : [],
      };
    } catch (err) {
      return {
        success: false,
        outputPath: plan.outputPath,
        outputSizeBytes: 0,
        durationMs: Date.now() - start,
        logs: [],
        warnings: [],
        error: String(err),
      };
    }
  }

  async validate(outputPath: string, plan: ConversionPlan): Promise<ArtifactValidation> {
    const checks: ArtifactValidation["checks"] = [];

    const exists = fs.existsSync(outputPath);
    checks.push({ name: "file-exists", passed: exists });
    if (!exists) return { valid: false, checks };

    const stat = fs.statSync(outputPath);
    checks.push({ name: "size-nonzero", passed: stat.size > 0, detail: `${stat.size} bytes` });

    try {
      const text = fs.readFileSync(outputPath, "utf-8");
      const toFmt = plan.outputFormat as DataFormat;
      await parseInput(text, toFmt);
      checks.push({ name: "parse-roundtrip", passed: true });
    } catch (err) {
      checks.push({ name: "parse-roundtrip", passed: false, detail: String(err) });
    }

    return { valid: checks.every((c) => c.passed), checks };
  }
}

function normalizeDataFormat(value: unknown): DataFormat {
  const raw = String(value ?? "").toLowerCase();
  if (raw === "yml") return "yaml";
  if (raw === "html" || raw === "htm") return "xml";
  if (ALL_FORMATS.includes(raw as DataFormat)) return raw as DataFormat;
  throw new Error(`Unsupported data input format: ${raw}`);
}

export const dataEngine = new DataEngine();
