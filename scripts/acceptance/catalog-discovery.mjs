import fs from "node:fs";
import path from "node:path";

const CATEGORY_RE = /category:\s*"([^"]+)"/g;
const ID_RE = /id:\s*"([^"]+)"/g;
const INPUT_EXTENSIONS_RE = /inputExtensions:\s*\[([^\]]*)\]/g;
const OUTPUT_RE = /outputExtension:\s*"([^"]+)"/g;

export function discoverDeclaredFormats(repoRoot) {
  const catalogPath = path.join(repoRoot, "src/lib/domain/format-catalog.ts");
  const source = fs.readFileSync(catalogPath, "utf8");
  const entries = source.match(/\{\s*id:\s*"[^"]+"[\s\S]*?\n\s*\}/g) ?? [];
  const formats = [];

  for (const block of entries) {
    const id = firstMatch(block, ID_RE);
    const category = firstMatch(block, CATEGORY_RE);
    const inputExtensionsBlock = firstMatch(block, INPUT_EXTENSIONS_RE);
    const outputExtension = firstMatch(block, OUTPUT_RE);
    const inputExtensions = inputExtensionsBlock
      ? [...inputExtensionsBlock.matchAll(/"([^"]+)"/g)].map((match) => match[1])
      : [];
    if (!id || !category || inputExtensions.length === 0) continue;
    for (const extension of inputExtensions) {
      formats.push({ id, category, extension, outputExtension: outputExtension ?? extension });
    }
  }

  return formats;
}

export function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function firstMatch(source, regex) {
  regex.lastIndex = 0;
  return regex.exec(source)?.[1] ?? null;
}
