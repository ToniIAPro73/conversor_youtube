import type { CapabilityInfo } from "@/lib/domain/unified-analysis";

export type BrowserStructuredFormat = "json" | "yaml" | "toml" | "xml" | "csv" | "tsv";

export interface BrowserConversionInput {
  fileName: string;
  text: string;
  targetFormat: BrowserStructuredFormat;
}

export interface BrowserConversionResult {
  fileName: string;
  mimeType: string;
  text: string;
  warnings: string[];
}

export type BrowserCapability = CapabilityInfo & {
  execution: "browser" | "desktop-required" | "future-service" | "unavailable";
};
