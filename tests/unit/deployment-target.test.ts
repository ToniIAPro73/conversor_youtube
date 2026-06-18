import { afterEach, describe, expect, it } from "vitest";
import {
  areCloudUploadsEnabled,
  areServerConversionsEnabled,
  canSpawnExternalTools,
  canUseLocalFilesystem,
  getDeploymentTarget,
  getPublicFileStudioMode,
  isDesktopRuntime,
  isVercelWeb,
} from "../../src/lib/deployment-target";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

function clearTargetEnv() {
  delete process.env.ANCLORA_FILESTUDIO_DEPLOYMENT_TARGET;
  delete process.env.NEXT_PUBLIC_ANCLORA_FILESTUDIO_MODE;
  delete process.env.ANCLORA_FILESTUDIO_ENABLE_SERVER_CONVERSIONS;
  delete process.env.ANCLORA_FILESTUDIO_ENABLE_CLOUD_UPLOADS;
  delete process.env.VERCEL;
  Object.defineProperty(process.env, "NODE_ENV", {
    value: "development",
    configurable: true,
    enumerable: true,
    writable: true,
  });
  delete process.env.VITEST;
}

describe("deployment target", () => {
  it("defaults local development to desktop", () => {
    clearTargetEnv();
    expect(getDeploymentTarget()).toBe("desktop");
    expect(isDesktopRuntime()).toBe(true);
    expect(canUseLocalFilesystem()).toBe(true);
    expect(canSpawnExternalTools()).toBe(true);
  });

  it("uses explicit vercel target at runtime", () => {
    clearTargetEnv();
    process.env.ANCLORA_FILESTUDIO_DEPLOYMENT_TARGET = "vercel";
    process.env.NEXT_PUBLIC_ANCLORA_FILESTUDIO_MODE = "vercel-web";
    expect(getDeploymentTarget()).toBe("vercel");
    expect(getPublicFileStudioMode()).toBe("vercel-web");
    expect(isVercelWeb()).toBe(true);
    expect(canUseLocalFilesystem()).toBe(false);
    expect(canSpawnExternalTools()).toBe(false);
    expect(areServerConversionsEnabled()).toBe(false);
  });

  it("maps service-vps public mode to service target", () => {
    clearTargetEnv();
    process.env.NEXT_PUBLIC_ANCLORA_FILESTUDIO_MODE = "service-vps";
    expect(getDeploymentTarget()).toBe("service");
    expect(getPublicFileStudioMode()).toBe("service-vps");
  });

  it("fails closed in production Vercel when target is absent", () => {
    clearTargetEnv();
    process.env.VERCEL = "1";
    Object.defineProperty(process.env, "NODE_ENV", {
      value: "production",
      configurable: true,
      enumerable: true,
      writable: true,
    });
    expect(() => getDeploymentTarget()).toThrow(/DEPLOYMENT_TARGET/);
  });

  it("ignores invalid explicit values outside Vercel and falls back to desktop", () => {
    clearTargetEnv();
    process.env.ANCLORA_FILESTUDIO_DEPLOYMENT_TARGET = "invalid";
    expect(getDeploymentTarget()).toBe("desktop");
  });

  it("keeps cloud uploads disabled unless explicitly enabled", () => {
    clearTargetEnv();
    expect(areCloudUploadsEnabled()).toBe(false);
    process.env.ANCLORA_FILESTUDIO_ENABLE_CLOUD_UPLOADS = "true";
    expect(areCloudUploadsEnabled()).toBe(true);
  });
});
