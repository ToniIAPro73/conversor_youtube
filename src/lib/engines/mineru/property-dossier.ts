import { createHash } from "crypto";

export type PropertyDossierFileKind = "pdf" | "image" | "scan";
export type PropertyDossierPrecisionLevel = "full" | "reduced";
export type PropertyClassification = "residential" | "commercial" | "land" | "mixed" | "unknown";

export interface PropertyDossierFile {
  name: string;
  kind: PropertyDossierFileKind;
  mimeType?: string;
  bytes: Buffer | Uint8Array | ArrayBuffer | string;
}

export interface PropertyDossierEntities {
  address?: string;
  cadastralReference?: string;
  surfaceM2?: number;
  priceEur?: number;
  classification: PropertyClassification;
}

export interface MineruPropertyDossierAdapter {
  parse(files: PropertyDossierFile[]): Promise<{
    markdown: string;
    pages?: Array<{ pageNumber: number; text: string }>;
    metadata?: Record<string, unknown>;
  }>;
}

export interface TesseractPropertyDossierAdapter {
  extract(files: PropertyDossierFile[]): Promise<{
    text: string;
    pages?: Array<{ pageNumber: number; text: string }>;
    metadata?: Record<string, unknown>;
  }>;
}

export interface ProcessPropertyDossierOptions {
  mineruAdapter: MineruPropertyDossierAdapter;
  tesseractAdapter: TesseractPropertyDossierAdapter;
  rawOcrText?: string;
  minimumTokenReductionRatio?: number;
}

export interface PropertyDossierProcessingResult {
  documentHash: string;
  text: string;
  entities: PropertyDossierEntities;
  precisionLevel: PropertyDossierPrecisionLevel;
  extractionEngine: "mineru-popo" | "tesseract";
  tokenReductionRatio: number;
  warnings: string[];
  metadata: Record<string, unknown>;
}

const DEFAULT_MINIMUM_TOKEN_REDUCTION_RATIO = 0.7;

function toBuffer(bytes: PropertyDossierFile["bytes"]): Buffer {
  if (typeof bytes === "string") return Buffer.from(bytes);
  if (bytes instanceof ArrayBuffer) return Buffer.from(bytes);
  return Buffer.from(bytes);
}

export function computePropertyDossierHash(files: PropertyDossierFile[]): string {
  const hash = createHash("sha256");
  for (const file of [...files].sort((a, b) => a.name.localeCompare(b.name))) {
    hash.update(file.name);
    hash.update(file.kind);
    hash.update(toBuffer(file.bytes));
  }
  return hash.digest("hex");
}

function estimateTokens(text: string): number {
  const normalized = text.trim();
  if (!normalized) return 0;
  return Math.max(1, Math.ceil(normalized.length / 4));
}

function normalizeSpaces(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function parseNumber(value: string): number | undefined {
  const normalized = value.replace(/\./g, "").replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function findFirst(text: string, patterns: RegExp[]): string | undefined {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    const value = match?.[1] ? normalizeSpaces(match[1]) : undefined;
    if (value) return value;
  }
  return undefined;
}

function classify(text: string): PropertyClassification {
  const lower = text.toLowerCase();
  if (/\b(local|oficina|comercial|retail|nave)\b/.test(lower)) return "commercial";
  if (/\b(suelo|solar|parcela|terreno)\b/.test(lower)) return "land";
  if (/\b(mixto|residencial y comercial)\b/.test(lower)) return "mixed";
  if (/\b(vivienda|piso|casa|chalet|apartamento|residencial)\b/.test(lower)) return "residential";
  return "unknown";
}

export function extractPropertyDossierEntities(text: string): PropertyDossierEntities {
  const address = findFirst(text, [
    /(?:address|direcci[oó]n|domicilio)\s*[:\-]\s*([^\n]+)/i,
    /(?:situado en|ubicado en)\s+([^\n.]+)/i,
  ]);

  const cadastralReference = findFirst(text, [
    /(?:referencia catastral|cadastral reference|catastro)\s*[:\-]\s*([A-Z0-9]{14,24})/i,
    /\b([0-9]{7}[A-Z0-9]{2}[0-9]{4}[A-Z]{1,2}[0-9A-Z]{2,4})\b/i,
  ])?.toUpperCase();

  const surfaceValue = findFirst(text, [
    /(?:superficie|surface|built area|constructed area)\s*[:\-]?\s*([0-9.,]+)\s*(?:m2|m²|sqm)/i,
    /([0-9.,]+)\s*(?:m2|m²|sqm)\s*(?:construidos|built|surface)?/i,
  ]);

  const priceValue = findFirst(text, [
    /(?:precio|price|asking price)\s*[:\-]?\s*(?:€|eur)?\s*([0-9.,]+)/i,
    /(?:€|eur)\s*([0-9.,]+)/i,
  ]);

  return {
    address,
    cadastralReference,
    surfaceM2: surfaceValue ? parseNumber(surfaceValue) : undefined,
    priceEur: priceValue ? parseNumber(priceValue) : undefined,
    classification: classify(text),
  };
}

export async function processPropertyDossier(
  files: PropertyDossierFile[],
  options: ProcessPropertyDossierOptions
): Promise<PropertyDossierProcessingResult> {
  if (files.length === 0) {
    throw new Error("Property dossier requires at least one file");
  }

  const minimumReduction = options.minimumTokenReductionRatio ?? DEFAULT_MINIMUM_TOKEN_REDUCTION_RATIO;
  const documentHash = computePropertyDossierHash(files);
  const warnings: string[] = [];

  try {
    const mineru = await options.mineruAdapter.parse(files);
    const rawTokens = estimateTokens(options.rawOcrText ?? files.map((file) => toBuffer(file.bytes).toString("utf8")).join("\n"));
    const structuredTokens = estimateTokens(mineru.markdown);
    const tokenReductionRatio = rawTokens > 0 ? Math.max(0, 1 - structuredTokens / rawTokens) : 0;

    if (tokenReductionRatio < minimumReduction) {
      warnings.push("MINERU_TOKEN_REDUCTION_BELOW_TARGET");
    }

    return {
      documentHash,
      text: mineru.markdown.trim(),
      entities: extractPropertyDossierEntities(mineru.markdown),
      precisionLevel: "full",
      extractionEngine: "mineru-popo",
      tokenReductionRatio,
      warnings,
      metadata: {
        ...mineru.metadata,
        pages: mineru.pages?.length ?? 0,
      },
    };
  } catch (error) {
    warnings.push("MINERU_FAILED_TESSERACT_FALLBACK_USED");
    if (error instanceof Error) {
      warnings.push(error.message);
    }

    const fallback = await options.tesseractAdapter.extract(files);

    return {
      documentHash,
      text: fallback.text.trim(),
      entities: extractPropertyDossierEntities(fallback.text),
      precisionLevel: "reduced",
      extractionEngine: "tesseract",
      tokenReductionRatio: 0,
      warnings,
      metadata: {
        ...fallback.metadata,
        pages: fallback.pages?.length ?? 0,
      },
    };
  }
}
