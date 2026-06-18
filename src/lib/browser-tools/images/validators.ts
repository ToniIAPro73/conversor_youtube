import { WEB_TOOL_LIMITS } from "../common/limits";

const IMAGE_SIGNATURES: Record<string, (bytes: Uint8Array) => boolean> = {
  jpeg: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  png: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
  webp: (b) =>
    b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
    b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50,
};

export function getImageFormat(file: File): "jpeg" | "png" | "webp" | null {
  const lower = file.name.toLowerCase();
  if (file.type === "image/jpeg" || lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "jpeg";
  if (file.type === "image/png" || lower.endsWith(".png")) return "png";
  if (file.type === "image/webp" || lower.endsWith(".webp")) return "webp";
  return null;
}

export async function validateImageFile(file: File): Promise<"jpeg" | "png" | "webp"> {
  if (file.size > WEB_TOOL_LIMITS.image.maxBytesPerFile) {
    throw new Error("La imagen es demasiado grande.");
  }
  const format = getImageFormat(file);
  if (!format) throw new Error("Formato no compatible.");
  const header = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  if (!IMAGE_SIGNATURES[format](header)) throw new Error("No hemos podido validar la cabecera de la imagen.");
  return format;
}

export function assertPixelLimit(width: number, height: number) {
  if (width * height > WEB_TOOL_LIMITS.image.maxPixelsPerImage) {
    throw new Error("La imagen tiene demasiados píxeles.");
  }
}
