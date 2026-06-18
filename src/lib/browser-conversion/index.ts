import type { CapabilityInfo } from "@/lib/domain/unified-analysis";
import { convertStructuredData } from "./structured-data";
import { normalizeFormat } from "./validators";
import type { BrowserCapability, BrowserStructuredFormat } from "./types";

export { convertStructuredData };
export type { BrowserCapability, BrowserConversionInput, BrowserConversionResult, BrowserStructuredFormat } from "./types";

const TARGETS: Record<BrowserStructuredFormat, BrowserStructuredFormat[]> = {
  json: ["yaml", "toml", "xml", "csv", "tsv"],
  yaml: ["json", "toml", "xml"],
  toml: ["json", "yaml", "xml"],
  xml: ["json", "yaml"],
  csv: ["tsv", "json"],
  tsv: ["csv", "json"],
};

export function getWebCapabilitiesForExtension(extension: string): BrowserCapability[] {
  const source = normalizeFormat(extension);
  const browserCaps = source
    ? TARGETS[source].map((target) => browserCapability(source, target))
    : [];

  return [
    ...browserCaps,
    desktopRequiredCapability("ffmpeg-media", "Audio y vídeo"),
    desktopRequiredCapability("sharp-image", "Imágenes avanzadas"),
    desktopRequiredCapability("libreoffice", "Office a PDF"),
    desktopRequiredCapability("pandoc", "Documentos"),
    desktopRequiredCapability("qpdf", "PDF avanzado"),
    desktopRequiredCapability("sevenzip", "Archivos comprimidos"),
    desktopRequiredCapability("calibre", "Ebooks"),
    desktopRequiredCapability("tesseract", "OCR"),
  ];
}

function browserCapability(source: BrowserStructuredFormat, target: BrowserStructuredFormat): BrowserCapability {
  return {
    id: `browser-${source}-to-${target}`,
    outputFormat: target,
    outputLabel: target.toUpperCase(),
    state: "available",
    lossProfile: target === "xml" || source === "xml" || target === "csv" || target === "tsv"
      ? "metadata-risk"
      : "lossless",
    engineId: "data-ts",
    mobilePortability: "portable-domain",
    warnings: target === "xml" || source === "xml" || target === "csv" || target === "tsv"
      ? ["Conversión local en navegador con posible pérdida de estructura."]
      : [],
    execution: "browser",
  };
}

function desktopRequiredCapability(engineId: string, label: string): BrowserCapability {
  return {
    id: `desktop-required-${engineId}`,
    outputFormat: "desktop",
    outputLabel: label,
    state: "unavailable-tool",
    lossProfile: "experimental",
    engineId: engineId as CapabilityInfo["engineId"],
    mobilePortability: "replace-adapter-on-mobile",
    warnings: ["Desktop requerido. Vercel Web no ejecuta motores binarios."],
    execution: "desktop-required",
  };
}
