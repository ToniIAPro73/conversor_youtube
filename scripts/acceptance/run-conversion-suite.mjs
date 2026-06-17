#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { discoverDeclaredFormats, writeJson } from "./catalog-discovery.mjs";
import { downloadJob, getJson, pollJob, postJson, uploadFile } from "./api-client.mjs";
import { validateOutput } from "./validators.mjs";

const args = parseArgs(process.argv.slice(2));
const repoRoot = path.resolve(args["repo-root"] ?? path.resolve(import.meta.dirname, "../.."));
const baseUrl = args["base-url"] ?? process.env.ANCLORA_ACCEPTANCE_BASE_URL ?? "http://127.0.0.1:3847";
const platform = args.platform ?? process.env.ANCLORA_ACCEPTANCE_PLATFORM ?? process.platform;
const fixtureDir = path.resolve(args.fixtures ?? path.join(repoRoot, "tests/acceptance/fixtures/generated"));
const outDir = path.resolve(args.out ?? path.join(repoRoot, "artifacts/acceptance", platform));
const maxConversions = Number(args["max-conversions"] ?? process.env.ANCLORA_ACCEPTANCE_MAX_CONVERSIONS ?? "0");
const downloadsDir = path.join(outDir, "downloads");

fs.mkdirSync(outDir, { recursive: true });
fs.mkdirSync(downloadsDir, { recursive: true });

const startedAt = new Date().toISOString();
const health = await getJson(baseUrl, "/api/health");
const healthText = JSON.stringify(health);
const regressions = validatePlatformRegressions(platform, health);
const declaredFormats = discoverDeclaredFormats(repoRoot);
const fixtureManifestPath = path.join(fixtureDir, "fixture-manifest.json");
if (!fs.existsSync(fixtureManifestPath)) {
  throw new Error(`Fixture manifest not found: ${fixtureManifestPath}. Run pnpm test:acceptance:fixtures first.`);
}
const fixtureManifest = JSON.parse(fs.readFileSync(fixtureManifestPath, "utf8"));
const fixtures = fixtureManifest.fixtures
  .map((fixture) => {
    const copiedPath = fixture.fileName ? path.join(fixtureDir, fixture.fileName) : null;
    return copiedPath && fs.existsSync(copiedPath) ? { ...fixture, path: copiedPath } : fixture;
  })
  .filter((fixture) => fixture.path && fs.existsSync(fixture.path));
const results = [];
const capabilityManifest = [];
let executedConversions = 0;

for (const fixture of fixtures) {
  const fixtureResult = {
    fixture: relativeOrAbsolute(fixture.path),
    extension: fixture.extension,
    category: fixture.category,
    analysis: null,
    capabilities: [],
    conversions: [],
  };
  results.push(fixtureResult);

  try {
    const analysis = await uploadFile(baseUrl, fixture.path);
    fixtureResult.analysis = summarizeAnalysis(analysis);
    const body = analysis.kind === "local-media"
      ? { descriptor: analysis.descriptor }
      : { universalDescriptor: analysis.universalDescriptor };
    const caps = await postJson(baseUrl, "/api/capabilities", body);
    fixtureResult.capabilities = caps.capabilities.map(summarizeCapability);
    capabilityManifest.push({
      inputExtension: fixture.extension,
      inputCategory: caps.inputCategory,
      inputFormat: caps.inputFormat,
      capabilities: fixtureResult.capabilities,
    });

    for (const cap of caps.capabilities) {
      if (cap.state !== "available") {
        fixtureResult.conversions.push({
          capabilityId: cap.id,
          outputFormat: cap.outputFormat,
          status: "blocked",
          reason: cap.unavailableReason ?? cap.warnings?.join("; ") ?? cap.state,
        });
        continue;
      }
      if (maxConversions > 0 && executedConversions >= maxConversions) {
        fixtureResult.conversions.push({
          capabilityId: cap.id,
          outputFormat: cap.outputFormat,
          status: "not-run",
          reason: "max-conversions-reached",
        });
        continue;
      }
      fixtureResult.conversions.push(await executeConversion({ baseUrl, analysis, cap, downloadsDir }));
      executedConversions += 1;
    }
  } catch (error) {
    fixtureResult.error = error instanceof Error ? error.message : String(error);
  }
}

