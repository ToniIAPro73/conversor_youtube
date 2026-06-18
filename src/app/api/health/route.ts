import { NextResponse } from "next/server";
import { loadDesktopModule } from "@/app/api/_desktop-route-loader";
import {
  areCloudUploadsEnabled,
  areServerConversionsEnabled,
  getDeploymentTarget,
  getPublicFileStudioMode,
  isVercelWeb,
} from "@/lib/deployment-target";
import { getAncloraRuntimePlatform } from "@/lib/runtime-platform";

export const dynamic = "force-dynamic";

export async function GET() {
  if (isVercelWeb()) {
    return NextResponse.json({
      ok: true,
      status: "web-preview",
      app: {
        name: "Anclora FileStudio",
        version: process.env.npm_package_version ?? "0.1.0",
      },
      runtime: {
        deploymentTarget: getDeploymentTarget(),
        effectivePlatform: getPublicFileStudioMode(),
        nodeVersion: process.version,
      },
      serverConversions: areServerConversionsEnabled(),
      cloudUploads: areCloudUploadsEnabled(),
      timestamp: new Date().toISOString(),
    });
  }

  const registryModule = "@/lib/engines/registry";
  const probeModule = "@/lib/diagnostics/toolchain-probe";
  const [{ diagnoseAllEngines }, { toolchainProbe }] = await Promise.all([
    loadDesktopModule<typeof import("@/lib/engines/registry")>(registryModule),
    loadDesktopModule<typeof import("@/lib/diagnostics/toolchain-probe")>(probeModule),
  ]);
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
      effectivePlatform: getAncloraRuntimePlatform(),
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
