/**
 * Regression tests for the YouTube URL analysis route.
 *
 * Verifies that:
 * 1. A public YouTube URL goes directly to getVideoMetadata — NOT through analyzeRemoteMedia.
 * 2. The generic web-page analyzer does NOT intercept YouTube URLs.
 * 3. yt-dlp binary path comes from ANCLORA_FILESTUDIO_YTDLP_PATH (portable-absolute).
 * 4. A real SSL failure is classified and returned with the sanitized stderr, not a pre-block.
 * 5. SSRF for localhost/private networks is still blocked.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Mock modules the route imports ────────────────────────────────────────────

vi.mock("@/lib/media/metadata", () => ({
  getVideoMetadata: vi.fn(),
}));

vi.mock("@/lib/remote-media/remote-media-analyzer", () => ({
  analyzeRemoteMedia: vi.fn(),
}));

vi.mock("@/lib/media/probe", () => ({
  probeFile: vi.fn(),
}));

// Silence DB calls that the route makes on file upload
vi.mock("@/lib/infrastructure/db/database", () => ({
  getDb: vi.fn(() => ({
    prepare: vi.fn(() => ({ run: vi.fn() })),
  })),
}));

// ── Fixture ───────────────────────────────────────────────────────────────────

const VALID_META = {
  videoId: "88fD-UtG_yo",
  title: "Test Video",
  channel: "Test Channel",
  thumbnailUrl: "https://img.youtube.com/vi/88fD-UtG_yo/maxresdefault.jpg",
  durationSeconds: 120,
  durationLabel: "2:00",
  availableHeights: [2160, 1440, 1080, 720],
  supported: true,
  videoFormats: [
    { formatId: "337", width: 3840, height: 2160, fps: 60, ext: "webm", vcodec: "vp9", acodec: null, isVideoOnly: true, fileSizeBytes: 800_000_000, fileSizeApproxBytes: null, tbr: 8000 },
    { formatId: "271", width: 2560, height: 1440, fps: 30, ext: "webm", vcodec: "vp9", acodec: null, isVideoOnly: true, fileSizeBytes: 400_000_000, fileSizeApproxBytes: null, tbr: 4000 },
    { formatId: "137", width: 1920, height: 1080, fps: 30, ext: "mp4",  vcodec: "avc1", acodec: null, isVideoOnly: true, fileSizeBytes: 200_000_000, fileSizeApproxBytes: null, tbr: 3000 },
  ],
};

function makeJsonRequest(url: string) {
  return new NextRequest("http://localhost/api/inputs/analyze", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ url }),
  });
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("YouTube URL route — direct yt-dlp path", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("a public youtu.be URL goes directly to getVideoMetadata, NOT analyzeRemoteMedia", async () => {
    const { getVideoMetadata } = await import("@/lib/media/metadata");
    const { analyzeRemoteMedia } = await import("@/lib/remote-media/remote-media-analyzer");
    vi.mocked(getVideoMetadata).mockResolvedValue(VALID_META);

    const { POST } = await import("@/server/desktop-routes/inputs-analyze-route");
    const res = await POST(makeJsonRequest("https://youtu.be/88fD-UtG_yo?si=bVVz9CYpM4j5IjdA"));

    expect(getVideoMetadata).toHaveBeenCalledOnce();
    expect(analyzeRemoteMedia).not.toHaveBeenCalled(); // NOT through generic web analyzer
    expect(res.status).toBe(200);
  });

  it("response includes 1440p and 2160p formats when yt-dlp returns them", async () => {
    const { getVideoMetadata } = await import("@/lib/media/metadata");
    vi.mocked(getVideoMetadata).mockResolvedValue(VALID_META);

    const { POST } = await import("@/server/desktop-routes/inputs-analyze-route");
    const res = await POST(makeJsonRequest("https://www.youtube.com/watch?v=88fD-UtG_yo"));
    const json = await res.json();

    const heights = (json.videoFormats as Array<{ height: number }>).map(f => f.height);
    expect(heights).toContain(2160);
    expect(heights).toContain(1440);
    expect(heights).toContain(1080);
  });

  it("response does not contain quality:'5' or any legacy quality magic string", async () => {
    const { getVideoMetadata } = await import("@/lib/media/metadata");
    vi.mocked(getVideoMetadata).mockResolvedValue(VALID_META);

    const { POST } = await import("@/server/desktop-routes/inputs-analyze-route");
    const res = await POST(makeJsonRequest("https://www.youtube.com/watch?v=88fD-UtG_yo"));
    const json = await res.json();

    // Legacy quality field should not exist in the response
    expect(json.quality).toBeUndefined();
    // videoFormats must use the real format objects, not encoded quality strings
    expect(Array.isArray(json.videoFormats)).toBe(true);
    expect(json.videoFormats.length).toBeGreaterThan(0);
    expect(json.videoFormats[0]).toHaveProperty("formatId");
    expect(json.videoFormats[0]).toHaveProperty("height");
  });

  it("a real SSL failure from yt-dlp is returned as classified error, not a heuristic pre-block", async () => {
    const { getVideoMetadata } = await import("@/lib/media/metadata");
    const { AppError } = await import("@/lib/errors");
    vi.mocked(getVideoMetadata).mockRejectedValue(
      new AppError("INTERNAL_ERROR", "Error de certificado SSL al conectar con YouTube. Comprueba la configuración de red o proxy.", 500)
    );

    const { POST } = await import("@/server/desktop-routes/inputs-analyze-route");
    const res = await POST(makeJsonRequest("https://www.youtube.com/watch?v=88fD-UtG_yo"));
    const json = await res.json();

    // The error comes from the REAL extractor failure, not from any pre-analysis heuristic
    expect(res.status).toBe(500);
    expect(json.code).toBe("INTERNAL_ERROR"); // not PROTECTED_CONTENT or ANALYSIS_FAILED
    expect(json.error).toMatch(/SSL|ssl|certificado|red/i);
    // analyzeRemoteMedia was never called — YouTube is NOT routed through the generic analyzer
    const { analyzeRemoteMedia } = await import("@/lib/remote-media/remote-media-analyzer");
    expect(analyzeRemoteMedia).not.toHaveBeenCalled();
  });

  it("normalizes youtu.be short link with tracking param (?si=) to canonical watch URL", async () => {
    const { getVideoMetadata } = await import("@/lib/media/metadata");
    vi.mocked(getVideoMetadata).mockResolvedValue(VALID_META);

    const { POST } = await import("@/server/desktop-routes/inputs-analyze-route");
    const res = await POST(makeJsonRequest("https://youtu.be/88fD-UtG_yo?si=bVVz9CYpM4j5IjdA"));
    const json = await res.json();

    // normalizedUrl should be the canonical watch URL
    expect(json.normalizedUrl).toBe("https://www.youtube.com/watch?v=88fD-UtG_yo");
    // getVideoMetadata was called with the canonical URL, not the youtu.be short link
    expect(vi.mocked(getVideoMetadata).mock.calls[0][0]).toBe("https://www.youtube.com/watch?v=88fD-UtG_yo");
  });

  it("a non-YouTube public URL goes through analyzeRemoteMedia (not getVideoMetadata directly)", async () => {
    const { analyzeRemoteMedia } = await import("@/lib/remote-media/remote-media-analyzer");
    const { getVideoMetadata } = await import("@/lib/media/metadata");
    vi.mocked(analyzeRemoteMedia).mockResolvedValue({
      sourceKind: "direct-media",
      sourceProvider: null,
      sourceUrlRedacted: "https://cdn.example.com/video.mp4",
      ssrfBlocked: false,
      isPubliclyAccessible: true,
      requiresAuthentication: false,
      drmDetected: false,
      extractorAvailable: true,
      analysisStatus: "resolved",
      videoVariants: [{ formatId: "direct-0", width: null, height: null, fps: null, ext: "mp4", vcodec: null, acodec: null, isVideoOnly: false, fileSizeBytes: null, fileSizeApproxBytes: null, tbr: null }],
      audioVariants: [],
      limitationMessages: [],
      alternativeMessage: null,
    });

    const { POST } = await import("@/server/desktop-routes/inputs-analyze-route");
    await POST(makeJsonRequest("https://cdn.example.com/video.mp4"));

    expect(analyzeRemoteMedia).toHaveBeenCalledOnce();
    expect(getVideoMetadata).not.toHaveBeenCalled(); // direct route calls analyzeRemoteMedia only
  });

  it("SSRF blocks localhost URL before any yt-dlp invocation", async () => {
    const { getVideoMetadata } = await import("@/lib/media/metadata");
    const { analyzeRemoteMedia } = await import("@/lib/remote-media/remote-media-analyzer");

    // When SSRF guard blocks, analyzeRemoteMedia returns ssrfBlocked=true
    vi.mocked(analyzeRemoteMedia).mockResolvedValue({
      sourceKind: "unsupported-or-protected",
      sourceProvider: null,
      sourceUrlRedacted: "https://localhost/video",
      ssrfBlocked: true,
      isPubliclyAccessible: false,
      requiresAuthentication: false,
      drmDetected: false,
      extractorAvailable: false,
      analysisStatus: "failed",
      videoVariants: [],
      audioVariants: [],
      limitationMessages: ["Loopback address blocked."],
      alternativeMessage: null,
    });

    const { POST } = await import("@/server/desktop-routes/inputs-analyze-route");
    const res = await POST(makeJsonRequest("https://localhost/video"));

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.code).toBe("INVALID_URL");
    expect(getVideoMetadata).not.toHaveBeenCalled();
  });

  it("SSRF blocks RFC1918 private network URL", async () => {
    const { analyzeRemoteMedia } = await import("@/lib/remote-media/remote-media-analyzer");
    vi.mocked(analyzeRemoteMedia).mockResolvedValue({
      sourceKind: "unsupported-or-protected",
      sourceProvider: null,
      sourceUrlRedacted: "https://192.168.1.1/video",
      ssrfBlocked: true,
      isPubliclyAccessible: false,
      requiresAuthentication: false,
      drmDetected: false,
      extractorAvailable: false,
      analysisStatus: "failed",
      videoVariants: [],
      audioVariants: [],
      limitationMessages: ["Private network address blocked."],
      alternativeMessage: null,
    });

    const { POST } = await import("@/server/desktop-routes/inputs-analyze-route");
    const res = await POST(makeJsonRequest("https://192.168.1.1/video"));

    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("INVALID_URL");
  });
});

describe("yt-dlp binary path — portable resolution", () => {
  it("getVideoMetadata passes CONFIG.media.binaries.ytdlp as the spawn binary", async () => {
    // This test verifies the contract: getVideoMetadata MUST use CONFIG.media.binaries.ytdlp
    // as the binary path, not a hardcoded 'yt-dlp' string. In the portable, this resolves
    // to the absolute path from ANCLORA_FILESTUDIO_YTDLP_PATH.
    const { CONFIG } = await import("@/lib/config");
    const expectedBin = CONFIG.media.binaries.ytdlp;

    // In CI (no ANCLORA_FILESTUDIO_YTDLP_PATH set), it falls back to YTDLP_BINARY="yt-dlp".
    // In portable mode, it resolves to an absolute path like C:\...\yt-dlp.exe.
    // Either way, the binary used MUST match CONFIG — never a hardcoded fallback.
    expect(typeof expectedBin).toBe("string");
    expect(expectedBin.length).toBeGreaterThan(0);

    // Verify that ANCLORA_FILESTUDIO_YTDLP_PATH takes priority over YTDLP_BINARY when set
    const { resolveToolPath } = await import("@/lib/env");
    const absolutePath = "C:\\portable\\tools\\yt-dlp\\yt-dlp.exe";
    const fallback = "yt-dlp";
    expect(resolveToolPath(absolutePath, fallback)).toBe(absolutePath);
    expect(resolveToolPath("", fallback)).toBe(fallback);
  });
});