const failed = results.flatMap((fixture) =>
  fixture.conversions.filter((conversion) => conversion.status === "failed").map((conversion) => ({ fixture: fixture.extension, ...conversion }))
);
const advertisedButNotExecutable = results.flatMap((fixture) =>
  fixture.conversions.filter((conversion) => conversion.status === "failed" && conversion.wasAdvertised).map((conversion) => ({ fixture: fixture.extension, ...conversion }))
);
const report = {
  schemaVersion: 1,
  platform,
  baseUrl,
  startedAt,
  finishedAt: new Date().toISOString(),
  health,
  declaredFormatCount: declaredFormats.length,
  fixtureCount: fixtures.length,
  executedConversions,
  regressionChecks: regressions,
  summary: {
    totalConversionRows: results.reduce((sum, fixture) => sum + fixture.conversions.length, 0),
    passed: countStatus("passed"),
    failed: countStatus("failed"),
    blocked: countStatus("blocked"),
    notRun: countStatus("not-run"),
    advertisedButNotExecutable: advertisedButNotExecutable.length,
  },
  results,
};

writeJson(path.join(outDir, "conversion-manifest.generated.json"), capabilityManifest);
writeJson(path.join(outDir, "conversion-results.json"), report);
fs.writeFileSync(path.join(outDir, "conversion-results.md"), renderMarkdown(report));
fs.writeFileSync(path.join(outDir, "junit.xml"), renderJunit(report));

const regressionFailures = regressions.filter((check) => !check.ok);
if (regressionFailures.length > 0 || failed.length > 0 || healthText.includes("sudo apt")) {
  console.error(renderMarkdown(report));
  process.exitCode = 1;
}

function countStatus(status) {
  return results.reduce((sum, fixture) => sum + fixture.conversions.filter((conversion) => conversion.status === status).length, 0);
}

