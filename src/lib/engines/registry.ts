// Engine registry — single source of truth for all conversion engines.
// Engines self-report availability via probe(). UI reads from registry, never queries binaries directly.

import type { FileCategory } from "../domain/descriptors";
import type { ConversionEngine, EngineProbeResult, ConversionCapability, EngineRegistration } from "../domain/engines";
import type { UniversalFileDescriptor } from "../domain/descriptors";

import { sharpEngine } from "./image/sharp-engine";
import { dataEngine } from "./data/data-engine";
import { qpdfEngine } from "./pdf/qpdf-engine";
import { sevenZipEngine } from "./archive/sevenzip-engine";
import { pandocEngine } from "./document/pandoc-engine";
import { libreOfficeEngine } from "./document/libreoffice-engine";
import { ffmpegEngine } from "./media/ffmpeg-engine";
import { calibreEngine } from "./ebook/calibre-engine";
import { tesseractEngine } from "./ocr/tesseract-engine";
import { backgroundRemovalEngine } from "./background/background-removal-engine";

// ── Registration ─────────────────────────────────────────────────────────────

const REGISTERED_ENGINES: EngineRegistration[] = [
  {
    engine: sharpEngine,
    categories: ["image"],
    requiredTools: ["sharp"],
    enabled: true,
  },
  {
    engine: dataEngine,
    categories: ["structured-data"],
    requiredTools: ["yaml", "smol-toml", "fast-xml-parser", "csv-parse", "csv-stringify"],
    enabled: true,
  },
  {
    engine: qpdfEngine,
    categories: ["pdf"],
    requiredTools: ["qpdf"],
    enabled: true,
  },
  {
    engine: sevenZipEngine,
    categories: ["archive"],
    requiredTools: ["7z"],
    enabled: true,
  },
  {
    engine: pandocEngine,
    categories: ["plain-text", "document"],
    requiredTools: ["pandoc"],
    enabled: true,
  },
  {
    engine: libreOfficeEngine,
    categories: ["document", "spreadsheet", "presentation"],
    requiredTools: ["libreoffice"],
    enabled: true,
  },
  {
    engine: ffmpegEngine,
    categories: ["audio", "video"],
    requiredTools: ["ffmpeg", "ffprobe"],
    enabled: true,
  },
  {
    engine: calibreEngine,
    categories: ["ebook"],
    requiredTools: ["ebook-convert"],
    enabled: true,
  },
  {
    engine: tesseractEngine,
    categories: ["image", "pdf"],
    requiredTools: ["tesseract"],
    enabled: true,
  },
  {
    engine: backgroundRemovalEngine,
    categories: ["image"],
    requiredTools: ["sharp"],
    enabled: true,
  },
];

// ── Cache ─────────────────────────────────────────────────────────────────────

const probeCache = new Map<string, EngineProbeResult>();
let probeCacheAt: number | null = null;
const PROBE_TTL_MS = 5 * 60 * 1000; // 5 minutes

async function getProbeResult(engine: ConversionEngine): Promise<EngineProbeResult> {
  const now = Date.now();
  if (probeCacheAt !== null && now - probeCacheAt < PROBE_TTL_MS && probeCache.has(engine.id)) {
    return probeCache.get(engine.id)!;
  }
  const result = await engine.probe();
  probeCache.set(engine.id, result);
  probeCacheAt = now;
  return result;
}

export function invalidateProbeCache(): void {
  probeCache.clear();
  probeCacheAt = null;
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Returns all capabilities for a given descriptor across all matching engines. */
export async function getCapabilities(descriptor: UniversalFileDescriptor): Promise<ConversionCapability[]> {
  const capabilities: ConversionCapability[] = [];

  for (const registration of REGISTERED_ENGINES) {
    if (!registration.enabled) continue;
    if (!registration.categories.includes(descriptor.category as FileCategory)) continue;

    const probeResult = await getProbeResult(registration.engine);
    const caps = registration.engine.getCapabilities(descriptor, probeResult);
    capabilities.push(...caps);
  }

  return capabilities;
}

/** Returns the engine for a given engine ID, or null if not found. */
export function getEngine(engineId: string): ConversionEngine | null {
  return REGISTERED_ENGINES.find((r) => r.engine.id === engineId)?.engine ?? null;
}

/** Returns a probe result for a specific engine (cached). */
export async function probeEngine(engineId: string): Promise<EngineProbeResult | null> {
  const registration = REGISTERED_ENGINES.find((r) => r.engine.id === engineId);
  if (!registration) return null;
  return getProbeResult(registration.engine);
}

/** Returns probed status of all engines (for diagnostics page). */
export async function diagnoseAllEngines(): Promise<Array<{
  engineId: string;
  categories: FileCategory[];
  requiredTools: string[];
  enabled: boolean;
  probe: EngineProbeResult;
}>> {
  const results = await Promise.all(
    REGISTERED_ENGINES.map(async (r) => ({
      engineId: r.engine.id,
      categories: r.categories as FileCategory[],
      requiredTools: r.requiredTools,
      enabled: r.enabled,
      probe: await getProbeResult(r.engine),
    }))
  );
  return results;
}
