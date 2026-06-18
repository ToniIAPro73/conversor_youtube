import { uniqueName } from "./filenames";

export interface ZipEntry {
  name: string;
  bytes: Uint8Array;
}

export async function createZipBlob(entries: ZipEntry[]): Promise<Blob> {
  const { zipSync, strToU8 } = await import("fflate");
  const used = new Set<string>();
  const data: Record<string, Uint8Array> = {};
  for (const entry of entries) {
    data[uniqueName(entry.name, used)] = entry.bytes;
  }
  if (!data["manifest.json"]) {
    data["manifest.json"] = strToU8(JSON.stringify({ entries: Object.keys(data) }, null, 2));
  }
  const zipped = zipSync(data, { level: 6 });
  return new Blob([zipped], { type: "application/zip" });
}
