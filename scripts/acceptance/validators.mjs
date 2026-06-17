import fs from "node:fs";
import path from "node:path";

const MAGIC = {
  pdf: (b) => b.subarray(0, 5).toString("ascii") === "%PDF-",
  png: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  jpg: (b) => b[0] === 0xff && b[1] === 0xd8,
  jpeg: (b) => b[0] === 0xff && b[1] === 0xd8,
  gif: (b) => b.subarray(0, 3).toString("ascii") === "GIF",
  webp: (b) => b.subarray(0, 4).toString("ascii") === "RIFF" && b.subarray(8, 12).toString("ascii") === "WEBP",
  tiff: (b) => b.subarray(0, 4).toString("hex") === "49492a00" || b.subarray(0, 4).toString("hex") === "4d4d002a",
  zip: (b) => b.subarray(0, 2).toString("hex") === "504b",
  docx: (b) => MAGIC.zip(b),
  xlsx: (b) => MAGIC.zip(b),
  pptx: (b) => MAGIC.zip(b),
  odt: (b) => MAGIC.zip(b),
  ods: (b) => MAGIC.zip(b),
  odp: (b) => MAGIC.zip(b),
  epub: (b) => MAGIC.zip(b),
  "7z": (b) => b.subarray(0, 6).toString("hex") === "377abcaf271c",
  gz: (b) => b[0] === 0x1f && b[1] === 0x8b,
};

const TEXT_FORMATS = new Set(["txt", "md", "html", "rst", "tex", "csv", "tsv", "json", "yaml", "yml", "toml", "xml"]);
const MEDIA_FORMATS = new Set(["mp3", "m4a", "wav", "flac", "ogg", "aac", "mp4", "webm", "mkv", "avi", "mov", "wmv"]);

export function validateOutput(filePath, outputFormat) {
  const ext = outputFormat.toLowerCase();
  const stat = fs.statSync(filePath);
  if (stat.size <= 0) throw new Error("output is empty");

  const bytes = fs.readFileSync(filePath);
  if (MAGIC[ext] && !MAGIC[ext](bytes)) {
    throw new Error(`magic bytes do not match .${ext}`);
  }

  if (TEXT_FORMATS.has(ext)) {
    const text = bytes.toString("utf8");
    if (!text.trim()) throw new Error(`.${ext} output has no readable text`);
    if (ext === "json") JSON.parse(text);
    if (ext === "xml" && !text.includes("<")) throw new Error("xml output lacks markup");
  }

  if (MEDIA_FORMATS.has(ext) && stat.size < 512) {
    throw new Error(`.${ext} media output is too small (${stat.size} bytes)`);
  }

  return {
    path: filePath,
    fileName: path.basename(filePath),
    sizeBytes: stat.size,
    validator: MAGIC[ext] ? "magic" : TEXT_FORMATS.has(ext) ? "text" : MEDIA_FORMATS.has(ext) ? "media-size" : "non-empty",
  };
}
