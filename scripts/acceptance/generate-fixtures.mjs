#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import sharp from "sharp";
import { discoverDeclaredFormats, writeJson } from "./catalog-discovery.mjs";

const repoRoot = path.resolve(import.meta.dirname, "../..");
const outDir = path.resolve(process.argv[2] ?? path.join(repoRoot, "tests/acceptance/fixtures/generated"));
const marker = "ANCLORA_ACCEPTANCE_Árbol_東京_12345";

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

const declared = discoverDeclaredFormats(repoRoot);
const byExtension = new Map(declared.map((format) => [format.extension, format]));
const fixtures = [];

await createTextFixtures();
await createImageFixtures();
await createMediaFixtures();
await createDocumentFixtures();
await createArchiveFixtures();
await createPdfFixture();

const generatedExtensions = new Set(fixtures.map((fixture) => fixture.extension));
const missingFixtures = declared
  .filter((format) => !generatedExtensions.has(format.extension))
  .map((format) => ({ extension: format.extension, category: format.category, reason: "fixture-generator-not-implemented" }));

const manifest = {
  generatedAt: new Date().toISOString(),
  marker,
  root: outDir,
  declaredFormatCount: declared.length,
  fixtureCount: fixtures.length,
  fixtures,
  missingFixtures,
};

writeJson(path.join(outDir, "fixture-manifest.json"), manifest);
writeJson(path.join(repoRoot, "artifacts/acceptance/fixture-manifest.json"), manifest);
console.log(`Generated ${fixtures.length} fixtures in ${outDir}`);
if (missingFixtures.length) {
  console.warn(`Missing fixture generators for: ${missingFixtures.map((f) => `.${f.extension}`).join(", ")}`);
}

async function createTextFixtures() {
  addText("txt", `${marker}\nPlain text fixture.\n`);
  addText("md", `# ${marker}\n\nMarkdown fixture with **bold** text.\n`);
  addText("html", `<!doctype html><html><body><h1>${marker}</h1><p>HTML fixture.</p></body></html>\n`);
  addText("rst", `${marker}\n${"=".repeat(marker.length)}\n\nreStructuredText fixture.\n`);
  addText("tex", `\\documentclass{article}\\begin{document}${marker}\\end{document}\n`);
  addText("json", JSON.stringify({ marker, values: [1, 2, 3], nested: { ok: true } }, null, 2));
  addText("yaml", `marker: ${marker}\nvalues:\n  - 1\n  - 2\n`);
  addText("yml", `marker: ${marker}\nvalues:\n  - 1\n  - 2\n`);
  addText("toml", `marker = "${marker}"\nvalues = [1, 2, 3]\n`);
  addText("xml", `<?xml version="1.0" encoding="UTF-8"?><fixture><marker>${marker}</marker></fixture>\n`);
  addText("csv", `marker,value\n${marker},1\n`);
  addText("tsv", `marker\tvalue\n${marker}\t1\n`);
  addText("markdown", `# ${marker}\n\nMarkdown alias fixture.\n`);
  addText("htm", `<!doctype html><html><body><h1>${marker}</h1><p>HTM alias fixture.</p></body></html>\n`);
  addText("latex", `\\documentclass{article}\\begin{document}${marker}\\end{document}\n`);
}

async function createImageFixtures() {
  const base = sharp({
    create: {
      width: 96,
      height: 64,
      channels: 4,
      background: { r: 40, g: 120, b: 210, alpha: 1 },
    },
  }).composite([{ input: Buffer.from(`<svg width="96" height="64"><text x="8" y="34" font-size="12" fill="white">A</text></svg>`), top: 0, left: 0 }]);

  await writeBuffer("png", await base.clone().png().toBuffer());
  await writeBuffer("jpg", await base.clone().jpeg({ quality: 92 }).toBuffer());
  fs.copyFileSync(file("jpg"), file("jpeg"));
  register("jpeg");
  await writeBuffer("webp", await base.clone().webp().toBuffer());
  await writeBuffer("avif", await base.clone().avif().toBuffer());
  await writeBuffer("tiff", await base.clone().tiff().toBuffer());
  fs.copyFileSync(file("tiff"), file("tif"));
  register("tif");
  await writeBuffer("gif", Buffer.from("R0lGODdhAQABAIABAP///wAAACwAAAAAAQABAAACAkQBADs=", "base64"));
}

