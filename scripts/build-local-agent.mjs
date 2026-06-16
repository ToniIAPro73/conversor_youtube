import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const sourceDir = join(root, "apps/local-agent/dist/src");
const outRoot = join(root, "dist/local-agent");
const platforms = ["linux-x64", "windows-x64"];

if (!existsSync(sourceDir)) {
  throw new Error("Local Agent TypeScript output missing. Run the package build first.");
}

for (const platform of platforms) {
  const target = join(outRoot, platform);
  rmSync(target, { recursive: true, force: true });
  mkdirSync(target, { recursive: true });
  copyDir(sourceDir, join(target, "app"));

  const launcherName = platform.startsWith("windows") ? "anclora-filestudio-agent.cmd" : "anclora-filestudio-agent";
  const launcher = platform.startsWith("windows")
    ? "@echo off\r\nnode %~dp0\\app\\agent.js %*\r\n"
    : "#!/usr/bin/env sh\nexec node \"$(dirname \"$0\")/app/agent.js\" \"$@\"\n";
  writeFileSync(join(target, launcherName), launcher, { mode: 0o755 });
  writeFileSync(join(target, "config.example.env"), [
    "ANCLORA_AGENT_SERVER_URL=https://filestudio.example.com",
    "ANCLORA_AGENT_DEVICE_NAME=Workstation",
    "ANCLORA_AGENT_POLICY=ask-always",
    "ANCLORA_AGENT_MAX_FILE_BYTES=104857600",
    "ANCLORA_AGENT_MAX_CONCURRENT=1",
    "ANCLORA_AGENT_APPROVED_OPS=data.json-to-yaml",
    "ANCLORA_AGENT_STORE_KEY=replace-with-a-long-random-secret",
    "",
  ].join("\n"));
  writeFileSync(join(target, "README.txt"), [
    "Anclora FileStudio Local Agent",
    "",
    "No abre puertos entrantes y no requiere Docker.",
    "Configure config.example.env, exporte las variables y ejecute el launcher.",
    "El almacenamiento portable cifra credenciales con ANCLORA_AGENT_STORE_KEY.",
    "",
  ].join("\n"));

  const files = listFiles(target);
  const manifest = {
    name: "anclora-filestudio-local-agent",
    version: readPackageVersion(),
    platform,
    builtAt: new Date().toISOString(),
    files: files.map((file) => ({
      path: relative(target, file),
      sizeBytes: statSync(file).size,
      sha256: sha256(readFileSync(file)),
    })),
  };
  writeFileSync(join(target, "manifest.json"), JSON.stringify(manifest, null, 2));
  writeFileSync(join(target, "SHA256SUMS"), listFiles(target).map((file) => `${sha256(readFileSync(file))}  ${relative(target, file)}`).join("\n") + "\n");
}

function readPackageVersion() {
  const pkg = JSON.parse(readFileSync(join(root, "apps/local-agent/package.json"), "utf8"));
  return pkg.version;
}

function copyDir(src, dest) {
  mkdirSync(dest, { recursive: true });
  for (const entry of readdirSync(src, { withFileTypes: true })) {
    const from = join(src, entry.name);
    const to = join(dest, entry.name);
    if (entry.isDirectory()) copyDir(from, to);
    else {
      mkdirSync(dirname(to), { recursive: true });
      copyFileSync(from, to);
    }
  }
}

function listFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFiles(full));
    else out.push(full);
  }
  return out.sort();
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}
