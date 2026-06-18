/**
 * Tests for Web UX health route improvements.
 * Verifies that VERCEL_ENV=production returns "web-production"
 * and all other Vercel environments return "web-preview".
 */
import { afterEach, describe, expect, it } from "vitest";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  // Clear module cache so each test reimports fresh
});

function enableVercelWeb(vercelEnv?: string) {
  process.env.ANCLORA_FILESTUDIO_DEPLOYMENT_TARGET = "vercel";
  process.env.NEXT_PUBLIC_ANCLORA_FILESTUDIO_MODE = "vercel-web";
  process.env.ANCLORA_FILESTUDIO_ENABLE_SERVER_CONVERSIONS = "false";
  process.env.ANCLORA_FILESTUDIO_ENABLE_CLOUD_UPLOADS = "false";
  if (vercelEnv !== undefined) {
    process.env.VERCEL_ENV = vercelEnv;
  } else {
    delete process.env.VERCEL_ENV;
  }
}

describe("health route — web status", () => {
  it("returns web-preview when VERCEL_ENV is not set", async () => {
    enableVercelWeb();
    const { GET } = await import("../../src/app/api/health/route");
    const response = await GET();
    const body = await response.json();
    expect(body.status).toBe("web-preview");
  });

  it("returns web-preview when VERCEL_ENV=preview", async () => {
    enableVercelWeb("preview");
    const { GET } = await import("../../src/app/api/health/route");
    const response = await GET();
    const body = await response.json();
    expect(body.status).toBe("web-preview");
  });

  it("returns web-preview when VERCEL_ENV=development", async () => {
    enableVercelWeb("development");
    const { GET } = await import("../../src/app/api/health/route");
    const response = await GET();
    const body = await response.json();
    expect(body.status).toBe("web-preview");
  });

  it("returns web-production when VERCEL_ENV=production", async () => {
    enableVercelWeb("production");
    const { GET } = await import("../../src/app/api/health/route");
    const response = await GET();
    const body = await response.json();
    expect(body.status).toBe("web-production");
  });

  it("always returns ok: true in web mode", async () => {
    enableVercelWeb("production");
    const { GET } = await import("../../src/app/api/health/route");
    const response = await GET();
    const body = await response.json();
    expect(body.ok).toBe(true);
  });

  it("does not include dependencies in web mode", async () => {
    enableVercelWeb();
    const { GET } = await import("../../src/app/api/health/route");
    const response = await GET();
    const body = await response.json();
    expect(body.dependencies).toBeUndefined();
  });
});
