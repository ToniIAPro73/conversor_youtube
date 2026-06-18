import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const forbiddenSourceImports = [
  /from ["']better-sqlite3["']/,
  /from ["']child_process["']/,
  /from ["']node:child_process["']/,
  /from ["']@\/lib\/engines\//,
  /from ["']@\/lib\/jobs\/universal-job-processor["']/,
  /from ["']@\/lib\/infrastructure\/db\/database["']/,
  /from ["']@\/lib\/infrastructure\/db\/job-repository["']/,
];

const vercelRouteFiles = [
  "src/app/api/health/route.ts",
  "src/app/api/capabilities/route.ts",
  "src/app/api/batch/route.ts",
  "src/app/api/download/[jobId]/route.ts",
  "src/app/api/history/route.ts",
  "src/app/api/inputs/analyze/route.ts",
  "src/app/api/jobs/route.ts",
  "src/app/api/jobs/[jobId]/route.ts",
  "src/app/api/jobs/[jobId]/token/route.ts",
  "src/app/api/metadata/route.ts",
];

const forbiddenBuildNames = [
  "better_sqlite3.node",
  "better-sqlite3",
  "child_process",
  "tools/poppler",
  "pdftoppm",
  "soffice",
  "ffmpeg",
  "ffprobe",
  "yt-dlp",
];

const failures = [];

for (const rel of vercelRouteFiles) {
  const abs = path.join(root, rel);
  const source = fs.readFileSync(abs, "utf8");
  for (const pattern of forbiddenSourceImports) {
    if (pattern.test(source)) {
      failures.push(`${rel} has forbidden top-level import matching ${pattern}`);
    }
  }
}

const nextDir = path.join(root, ".next");
if (fs.existsSync(nextDir)) {
  for (const file of walk(nextDir)) {
    const rel = path.relative(root, file).replaceAll(path.sep, "/");
    if (forbiddenBuildNames.some((name) => rel.includes(name))) {
      failures.push(`Forbidden Vercel build artifact: ${rel}`);
    }
  }
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log("Vercel bundle verification passed.");

function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walk(abs);
    } else {
      yield abs;
    }
  }
}
