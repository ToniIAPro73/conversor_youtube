import { NextResponse } from "next/server";
import { diagnoseAllEngines } from "@/lib/engines/registry";
import { toolchainProbe } from "@/lib/diagnostics/toolchain-probe";

export const dynamic = "force-dynamic";

export async function GET() {
  const { dependencies, probeResults } = await toolchainProbe.run();

  const allOk = dependencies.every((d) => d.available);
  const criticalIds = new Set(["ytdlp", "ffmpeg", "ffprobe"]);
  const criticalOk = dependencies
    .filter((d) => criticalIds.has(d.id))
    .every((d) => d.available);

  // Engine diagnostics from registry
  let engineDiags: Array<{ engineId: string; available: boolean; version: string | null }> = [];
  try {
    const raw = await diagnoseAllEngines();
    engineDiags = raw.map((d) => ({
      engineId: d.engineId,
      available: d.enabled && d.probe.available,
      version: d.probe.version,
    }));
  } catch {
    // non-fatal
  }

  return NextResponse.json({
    ok: criticalOk,
    status: allOk ? "ready" : criticalOk ? "degraded" : "unavailable",
    app: {
      name: "Anclora FileStudio",
      version: process.env.npm_package_version ?? "0.1.0",
      buildId: process.env.ANCLORA_FILESTUDIO_BUILD_ID ?? "dev",
      toolchainId: process.env.ANCLORA_FILESTUDIO_TOOLCHAIN_ID ?? "local",
    },
    runtime: {
      platform: process.platform,
      arch: process.arch,
      nodeVersion: process.version,
    },
    timestamp: new Date().toISOString(),
    dependencies,
    engines: engineDiags,
    probeResults,
    summary: {
      total: dependencies.length,
      available: dependencies.filter((d) => d.available).length,
      missing: dependencies.filter((d) => !d.available).length,
    },
  });
}