async function createMediaFixtures() {
  if (!hasCommand("ffmpeg")) {
    addSkipped(["wav", "mp3", "m4a", "flac", "ogg", "aac", "mp4", "webm", "mkv"], "ffmpeg-not-found");
    return;
  }

  const wav = file("wav");
  run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "sine=frequency=440:duration=1", wav]);
  register("wav");
  for (const ext of ["mp3", "m4a", "flac", "ogg", "aac"]) {
    run("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-i", wav, file(ext)]);
    register(ext);
  }

  const videoArgs = ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "testsrc=size=128x96:rate=10:duration=1", "-f", "lavfi", "-i", "sine=frequency=660:duration=1"];
  run("ffmpeg", [...videoArgs, "-pix_fmt", "yuv420p", "-c:v", "libx264", "-c:a", "aac", file("mp4")]);
  register("mp4");
  run("ffmpeg", [...videoArgs, "-c:v", "libvpx-vp9", "-c:a", "libopus", file("webm")]);
  register("webm");
  run("ffmpeg", [...videoArgs, "-pix_fmt", "yuv420p", "-c:v", "libx264", "-c:a", "aac", file("mkv")]);
  register("mkv");
  run("ffmpeg", [...videoArgs, "-pix_fmt", "yuv420p", "-c:v", "mpeg4", "-c:a", "mp3", file("avi")]);
  register("avi");
  run("ffmpeg", [...videoArgs, "-pix_fmt", "yuv420p", "-c:v", "libx264", "-c:a", "aac", file("mov")]);
  register("mov");
  run("ffmpeg", [...videoArgs, "-pix_fmt", "yuv420p", "-c:v", "wmv2", "-c:a", "wmav2", file("wmv")]);
  register("wmv");
  run("ffmpeg", [...videoArgs, "-pix_fmt", "yuv420p", "-c:v", "libx264", "-c:a", "aac", "-f", "mpegts", file("ts")]);
  register("ts");
}

async function createDocumentFixtures() {
  await createZipPackage("docx", {
    "[Content_Types].xml": contentTypes("document"),
    "_rels/.rels": rels("word/document.xml", "officeDocument"),
    "word/document.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>${marker}</w:t></w:r></w:p></w:body></w:document>`,
  });
  await createZipPackage("xlsx", {
    "[Content_Types].xml": contentTypes("sheet"),
    "_rels/.rels": rels("xl/workbook.xml", "officeDocument"),
    "xl/workbook.xml": `<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"/></sheets></workbook>`,
    "xl/_rels/workbook.xml.rels": rels("worksheets/sheet1.xml", "worksheet"),
    "xl/worksheets/sheet1.xml": `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>${marker}</t></is></c></row></sheetData></worksheet>`,
  });
  await createZipPackage("pptx", {
    "[Content_Types].xml": contentTypes("presentation"),
    "_rels/.rels": rels("ppt/presentation.xml", "officeDocument"),
    "ppt/presentation.xml": `<?xml version="1.0" encoding="UTF-8"?><p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:sldIdLst><p:sldId id="256" r:id="rId1"/></p:sldIdLst></p:presentation>`,
    "ppt/_rels/presentation.xml.rels": rels("slides/slide1.xml", "slide"),
    "ppt/slides/slide1.xml": `<?xml version="1.0" encoding="UTF-8"?><p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><p:cSld><p:spTree><p:sp><p:txBody><a:bodyPr/><a:p><a:r><a:t>${marker}</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>`,
  });
  await createZipPackage("odt", {
    "mimetype": "application/vnd.oasis.opendocument.text",
    "content.xml": `<?xml version="1.0" encoding="UTF-8"?><office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"><office:body><office:text><text:p>${marker}</text:p></office:text></office:body></office:document-content>`,
  });
  await createZipPackage("ods", {
    "mimetype": "application/vnd.oasis.opendocument.spreadsheet",
    "content.xml": `<?xml version="1.0" encoding="UTF-8"?><office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"><office:body><office:spreadsheet><table:table table:name="Sheet1"><table:table-row><table:table-cell><text:p>${marker}</text:p></table:table-cell></table:table-row></table:table></office:spreadsheet></office:body></office:document-content>`,
  });
  await createZipPackage("odp", {
    "mimetype": "application/vnd.oasis.opendocument.presentation",
    "content.xml": `<?xml version="1.0" encoding="UTF-8"?><office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"><office:body><office:presentation><draw:page xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0"><text:p>${marker}</text:p></draw:page></office:presentation></office:body></office:document-content>`,
  });
  await createZipPackage("epub", {
    "mimetype": "application/epub+zip",
    "META-INF/container.xml": `<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`,
    "content.opf": `<?xml version="1.0" encoding="UTF-8"?><package xmlns="http://www.idpf.org/2007/opf" unique-identifier="id" version="3.0"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="id">anclora</dc:identifier><dc:title>${marker}</dc:title><dc:language>en</dc:language></metadata><manifest><item id="chap" href="chapter.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="chap"/></spine></package>`,
    "chapter.xhtml": `<?xml version="1.0" encoding="UTF-8"?><html xmlns="http://www.w3.org/1999/xhtml"><body><p>${marker}</p></body></html>`,
  });
  fs.copyFileSync(file("epub"), file("mobi"));
  register("mobi");
  fs.copyFileSync(file("epub"), file("azw3"));
  register("azw3");
  addText("rtf", `{\\rtf1\\ansi ${marker}}\n`);
  addText("doc", `<html><body><p>${marker}</p></body></html>\n`);
  addText("xls", `marker\tvalue\n${marker}\t1\n`);
  addText("ppt", `<html><body><h1>${marker}</h1></body></html>\n`);
  addText("log", `${marker} log fixture\n`);
}

