import { afterEach, describe, expect, it } from "vitest";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

function enableVercelWeb() {
  process.env.ANCLORA_FILESTUDIO_DEPLOYMENT_TARGET = "vercel";
  process.env.NEXT_PUBLIC_ANCLORA_FILESTUDIO_MODE = "vercel-web";
  process.env.ANCLORA_FILESTUDIO_ENABLE_SERVER_CONVERSIONS = "false";
  process.env.ANCLORA_FILESTUDIO_ENABLE_CLOUD_UPLOADS = "false";
}

describe("Vercel API mode", () => {
  it("health is honest and does not run tool probes", async () => {
    enableVercelWeb();
    const route = await import("../../src/app/api/health/route");
    const response = await route.GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe("web-preview");
    expect(body.runtime.deploymentTarget).toBe("vercel");
    expect(body.runtime.effectivePlatform).toBe("vercel-web");
    expect(body.serverConversions).toBe(false);
    expect(body.cloudUploads).toBe(false);
    expect(body.dependencies).toBeUndefined();
  });

  it("GET capabilities exposes browser and desktop-required categories", async () => {
    enableVercelWeb();
    const route = await import("../../src/app/api/capabilities/route");
    const response = await route.GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.categories.browser).toContain("json");
    expect(body.categories.browser).toContain("pdf");
    expect(body.categories.browser).toContain("webp");
    expect(body.categories["desktop-required"]).toContain("video");
    expect(body.serverConversions).toBe(false);
  });

  it("POST capabilities only marks browser structured conversions available", async () => {
    enableVercelWeb();
    const route = await import("../../src/app/api/capabilities/route");
    const request = new Request("http://localhost/api/capabilities", {
      method: "POST",
      body: JSON.stringify({
        universalDescriptor: {
          category: "structured-data",
          extension: "json",
          detectedFormat: "json",
        },
      }),
    });

    const response = await route.POST(request as never);
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.capabilities.some((cap: { id: string }) => cap.id === "browser-json-to-yaml")).toBe(true);
    expect(body.capabilities.some((cap: { id: string }) => cap.id.includes("desktop-required"))).toBe(true);
  });

  it("blocks Desktop-only routes before work starts", async () => {
    enableVercelWeb();
    const route = await import("../../src/app/api/metadata/route");
    const response = await route.POST(new Request("http://localhost/api/metadata") as never);
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.error.code).toBe("DESKTOP_REQUIRED");
    expect(body.error.deploymentTarget).toBe("vercel");
  });
});
