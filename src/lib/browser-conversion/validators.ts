import type { BrowserStructuredFormat } from "./types";

export const BROWSER_CONVERSION_MAX_BYTES = 1_000_000;

export function getExtension(fileName: string): string {
  return fileName.split(".").pop()?.toLowerCase() ?? "";
}

export function isBrowserStructuredFormat(value: string): value is BrowserStructuredFormat {
  return ["json", "yaml", "yml", "toml", "xml", "csv", "tsv"].includes(value.toLowerCase());
}

export function normalizeFormat(value: string): BrowserStructuredFormat | null {
  const normalized = value.toLowerCase();
  if (normalized === "yml") return "yaml";
  return isBrowserStructuredFormat(normalized) ? (normalized as BrowserStructuredFormat) : null;
}

export function assertBrowserInputSize(text: string): void {
  const bytes = new TextEncoder().encode(text).byteLength;
  if (bytes > BROWSER_CONVERSION_MAX_BYTES) {
    throw new Error("El archivo supera el límite de 1 MB para conversiones en navegador.");
  }
}