async function executeConversion({ baseUrl, analysis, cap, downloadsDir }) {
  const started = Date.now();
  const row = {
    capabilityId: cap.id,
    engineId: cap.engineId,
    outputFormat: cap.outputFormat,
    status: "running",
    wasAdvertised: true,
  };

  try {
    const jobBody = analysis.kind === "local-media"
      ? {
          localFilePath: analysis.storedRelativePath,
          format: cap.outputFormat,
          operation: operationFromLegacyCapability(cap.id),
          rightsConfirmed: true,
        }
      : {
          inputId: analysis.inputId,
          capabilityId: cap.id,
          format: cap.outputFormat,
          rightsConfirmed: true,
        };
    const created = await postJson(baseUrl, "/api/jobs", jobBody);
    const completed = await pollJob(baseUrl, created.jobId);
    const downloaded = await downloadJob(baseUrl, created.jobId, downloadsDir);
    const validation = validateOutput(downloaded, cap.outputFormat);
    return {
      ...row,
      status: "passed",
      jobId: created.jobId,
      durationMs: Date.now() - started,
      file: completed.file ?? null,
      validation,
      outputSha256: sha256(downloaded),
    };
  } catch (error) {
    return {
      ...row,
      status: "failed",
      durationMs: Date.now() - started,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function validatePlatformRegressions(platform, health) {
  const text = JSON.stringify(health);
  const deps = new Map((health.dependencies ?? []).map((dep) => [dep.id, dep]));
  const libreOffice = deps.get("libreoffice");
  const poppler = deps.get("poppler");
  const effectivePlatform = health.runtime?.effectivePlatform;
  const checks = [
    { id: "no-sudo-apt", ok: !text.includes("sudo apt"), details: "diagnostics must not leak Linux install commands into portable API health" },
    { id: "capability-health-shape", ok: Array.isArray(health.dependencies) && Array.isArray(health.engines), details: "health exposes dependencies and engines" },
  ];

  if (platform === "windows") {
    checks.push(
      { id: "explicit-windows-platform", ok: effectivePlatform === "windows", details: `effectivePlatform=${effectivePlatform}` },
      { id: "libreoffice-available", ok: Boolean(libreOffice?.available && libreOffice?.version), details: JSON.stringify(libreOffice ?? null) },
      { id: "libreoffice-soffice-com", ok: JSON.stringify(libreOffice ?? {}).toLowerCase().includes("soffice.com"), details: JSON.stringify(libreOffice ?? null) },
      { id: "poppler-state", ok: Boolean(poppler), details: JSON.stringify(poppler ?? null) },
    );
  }

  return checks;
}

function summarizeAnalysis(analysis) {
  return {
    kind: analysis.kind,
    inputId: analysis.inputId,
    storedRelativePath: analysis.storedRelativePath,
    detectedFormat: analysis.detectedFormat,
    category: analysis.category,
    originalName: analysis.originalName,
  };
}

function summarizeCapability(cap) {
  return {
    id: cap.id,
    outputFormat: cap.outputFormat,
    state: cap.state,
    engineId: cap.engineId,
    lossProfile: cap.lossProfile,
    warnings: cap.warnings ?? [],
    unavailableReason: cap.unavailableReason ?? null,
  };
}

function operationFromLegacyCapability(id) {
  const match = id.match(/^ffmpeg-(.+)-[^-]+$/);
  return match?.[1] ?? "transcode-audio";
}

function renderMarkdown(report) {
  const lines = [
    `# Anclora FileStudio Acceptance ${report.platform}`,
    "",
    `Base URL: ${report.baseUrl}`,
    `Started: ${report.startedAt}`,
    `Finished: ${report.finishedAt}`,
    "",
    "## Summary",
    "",
    `- Executed conversions: ${report.executedConversions}`,
    `- Passed: ${report.summary.passed}`,
    `- Failed: ${report.summary.failed}`,
    `- Blocked: ${report.summary.blocked}`,
    `- Not run: ${report.summary.notRun}`,
    `- Advertised but not executable: ${report.summary.advertisedButNotExecutable}`,
    "",
    "## Regression Checks",
    "",
    ...report.regressionChecks.map((check) => `- ${check.ok ? "PASS" : "FAIL"} ${check.id}: ${check.details}`),
    "",
    "## Failures",
    "",
  ];
  const failures = report.results.flatMap((fixture) => fixture.conversions.filter((conversion) => conversion.status === "failed").map((conversion) => ({ fixture: fixture.extension, conversion })));
  if (failures.length === 0) {
    lines.push("No conversion failures.");
  } else {
    for (const failure of failures) {
      lines.push(`- .${failure.fixture} ${failure.conversion.capabilityId}: ${failure.conversion.error}`);
    }
  }
  return `${lines.join("\n")}\n`;
}

function renderJunit(report) {
  const cases = [];
  for (const fixture of report.results) {
    for (const conversion of fixture.conversions) {
      const name = `${fixture.extension}:${conversion.capabilityId}`;
      if (conversion.status === "passed") {
        cases.push(`<testcase classname="acceptance.${xml(report.platform)}" name="${xml(name)}" time="${(conversion.durationMs ?? 0) / 1000}"/>`);
      } else if (conversion.status === "failed") {
        cases.push(`<testcase classname="acceptance.${xml(report.platform)}" name="${xml(name)}"><failure>${xml(conversion.error ?? "failed")}</failure></testcase>`);
      } else {
        cases.push(`<testcase classname="acceptance.${xml(report.platform)}" name="${xml(name)}"><skipped message="${xml(conversion.reason ?? conversion.status)}"/></testcase>`);
      }
    }
  }
  for (const check of report.regressionChecks) {
    const name = `regression:${check.id}`;
    cases.push(check.ok
      ? `<testcase classname="acceptance.${xml(report.platform)}" name="${xml(name)}"/>`
      : `<testcase classname="acceptance.${xml(report.platform)}" name="${xml(name)}"><failure>${xml(check.details)}</failure></testcase>`);
  }
  const failures = (report.summary.failed ?? 0) + report.regressionChecks.filter((check) => !check.ok).length;
  const skipped = (report.summary.blocked ?? 0) + (report.summary.notRun ?? 0);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<testsuite name="anclora-acceptance-${xml(report.platform)}" tests="${cases.length}" failures="${failures}" skipped="${skipped}">\n${cases.join("\n")}\n</testsuite>\n`;
}

function parseArgs(raw) {
  const parsed = {};
  for (let i = 0; i < raw.length; i += 1) {
    if (!raw[i].startsWith("--")) continue;
    const key = raw[i].slice(2);
    const next = raw[i + 1];
    parsed[key] = next && !next.startsWith("--") ? raw[++i] : "true";
  }
  return parsed;
}

function sha256(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function relativeOrAbsolute(filePath) {
  const relative = path.relative(repoRoot, filePath);
  return relative.startsWith("..") ? filePath : relative;
}

function xml(value) {
  return String(value).replace(/[<>&'"]/g, (char) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[char]);
}
