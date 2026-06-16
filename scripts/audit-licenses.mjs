#!/usr/bin/env node
// audit-licenses.mjs — Validates that all dependencies have acceptable licenses.

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(__dirname, "..");

const ALLOWED_LICENSES = new Set([
  "MIT", "ISC", "Apache-2.0", "BSD-2-Clause", "BSD-3-Clause",
  "CC0-1.0", "CC-BY-4.0", "Unlicense", "0BSD",
  "LGPL-2.1", "LGPL-2.1-or-later", "LGPL-3.0", "LGPL-3.0-only",
  "GPL-2.0", "GPL-2.0-or-later", "GPL-3.0",
]);

const REQUIRES_NOTICE = new Set([
  "GPL-2.0", "GPL-2.0-or-later", "GPL-3.0", "LGPL-3.0",
]);

let issues = 0;
let warnings = 0;

// Check toolchain tools
const toolchain = JSON.parse(fs.readFileSync(path.join(__dirname, "toolchain.lock.json"), "utf8"));
console.log("=== Toolchain license audit ===");
for (const tool of toolchain.tools) {
  if (!tool.license) {
    console.error(`FAIL: ${tool.displayName} has no license defined`);
    issues++;
  } else if (!ALLOWED_LICENSES.has(tool.license)) {
    console.error(`FAIL: ${tool.displayName} has unknown license: ${tool.license}`);
    issues++;
  } else if (REQUIRES_NOTICE.has(tool.license)) {
    console.warn(`WARN: ${tool.displayName} (${tool.license}) requires redistribution notice`);
    warnings++;
  } else {
    console.log(`  OK: ${tool.displayName} — ${tool.license}`);
  }
}

// Check THIRD_PARTY_NOTICES.txt exists
const noticesPath = path.join(REPO_ROOT, "THIRD_PARTY_NOTICES.txt");
if (!fs.existsSync(noticesPath)) {
  console.warn("WARN: THIRD_PARTY_NOTICES.txt does not exist");
  warnings++;
} else {
  console.log("  OK: THIRD_PARTY_NOTICES.txt exists");
}

console.log(`\n=== Audit complete: ${issues} errors, ${warnings} warnings ===`);
if (issues > 0) {
  process.exit(1);
}
