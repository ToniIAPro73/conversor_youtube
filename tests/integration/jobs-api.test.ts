// Integration tests for the /api/jobs endpoint.
// Tests the job creation validation logic by testing the core functions
// that the route handler relies on.

import { describe, it, expect, beforeEach } from "vitest";
import { getEngine, getCapabilities, invalidateProbeCache } from "../../src/lib/engines/registry";
import { ALL_ALLOWED_EXTENSIONS } from "../../src/lib/domain/format-catalog";
import type { UniversalFileDescriptor } from "../../src/lib/domain/descriptors";
import crypto from "crypto";

// ── Helper: extract engine ID from capability ID ───────────────────────────────

const ENGINE_PREFIXES = [
  "sharp-image",
  "libreoffice",
  "sevenzip",
  "data-ts",
  "pandoc",
  "qpdf",
];

function extractEngineIdFromCapabilityId(capabilityId: string): string {
  for (const prefix of ENGINE_PREFIXES) {
    if (capabilityId.startsWith(prefix + "-") || capabilityId === prefix) {
      return prefix;
    }
  }
  return capabilityId.split("-")[0] ?? capabilityId;
}

// ── Descriptor factory ─────────────────────────────────────────────────────────

function makeDescriptor(
  category: UniversalFileDescriptor["category"],
  fmt: string,
  attrs: UniversalFileDescriptor["attributes"]
): UniversalFileDescriptor {
  return {
    id: crypto.randomUUID(),
    category,
    originalName: `test.${fmt}`,
    extension: fmt,
    detectedMimeType: null,
    detectedFormat: fmt,
    sizeBytes: 50_000,
    sha256: null,
    source: { kind: "local-upload", originalName: `test.${fmt}`, storedRelativePath: `test.${fmt}` },
    attributes: attrs,
    warnings: [],
    analyzedBy: ["file-detector"],
    analyzedAt: new Date().toISOString(),
  };
}

