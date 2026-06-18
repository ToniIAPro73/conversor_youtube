type Importer = (specifier: string) => Promise<unknown>;

const dynamicImporter = new Function("specifier", "return import(specifier)") as Importer;
const isVercelBuild =
  process.env.ANCLORA_FILESTUDIO_DEPLOYMENT_TARGET === "vercel" ||
  process.env.NEXT_PUBLIC_ANCLORA_FILESTUDIO_MODE === "vercel-web";

const desktopRouteImporters = isVercelBuild
  ? {}
  : {
      "batch-route": () => import("@/server/desktop-routes/batch-route"),
      "history-route": () => import("@/server/desktop-routes/history-route"),
      "jobs-route": () => import("@/server/desktop-routes/jobs-route"),
      "job-route": () => import("@/server/desktop-routes/job-route"),
      "job-token-route": () => import("@/server/desktop-routes/job-token-route"),
      "metadata-route": () => import("@/server/desktop-routes/metadata-route"),
      "download-route": () => import("@/server/desktop-routes/download-route"),
      "inputs-analyze-route": () => import("@/server/desktop-routes/inputs-analyze-route"),
    };

const desktopModuleImporters = isVercelBuild
  ? {}
  : {
      "fs": () => import("fs"),
      "@/lib/config": () => import("@/lib/config"),
      "@/lib/engines/registry": () => import("@/lib/engines/registry"),
      "@/lib/diagnostics/toolchain-probe": () => import("@/lib/diagnostics/toolchain-probe"),
      "@/lib/media/supported-conversions": () => import("@/lib/media/supported-conversions"),
    };

export async function loadDesktopRoute<T>(routeName: string): Promise<T> {
  const importer = desktopRouteImporters[routeName as keyof typeof desktopRouteImporters];
  if (importer) return importer() as Promise<T>;
  return dynamicImporter(`@/server/desktop-routes/${routeName}`) as Promise<T>;
}

export async function loadDesktopModule<T>(moduleName: string): Promise<T> {
  const importer = desktopModuleImporters[moduleName as keyof typeof desktopModuleImporters];
  if (importer) return importer() as Promise<T>;
  return dynamicImporter(moduleName) as Promise<T>;
}
