#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { writeJson } from "./catalog-discovery.mjs";

const repoRoot = path.resolve(import.meta.dirname, "../..");
const artifactsRoot = path.join(repoRoot, "artifacts/acceptance");
const linuxPath = path.join(artifactsRoot, "linux", "conversion-results.json");
const windowsPath = path.join(artifactsRoot, "windows", "conversion-results.json");

const linux = readOptional(linuxPath);
const windows = readOptional(windowsPath);
const parity = {
  generatedAt: new Date().toISOString(),
  inputs: { linux: linuxPath, windows: windowsPath },
  missingReports: [
    ...(!linux ? ["linux"] : []),
    ...(!windows ? ["windows"] : []),
  ],
  discrepancies: [],
};

if (linux && windows) {
  const linuxMap = conversionMap(linux);
  const windowsMap = conversionMap(windows);
  const keys = new Set([...linuxMap.keys(), ...windowsMap.keys()]);
  for (const key of [...keys].sort()) {
    const l = linuxMap.get(key);
    const w = windowsMap.get(key);
    if (!l || !w) {
      parity.discrepancies.push({ key, linux: l?.status ?? "absent", windows: w?.status ?? "absent" });
      continue;
    }
    if (l.status !== w.status && !(l.status === "blocked" || w.status === "blocked")) {
      parity.discrepancies.push({ key, linux: l.status, windows: w.status });
    }
  }
}

writeJson(path.join(artifactsRoot, "platform-parity.json"), parity);
fs.writeFileSync(path.join(artifactsRoot, "platform-parity.md"), render(parity));

if (parity.missingReports.length || parity.discrepancies.length) {
  console.error(render(parity));
  process.exitCode = 1;
}

function readOptional(filePath) {
  return fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, "utf8")) : null;
}

function conversionMap(report) {
  const out = new Map();
  for (const fixture of report.results ?? []) {
    for (const conversion of fixture.conversions ?? []) {
      out.set(`${fixture.extension}:${normalizeCapabilityId(conversion.capabilityId)}`, conversion);
    }
  }
  return out;
}

function normalizeCapabilityId(capabilityId) {
  return String(capabilityId).replace(/-[a-f0-9]{32}(?=-|$)/g, "");
}

function render(parity) {
  const lines = ["# Platform Parity", ""];
  if (parity.missingReports.length) lines.push(`Missing reports: ${parity.missingReports.join(", ")}`);
  if (!parity.discrepancies.length) lines.push("No unblocked Linux/Windows status discrepancies.");
  for (const item of parity.discrepancies) {
    lines.push(`- ${item.key}: linux=${item.linux}, windows=${item.windows}`);
  }
  return `${lines.join("\n")}\n`;
}