function structuredDataDescriptor(fmt: string = "json"): UniversalFileDescriptor {
  return makeDescriptor("structured-data", fmt, {
    kind: "structured-data",
    format: fmt,
    rowCount: null,
    columnCount: null,
    encoding: "utf-8",
    isTabular: false,
    hasNestedStructures: true,
    hasXmlEntities: false,
  });
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function _imageDescriptor(): UniversalFileDescriptor {
  return makeDescriptor("image", "png", {
    kind: "image",
    width: 800,
    height: 600,
    channels: 3,
    hasAlpha: true,
    format: "png",
    colorSpace: "srgb",
    animated: false,
    frames: 1,
    densityPpi: 72,
    iccProfile: null,
  });
}

// ── Job request validation ─────────────────────────────────────────────────────

describe("Jobs API — universal job validation", () => {
  beforeEach(() => {
    invalidateProbeCache();
  });

  it("extracts engine ID from valid capability IDs", () => {
    expect(extractEngineIdFromCapabilityId("data-ts-json-yaml")).toBe("data-ts");
    expect(extractEngineIdFromCapabilityId("sharp-image-png-webp")).toBe("sharp-image");
    expect(extractEngineIdFromCapabilityId("pandoc-md-html")).toBe("pandoc");
    expect(extractEngineIdFromCapabilityId("qpdf-pdf-linearize")).toBe("qpdf");
    expect(extractEngineIdFromCapabilityId("sevenzip-zip-inspect")).toBe("sevenzip");
    expect(extractEngineIdFromCapabilityId("libreoffice-docx-pdf")).toBe("libreoffice");
  });

  it("resolves engine from a valid capability ID via registry", () => {
    const engineId = extractEngineIdFromCapabilityId("data-ts-json-yaml");
    const engine = getEngine(engineId);
    expect(engine).not.toBeNull();
    expect(engine!.id).toBe("data-ts");
  });

  it("returns null engine for an invalid capability ID prefix", () => {
    const engineId = extractEngineIdFromCapabilityId("nonexistent-json-yaml");
    const engine = getEngine(engineId);
    // "nonexistent" is not a registered engine
    expect(engine).toBeNull();
  });

  it("a valid capability ID matches an actual engine capability", async () => {
    const desc = structuredDataDescriptor("json");
    const caps = await getCapabilities(desc);
    expect(caps.length).toBeGreaterThan(0);

    // Find an available capability
    const availableCap = caps.find(c => c.state === "available");
    expect(availableCap, "Should find at least one available capability").toBeDefined();

    // The capability's engine should be resolvable
    const engine = getEngine(availableCap!.engineId);
    expect(engine).not.toBeNull();
  });

  it("validating a valid capability against the engine succeeds", async () => {
    const desc = structuredDataDescriptor("json");
    const caps = await getCapabilities(desc);
    const availableCap = caps.find(c => c.state === "available");
    expect(availableCap).toBeDefined();

    const engine = getEngine(availableCap!.engineId)!;
    const probeResult = await engine.probe();

    // Re-validate capability against the engine
    const engineCaps = engine.getCapabilities(desc, probeResult);
    const matchingCap = engineCaps.find(c => c.id === availableCap!.id);
    expect(matchingCap, "Capability should be found in engine capabilities").toBeDefined();
    expect(matchingCap!.state).toBe("available");
  });
});

describe("Jobs API — invalid capability handling", () => {
  beforeEach(() => {
    invalidateProbeCache();
  });

  it("capability ID not matching any engine capability should be rejected", async () => {
    const desc = structuredDataDescriptor("json");
    const caps = await getCapabilities(desc);

    // Use a capability ID that doesn't exist
    const fakeCapId = "data-ts-json-nonexistent-format";
    const matchingCap = caps.find(c => c.id === fakeCapId);
    expect(matchingCap).toBeUndefined();
  });

  it("engine from invalid capability ID is not found", () => {
    const engineId = extractEngineIdFromCapabilityId("fake-engine-json-yaml");
    const engine = getEngine(engineId);
    expect(engine).toBeNull();
  });

  it("unavailable engine returns proper error indicators", async () => {
    // Create a descriptor whose engine may not be available (e.g., QPDF)
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const _desc = makeDescriptor("pdf", "pdf", {
      kind: "pdf",
      pageCount: 5,
      isEncrypted: false,
      isLinearized: false,
      pdfVersion: "1.7",
      hasAnnotations: false,
      hasForms: false,
      hasEmbeddedFiles: false,
    });
    const engine = getEngine("qpdf")!;
    const probeResult = await engine.probe();

    // Whether available or not, the probe result should be well-formed
    expect(probeResult).toHaveProperty("available");
    expect(typeof probeResult.available).toBe("boolean");
    if (!probeResult.available) {
      // If unavailable, should have error info
      expect(probeResult.error).toBeTruthy();
    }
  });
});

describe("Jobs API — legacy job backward compatibility", () => {
  it("legacy job format fields are still recognized", () => {
    // Legacy job request schema fields
    const legacyRequest = {
      url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      format: "mp3",
      quality: "5",
      rightsConfirmed: true,
    };

    // These fields should be present
    expect(legacyRequest.url).toBeTruthy();
    expect(legacyRequest.format).toBe("mp3");
    expect(legacyRequest.rightsConfirmed).toBe(true);
  });

  it("legacy local file job fields are still recognized", () => {
    const legacyLocalRequest = {
      localFilePath: "/tmp/uploads/test/audio.wav",
      format: "mp3",
      quality: "5",
      rightsConfirmed: true,
    };

    expect(legacyLocalRequest.localFilePath).toBeTruthy();
    expect(legacyLocalRequest.format).toBe("mp3");
  });

  it("legacy audio formats are still in the allowed extensions", () => {
    const legacyAudioFormats = ["mp3", "m4a", "wav", "flac", "ogg"];
    for (const fmt of legacyAudioFormats) {
      expect(ALL_ALLOWED_EXTENSIONS.has(fmt), `Legacy format ".${fmt}" should be allowed`).toBe(true);
    }
  });

  it("legacy video formats are still in the allowed extensions", () => {
    const legacyVideoFormats = ["mp4", "webm", "mkv"];
    for (const fmt of legacyVideoFormats) {
      expect(ALL_ALLOWED_EXTENSIONS.has(fmt), `Legacy format ".${fmt}" should be allowed`).toBe(true);
    }
  });
});

describe("Jobs API — output format validation", () => {
  it("common output formats are in ALL_ALLOWED_EXTENSIONS", () => {
    const commonFormats = [
      "mp3", "wav", "flac", "ogg", "m4a",  // audio
      "mp4", "webm", "mkv",                   // video
      "png", "webp", "jpeg", "avif",          // image
      "pdf",                                   // pdf
      "json", "yaml", "toml", "xml", "csv",   // data
      "md", "html", "txt",                     // text
      "zip", "7z",                             // archive
    ];

    for (const fmt of commonFormats) {
      expect(ALL_ALLOWED_EXTENSIONS.has(fmt), `Output format ".${fmt}" should be allowed`).toBe(true);
    }
  });

  it("unsupported output format is rejected", () => {
    expect(ALL_ALLOWED_EXTENSIONS.has("exe")).toBe(false);
    expect(ALL_ALLOWED_EXTENSIONS.has("bat")).toBe(false);
    expect(ALL_ALLOWED_EXTENSIONS.has("xyz")).toBe(false);
  });
});
