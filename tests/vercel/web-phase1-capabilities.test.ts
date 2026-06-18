import { afterEach, describe, expect, it } from "vitest";
import { WEB_TOOL_CAPABILITIES } from "../../src/lib/browser-tools/capabilities";
import { parsePageRanges } from "../../src/lib/browser-tools/pdf/ranges";

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

describe("Web Phase 1 capabilities", () => {
  it("declares images, PDF and structured data as browser-local tools", () => {
    expect(WEB_TOOL_CAPABILITIES.images.execution).toBe("browser");
    expect(WEB_TOOL_CAPABILITIES.images.uploads).toBe(false);
    expect(WEB_TOOL_CAPABILITIES.images.operations).toContain("strip-exif");
    expect(WEB_TOOL_CAPABILITIES.pdf.operations).toContain("merge");
    expect(WEB_TOOL_CAPABILITIES.pdf.operations).toContain("images-to-pdf");
    expect(WEB_TOOL_CAPABILITIES.structuredData.inputs).toContain("json");
  });

  it("GET /api/capabilities includes image and PDF browser categories without server conversions", async () => {
    enableVercelWeb();
    const route = await import("../../src/app/api/capabilities/route");
    const response = await route.GET();
    const body = await response.json();
    expect(body.execution).toBe("browser");
    expect(body.uploads).toBe(false);
    expect(body.serverConversions).toBe(false);
    expect(body.categories.browser).toContain("pdf");
    expect(body.categories.browser).toContain("png");
    expect(body.categories["desktop-required"]).not.toContain("image");
    expect(body.categories["desktop-required"]).not.toContain("pdf");
  });

  it("POST /api/capabilities returns browser image operations", async () => {
    enableVercelWeb();
    const route = await import("../../src/app/api/capabilities/route");
    const response = await route.POST(new Request("http://localhost/api/capabilities", {
      method: "POST",
      body: JSON.stringify({ universalDescriptor: { category: "image", extension: "png", detectedFormat: "png" } }),
    }) as never);
    const body = await response.json();
    expect(body.inputCategory).toBe("image");
    expect(body.execution).toBe("browser");
    expect(body.capabilities.some((cap: { id: string }) => cap.id === "browser-image-strip-exif")).toBe(true);
  });

  it("POST /api/capabilities returns browser PDF operations", async () => {
    enableVercelWeb();
    const route = await import("../../src/app/api/capabilities/route");
    const response = await route.POST(new Request("http://localhost/api/capabilities", {
      method: "POST",
      body: JSON.stringify({ universalDescriptor: { category: "pdf", extension: "pdf", detectedFormat: "pdf" } }),
    }) as never);
    const body = await response.json();
    expect(body.inputCategory).toBe("pdf");
    expect(body.execution).toBe("browser");
    expect(body.capabilities.some((cap: { id: string }) => cap.id === "browser-pdf-merge")).toBe(true);
  });
});

describe("PDF range parser", () => {
  it("parses comma-separated pages and ranges", () => {
    expect(parsePageRanges("1-3,7,10-12", 12)).toEqual([1, 2, 3, 7, 10, 11, 12]);
  });

  it("rejects reversed ranges", () => {
    expect(() => parsePageRanges("3-1", 4)).toThrow(/invertido/);
  });

  it("rejects pages outside the document", () => {
    expect(() => parsePageRanges("1,5", 4)).toThrow(/no existe/);
  });
});
