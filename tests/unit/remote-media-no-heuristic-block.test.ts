/**
 * Tests that prove no public URL is blocked by internal heuristics
 * (requiresAuthentication, ageVerification, botVerification, DRM keyword detection)
 * before the actual extractor (yt-dlp via getVideoMetadata) is invoked.
 *
 * Tests analyzeRemoteMedia in isolation. getVideoMetadata is mocked directly
 * to avoid spawn timing issues. SSRF guard and url-classifier are also mocked.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock getVideoMetadata directly ────────────────────────────────────────────
// We test analyzeRemoteMedia, not the yt-dlp spawn mechanics.
vi.mock("../../src/lib/media/metadata", () => ({
  getVideoMetadata: vi.fn(),
}));

// ── Mock SSRF guard to pass all public URLs ───────────────────────────────────
vi.mock("../../src/lib/remote-media/ssrf-guard", () => ({
  validateRemoteUrl: vi.fn().mockResolvedValue({ safe: true }),
  redactSensitiveQueryParams: vi.fn((url: string) => url),
}));

// ── Mock web-page-analyzer (HTML analysis, used as fallback) ──────────────────
vi.mock("../../src/lib/remote-media/web-page-analyzer", () => ({
  analyzeWebPage: vi.fn().mockResolvedValue({
    found: false,
    sources: [],
    drmDetected: false,
    requiresAuth: false,
    limitationMessage: null,
  }),
}));

// ── Mock url-classifier ───────────────────────────────────────────────────────
vi.mock("../../src/lib/remote-media/url-classifier", () => ({
  classifyRemoteUrl: vi.fn(),
}));

// ── Fixtures ──────────────────────────────────────────────────────────────────

const VALID_META = {
  videoId: "test12345678",
  title: "Public Test Video",
  channel: "Test Channel",
  thumbnailUrl: "https://example.com/thumb.jpg",
  durationSeconds: 60,
  durationLabel: "1:00",
  availableHeights: [1080],
  supported: true,
  videoFormats: [
    {
      formatId: "137",
      width: 1920,
      height: 1080,
      fps: 30,
      ext: "mp4",
      vcodec: "avc1",
      acodec: null,
      isVideoOnly: true,
      fileSizeBytes: 50_000_000,
      fileSizeApproxBytes: null,
      tbr: 3000,
    },
  ],
};

// ── Helpers ───────────────────────────────────────────────────────────────────

async function mockYtdlpSuccess() {
  const { getVideoMetadata } = await import("../../src/lib/media/metadata");
  vi.mocked(getVideoMetadata).mockResolvedValue(VALID_META);
}

async function mockYtdlpFailure(code: string, message: string, status = 500) {
  const { AppError } = await import("../../src/lib/errors");
  const { getVideoMetadata } = await import("../../src/lib/media/metadata");
  vi.mocked(getVideoMetadata).mockRejectedValue(
    new AppError(code as import("../../src/lib/errors").ErrorCode, message, status)
  );
}

async function setKind(kind: string, extra: Partial<import("../../src/lib/remote-media/url-classifier").RemoteUrlClassification> = {}) {
  const { classifyRemoteUrl } = await import("../../src/lib/remote-media/url-classifier");
  vi.mocked(classifyRemoteUrl).mockResolvedValue({
    kind: kind as import("../../src/lib/remote-media/url-classifier").SourceKind,
    sourceProvider: null,
    isPubliclyAccessible: true,
    requiresAuthentication: false,
    drmDetected: false,
    extractorAvailable: true,
    analysisStatus: "resolved",
    reason: null,
    ...extra,
  });
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("no heuristic pre-blocking: yt-dlp is always attempted", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { validateRemoteUrl } = await import("../../src/lib/remote-media/ssrf-guard");
    vi.mocked(validateRemoteUrl).mockResolvedValue({ safe: true });
    // Restore default web-page-analyzer mock after clearAllMocks
    const { analyzeWebPage } = await import("../../src/lib/remote-media/web-page-analyzer");
    vi.mocked(analyzeWebPage).mockResolvedValue({
      found: false, sources: [], drmDetected: false, requiresAuth: false, limitationMessage: null,
    });
  });

  it("a public YouTube URL reaches yt-dlp without any pre-block", async () => {
    await setKind("youtube", { sourceProvider: "YouTube" });
    await mockYtdlpSuccess();
    const { getVideoMetadata } = await import("../../src/lib/media/metadata");

    const { analyzeRemoteMedia } = await import("../../src/lib/remote-media/remote-media-analyzer");
    const result = await analyzeRemoteMedia("https://www.youtube.com/watch?v=dQw4w9WgXcQ");

    expect(getVideoMetadata).toHaveBeenCalledOnce(); // yt-dlp WAS invoked
    expect(result.ssrfBlocked).toBe(false);
    expect(result.classifiedError).toBeUndefined();
    expect(result.videoVariants.length).toBeGreaterThan(0);
  });

  it("a Vimeo URL (web-page) reaches yt-dlp without any pre-block", async () => {
    await setKind("web-page", { sourceProvider: "Vimeo" });
    await mockYtdlpSuccess();
    const { getVideoMetadata } = await import("../../src/lib/media/metadata");

    const { analyzeRemoteMedia } = await import("../../src/lib/remote-media/remote-media-analyzer");
    const result = await analyzeRemoteMedia("https://vimeo.com/123456789");

    expect(getVideoMetadata).toHaveBeenCalledOnce();
    expect(result.ssrfBlocked).toBe(false);
    expect(result.classifiedError).toBeUndefined();
    expect(result.videoVariants.length).toBeGreaterThan(0);
  });

  it("a URL classified as 'unsupported' still reaches yt-dlp", async () => {
    await setKind("unsupported-or-protected", {
      isPubliclyAccessible: false, // classifier pessimistic — but yt-dlp still tried
      extractorAvailable: false,
      analysisStatus: "failed",
      reason: "unknown site",
    });
    await mockYtdlpSuccess();
    const { getVideoMetadata } = await import("../../src/lib/media/metadata");

    const { analyzeRemoteMedia } = await import("../../src/lib/remote-media/remote-media-analyzer");
    const result = await analyzeRemoteMedia("https://somevideosite.example.com/video/123");

    expect(getVideoMetadata).toHaveBeenCalledOnce(); // yt-dlp tried for "unsupported"
    expect(result.ssrfBlocked).toBe(false);
    expect(result.videoVariants.length).toBeGreaterThan(0);
  });

  it("a direct MP4 URL is passed through without calling yt-dlp", async () => {
    await setKind("direct-media");

    const { analyzeRemoteMedia } = await import("../../src/lib/remote-media/remote-media-analyzer");
    const result = await analyzeRemoteMedia("https://cdn.example.com/video.mp4");

    const { getVideoMetadata } = await import("../../src/lib/media/metadata");
    expect(getVideoMetadata).not.toHaveBeenCalled(); // direct media — no yt-dlp
    expect(result.videoVariants.length).toBe(1);
    expect(result.videoVariants[0].ext).toBe("mp4");
  });

  it("a public HLS URL is passed through without calling yt-dlp", async () => {
    await setKind("hls");

    const { analyzeRemoteMedia } = await import("../../src/lib/remote-media/remote-media-analyzer");
    const result = await analyzeRemoteMedia("https://stream.example.com/playlist.m3u8");

    const { getVideoMetadata } = await import("../../src/lib/media/metadata");
    expect(getVideoMetadata).not.toHaveBeenCalled();
    expect(result.ssrfBlocked).toBe(false);
    expect(result.classifiedError).toBeUndefined();
    expect(result.drmDetected).toBe(false);
  });

  it("SSRF blocks private network URL without calling yt-dlp", async () => {
    const { validateRemoteUrl } = await import("../../src/lib/remote-media/ssrf-guard");
    vi.mocked(validateRemoteUrl).mockResolvedValue({
      safe: false,
      reason: "Dirección de red privada bloqueada.",
    });

    const { analyzeRemoteMedia } = await import("../../src/lib/remote-media/remote-media-analyzer");
    const result = await analyzeRemoteMedia("https://192.168.1.1/video.mp4");

    const { getVideoMetadata } = await import("../../src/lib/media/metadata");
    expect(getVideoMetadata).not.toHaveBeenCalled(); // SSRF blocked — no yt-dlp
    expect(result.ssrfBlocked).toBe(true);
    expect(result.videoVariants).toHaveLength(0);
  });

  it("SSRF blocks localhost URL", async () => {
    const { validateRemoteUrl } = await import("../../src/lib/remote-media/ssrf-guard");
    vi.mocked(validateRemoteUrl).mockResolvedValue({ safe: false, reason: "Loopback address blocked." });

    const { analyzeRemoteMedia } = await import("../../src/lib/remote-media/remote-media-analyzer");
    const result = await analyzeRemoteMedia("https://localhost/video.mp4");

    expect(result.ssrfBlocked).toBe(true);
  });
});

describe("real extractor failure — classified error, not heuristic block", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { validateRemoteUrl } = await import("../../src/lib/remote-media/ssrf-guard");
    vi.mocked(validateRemoteUrl).mockResolvedValue({ safe: true });
    const { analyzeWebPage } = await import("../../src/lib/remote-media/web-page-analyzer");
    vi.mocked(analyzeWebPage).mockResolvedValue({
      found: false, sources: [], drmDetected: false, requiresAuth: false, limitationMessage: null,
    });
  });

  it("yt-dlp bot-check failure returns PROVIDER_VERIFICATION, not CONTENT_RESTRICTED", async () => {
    await setKind("youtube", { sourceProvider: "YouTube" });
    await mockYtdlpFailure(
      "PROVIDER_VERIFICATION",
      "El proveedor requiere verificación anti-bot o captcha. Puede ser temporal — inténtalo de nuevo más tarde."
    );

    const { analyzeRemoteMedia } = await import("../../src/lib/remote-media/remote-media-analyzer");
    const result = await analyzeRemoteMedia("https://www.youtube.com/watch?v=dQw4w9WgXcQ");

    expect(result.classifiedError?.code).toBe("PROVIDER_VERIFICATION");
    expect(result.classifiedError?.code).not.toBe("CONTENT_RESTRICTED");
    expect(result.ssrfBlocked).toBe(false);
  });

  it("yt-dlp VIDEO_UNAVAILABLE returns VIDEO_UNAVAILABLE code", async () => {
    await setKind("web-page");
    await mockYtdlpFailure("VIDEO_UNAVAILABLE", "El vídeo no está disponible o ha sido eliminado.");

    const { analyzeRemoteMedia } = await import("../../src/lib/remote-media/remote-media-analyzer");
    const result = await analyzeRemoteMedia("https://vimeo.com/deleted-video");

    expect(result.classifiedError?.code).toBe("VIDEO_UNAVAILABLE");
    expect(result.ssrfBlocked).toBe(false);
  });

  it("a web-page URL with 'requiresAuth: true' from HTML analysis still invokes yt-dlp", async () => {
    await setKind("web-page");
    // HTML analysis reports auth required — this is the OLD heuristic block signal
    const { analyzeWebPage } = await import("../../src/lib/remote-media/web-page-analyzer");
    vi.mocked(analyzeWebPage).mockResolvedValue({
      found: false, sources: [], drmDetected: false,
      requiresAuth: true,   // ← heuristic would have blocked this before the fix
      limitationMessage: null,
    });
    await mockYtdlpSuccess(); // but yt-dlp succeeds
    const { getVideoMetadata } = await import("../../src/lib/media/metadata");

    const { analyzeRemoteMedia } = await import("../../src/lib/remote-media/remote-media-analyzer");
    const result = await analyzeRemoteMedia("https://example.com/page-with-login-nav-link");

    // yt-dlp WAS attempted even though HTML auth heuristic fired
    expect(getVideoMetadata).toHaveBeenCalledOnce();
    expect(result.ssrfBlocked).toBe(false);
    expect(result.classifiedError).toBeUndefined();
    expect(result.videoVariants.length).toBeGreaterThan(0);
  });

  it("a web-page URL with 'drmDetected: true' from HTML analysis still invokes yt-dlp", async () => {
    await setKind("web-page");
    // HTML analysis reports DRM keywords — this is the OLD heuristic block signal
    const { analyzeWebPage } = await import("../../src/lib/remote-media/web-page-analyzer");
    vi.mocked(analyzeWebPage).mockResolvedValue({
      found: false, sources: [], drmDetected: true,  // ← heuristic DRM keyword match
      requiresAuth: false, limitationMessage: null,
    });
    await mockYtdlpSuccess(); // but yt-dlp succeeds
    const { getVideoMetadata } = await import("../../src/lib/media/metadata");

    const { analyzeRemoteMedia } = await import("../../src/lib/remote-media/remote-media-analyzer");
    const result = await analyzeRemoteMedia("https://example.com/page-mentioning-widevine");

    // yt-dlp was NOT blocked by HTML DRM keyword detection
    expect(getVideoMetadata).toHaveBeenCalledOnce();
    expect(result.videoVariants.length).toBeGreaterThan(0);
  });
});
