export type AncloraRuntimePlatform = "windows" | NodeJS.Platform;

export function getAncloraRuntimePlatform(): AncloraRuntimePlatform {
  const explicit = process.env.ANCLORA_FILESTUDIO_PLATFORM?.trim().toLowerCase();
  if (explicit === "windows" || explicit === "win32") return "windows";
  return process.platform;
}

export function isAncloraWindowsRuntime(): boolean {
  return getAncloraRuntimePlatform() === "windows" || getAncloraRuntimePlatform() === "win32";
}