async function createArchiveFixtures() {
  addText("archive-source.txt", `${marker}\nArchive payload.\n`, false);
  const source = path.join(outDir, "archive-source.txt");
  await createZipPackage("zip", { "archive-source.txt": fs.readFileSync(source, "utf8") });
  if (hasCommand("tar")) {
    run("tar", ["-cf", file("tar"), "-C", outDir, "archive-source.txt"]);
    register("tar");
  }
  if (hasCommand("gzip")) {
    fs.copyFileSync(source, path.join(outDir, "fixture-gz.txt"));
    run("gzip", ["-f", path.join(outDir, "fixture-gz.txt")]);
    fs.renameSync(path.join(outDir, "fixture-gz.txt.gz"), file("gz"));
    register("gz");
  }
  if (hasCommand("bzip2")) {
    fs.copyFileSync(source, path.join(outDir, "fixture-bz2.txt"));
    run("bzip2", ["-f", path.join(outDir, "fixture-bz2.txt")]);
    fs.renameSync(path.join(outDir, "fixture-bz2.txt.bz2"), file("bz2"));
    register("bz2");
  }
  if (hasCommand("xz")) {
    fs.copyFileSync(source, path.join(outDir, "fixture-xz.txt"));
    run("xz", ["-f", path.join(outDir, "fixture-xz.txt")]);
    fs.renameSync(path.join(outDir, "fixture-xz.txt.xz"), file("xz"));
    register("xz");
  }
  if (hasCommand("7z")) {
    run("7z", ["a", "-bd", "-y", file("7z"), source]);
    register("7z");
  }
}

async function createPdfFixture() {
  const pdf = `%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Count 1/Kids[3 0 R]>>endobj
3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 144]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj
4 0 obj<</Length 64>>stream
BT /F1 12 Tf 24 72 Td (${marker.replace(/[()]/g, "")}) Tj ET
endstream endobj
5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000231 00000 n 
0000000345 00000 n 
trailer<</Root 1 0 R/Size 6>>
startxref
415
%%EOF
`;
  await writeBuffer("pdf", Buffer.from(pdf));
}

async function createZipPackage(ext, entries) {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), `anclora-${ext}-`));
  try {
    for (const [name, content] of Object.entries(entries)) {
      const target = path.join(work, name);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, content);
    }
    const script = [
      "import pathlib, sys, zipfile",
      "root=pathlib.Path(sys.argv[1]); out=pathlib.Path(sys.argv[2])",
      "with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:",
      "    for p in sorted(root.rglob('*')):",
      "        if p.is_file(): z.write(p, p.relative_to(root).as_posix())",
    ].join("\n");
    run("python3", ["-c", script, work, file(ext)]);
    register(ext);
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
}

function contentTypes(kind) {
  if (kind === "document") return `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`;
  if (kind === "sheet") return `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`;
  return `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/></Types>`;
}

function rels(target, type) {
  return `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/${type}" Target="${target}"/></Relationships>`;
}

function addText(ext, content, include = true) {
  const target = ext.includes(".") ? path.join(outDir, ext) : file(ext);
  fs.writeFileSync(target, content);
  if (include) register(ext);
}

async function writeBuffer(ext, buffer) {
  fs.writeFileSync(file(ext), buffer);
  register(ext);
}

function register(ext) {
  const fixturePath = file(ext);
  if (!fs.existsSync(fixturePath)) return;
  const declaredFormat = byExtension.get(ext);
  fixtures.push({
    extension: ext,
    category: declaredFormat?.category ?? "unknown",
    path: fixturePath,
    fileName: path.basename(fixturePath),
    sizeBytes: fs.statSync(fixturePath).size,
  });
}

function file(ext) {
  return path.join(outDir, `fixture-${ext}.${ext}`);
}

function addSkipped(extensions, reason) {
  for (const extension of extensions) {
    fixtures.push({ extension, category: byExtension.get(extension)?.category ?? "unknown", path: null, fileName: null, sizeBytes: 0, skipped: true, reason });
  }
}

function hasCommand(command) {
  const probe = process.platform === "win32"
    ? spawnSync("where.exe", [command], { stdio: "ignore" })
    : spawnSync("sh", ["-c", `command -v ${command}`], { stdio: "ignore" });
  return probe.status === 0;
}

function run(command, args) {
  const result = spawnSync(command, args, { stdio: "pipe" });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed: ${result.stderr.toString() || result.stdout.toString()}`);
  }
}
