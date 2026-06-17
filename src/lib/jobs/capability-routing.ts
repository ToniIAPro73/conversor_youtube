import { ALL_ALLOWED_EXTENSIONS, FORMAT_BY_EXTENSION } from "@/lib/domain/format-catalog";

/**
 * Maps a capability ID to the engine ID that handles it.
 *
 * Capability IDs use operation-specific prefixes that may differ from the
 * registered engine ID. For example, the "sharp-image" engine generates
 * capability IDs starting with "sharp-convert-", not "sharp-image-".
 */
export function extractEngineIdFromCapabilityId(capabilityId: string): string {
  const PREFIX_TO_ENGINE: Array<[string, string]> = [
    ["sharp-convert", "sharp-image"],
    ["ffmpeg-convert", "ffmpeg-media"],
    ["ffmpeg-normalize", "ffmpeg-media"],
    ["ffmpeg-extract", "ffmpeg-media"],
    ["ffmpeg-gif", "ffmpeg-media"],
    ["ffmpeg-thumbnail", "ffmpeg-media"],
    ["ffmpeg-frames", "ffmpeg-media"],
    ["ffmpeg-trim", "ffmpeg-media"],
    ["ffmpeg-subtitles", "ffmpeg-media"],
    ["sharp-image", "sharp-image"],
    ["ffmpeg-media", "ffmpeg-media"],
    ["libreoffice", "libreoffice"],
    ["sevenzip", "sevenzip"],
    ["data-ts", "data-ts"],
    ["pandoc", "pandoc"],
    ["qpdf", "qpdf"],
    ["calibre", "calibre"],
    ["tesseract", "tesseract"],
  ];

  for (const [prefix, engineId] of PREFIX_TO_ENGINE) {
    if (capabilityId === prefix || capabilityId.startsWith(prefix + "-")) {
      return engineId;
    }
  }

  return capabilityId.split("-")[0] ?? capabilityId;
}

/**
 * Extracts the output format from a capability ID as a best-effort heuristic.
 * The last segment that is a known format extension is returned.
 */
export function extractOutputFormatFromCapabilityId(capabilityId: string): string | null {
  const parts = capabilityId.split("-");
  const last = parts[parts.length - 1];
  if (last && ALL_ALLOWED_EXTENSIONS.has(last)) return last;

  if (parts.length >= 2) {
    const candidate = parts[parts.length - 1];
    if (candidate && FORMAT_BY_EXTENSION.has(candidate)) return candidate;
  }

  return null;
}
