export type DeploymentTarget = "desktop" | "vercel" | "service" | "test";

const VALID_TARGETS = new Set<DeploymentTarget>(["desktop", "vercel", "service", "test"]);

function normalizeTarget(value: string | undefined): DeploymentTarget | null {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return null;
  if (normalized === "vercel-web") return "vercel";
  if (normalized === "service-vps") return "service";
  return VALID_TARGETS.has(normalized as DeploymentTarget)
    ? (normalized as DeploymentTarget)
    : null;
}

function isProductionLike(): boolean {
  return process.env.NODE_ENV === "production" || process.env.VERCEL === "1";
}

export function getDeploymentTarget(): DeploymentTarget {
  const explicit = normalizeTarget(process.env.ANCLORA_FILESTUDIO_DEPLOYMENT_TARGET);
  if (explicit) return explicit;

  const publicMode = process.env.NEXT_PUBLIC_ANCLORA_FILESTUDIO_MODE?.trim().toLowerCase();
  if (publicMode === "vercel-web") return "vercel";
  if (publicMode === "desktop") return "desktop";
  if (publicMode === "service-vps") return "service";
  if (publicMode === "test") return "test";

  if (process.env.VERCEL === "1") {
    if (isProductionLike()) {
      throw new Error("ANCLORA_FILESTUDIO_DEPLOYMENT_TARGET must be set in Vercel production.");
    }
    return "vercel";
  }

  if (process.env.VITEST === "true" || process.env.NODE_ENV === "test") return "test";

  return "desktop";
}

export function getPublicFileStudioMode(): "desktop" | "vercel-web" | "service-vps" | "test" {
  const explicit = process.env.NEXT_PUBLIC_ANCLORA_FILESTUDIO_MODE?.trim().toLowerCase();
  if (explicit === "vercel-web" || explicit === "desktop" || explicit === "service-vps" || explicit === "test") {
    return explicit;
  }

  const target = getDeploymentTarget();
  if (target === "vercel") return "vercel-web";
  if (target === "service") return "service-vps";
  return target;
}

export function isVercelWeb(): boolean {
  return getDeploymentTarget() === "vercel" || getPublicFileStudioMode() === "vercel-web";
}

export function isDesktopRuntime(): boolean {
  return getDeploymentTarget() === "desktop";
}

export function canUseLocalFilesystem(): boolean {
  const target = getDeploymentTarget();
  return target === "desktop" || target === "service" || target === "test";
}

export function canSpawnExternalTools(): boolean {
  const target = getDeploymentTarget();
  return target === "desktop" || target === "service" || target === "test";
}

export function areServerConversionsEnabled(): boolean {
  if (isVercelWeb()) return false;
  return process.env.ANCLORA_FILESTUDIO_ENABLE_SERVER_CONVERSIONS !== "false";
}

export function areCloudUploadsEnabled(): boolean {
  return process.env.ANCLORA_FILESTUDIO_ENABLE_CLOUD_UPLOADS === "true";
}
