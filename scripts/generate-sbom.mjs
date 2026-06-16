#!/usr/bin/env node
// generate-sbom.mjs — Generates a CycloneDX JSON SBOM for Anclora FileStudio.
// Reads package.json + toolchain.lock.json to produce SBOM.cdx.json.

import fs from "fs";
import path from "path";
import { createHash } from "crypto";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(__dirname, "..");
const pkg = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "package.json"), "utf8"));
const toolchain = JSON.parse(fs.readFileSync(path.join(__dirname, "toolchain.lock.json"), "utf8"));

const serialNumber = `urn:uuid:${createHash("sha256")
  .update(`${pkg.name}-${pkg.version}-${Date.now()}`)
  .digest("hex")
  .slice(0, 8)}-${Date.now()}`;

const components = [];

// npm dependencies
for (const [name, version] of Object.entries({ ...pkg.dependencies, ...pkg.devDependencies })) {
  components.push({
    type: "library",
    bom_ref: `npm:${name}@${version}`,
    name,
    version: String(version).replace(/[\^~>=<]/g, ""),
    purl: `pkg:npm/${name}@${String(version).replace(/[\^~>=<]/g, "")}`,
  });
}

// External tools from toolchain.lock.json
for (const tool of toolchain.tools) {
  components.push({
    type: "application",
    bom_ref: `tool:${tool.id}@${tool.version}`,
    name: tool.displayName,
    version: tool.version,
    licenses: [{ license: { id: tool.license } }],
    externalReferences: [{ type: "website", url: tool.licenseUrl }],
  });
}

const sbom = {
  bomFormat: "CycloneDX",
  specVersion: "1.4",
  serialNumber,
  version: 1,
  metadata: {
    timestamp: new Date().toISOString(),
    component: {
      type: "application",
      bom_ref: `anclora-filestudio@${pkg.version}`,
      name: "Anclora FileStudio",
      version: pkg.version,
      description: "Local-first file conversion and processing application",
      licenses: [{ license: { id: "MIT" } }],
    },
  },
  components,
};

const outPath = path.join(REPO_ROOT, "SBOM.cdx.json");
fs.writeFileSync(outPath, JSON.stringify(sbom, null, 2));
console.log(`SBOM generated: ${outPath}`);
console.log(`Components: ${components.length}`);
