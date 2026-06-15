import { describe, it, expect } from "vitest";
import { getSupportedConversions, getRecommendedConversion } from "../../src/lib/media/supported-conversions";
import type { MediaDescriptor } from "../../src/lib/media/probe";

const TOOLS = { ffmpeg: true, ffprobe: true, ytdlp: true };

function makeDescriptor(overrides: Partial<MediaDescriptor>): MediaDescriptor {
  return {
    container: null,
    durationSeconds: 60,
    sizeBytes: null,
    bitrate: null,
    hasAudio: false,
    hasVideo: false,
    hasSubtitles: false,
    audioStreams: [],
    videoStreams: [],
    subtitleStreams: [],
    ...overrides,
  };
}

describe("getSupportedConversions — audio only", () => {
  const input = makeDescriptor({
    hasAudio: true,
    hasVideo: false,
    audioStreams: [{ index: 0, codec: "mp3", sampleRate: 44100, channels: 2, channelLayout: "stereo", bitrate: null, language: null, isDefault: true }],
  });

  const caps = getSupportedConversions(input, TOOLS);

  it("offers MP3 output", () => {
    expect(caps.some((c) => c.outputFormat === "mp3" && c.enabled)).toBe(true);
  });

  it("offers WAV, FLAC, M4A, OGG", () => {
    for (const fmt of ["wav", "flac", "m4a", "ogg"]) {
      expect(caps.some((c) => c.outputFormat === fmt && c.enabled)).toBe(true);
    }
  });

  it("does NOT offer MP4 or WebM or MKV", () => {
    for (const fmt of ["mp4", "webm", "mkv"]) {
      expect(caps.some((c) => c.outputFormat === fmt)).toBe(false);
    }
  });

  it("does NOT offer GIF", () => {
    expect(caps.some((c) => c.outputFormat === "gif")).toBe(false);
  });

  it("recommends MP3", () => {
    const rec = getRecommendedConversion(input, caps);
    expect(rec?.outputFormat).toBe("mp3");
  });
});

describe("getSupportedConversions — video + audio", () => {
  const input = makeDescriptor({
    hasAudio: true,
    hasVideo: true,
    durationSeconds: 120,
    audioStreams: [{ index: 1, codec: "aac", sampleRate: 48000, channels: 2, channelLayout: "stereo", bitrate: null, language: null, isDefault: true }],
    videoStreams: [{ index: 0, codec: "h264", width: 1920, height: 1080, fps: 30, bitrate: null, pixelFormat: "yuv420p", isDefault: true }],
  });

  const caps = getSupportedConversions(input, TOOLS);

  it("offers MP4, WebM, MKV", () => {
    for (const fmt of ["mp4", "webm", "mkv"]) {
      expect(caps.some((c) => c.outputFormat === fmt && c.enabled)).toBe(true);
    }
  });

  it("offers audio extraction", () => {
    expect(caps.some((c) => c.operation === "extract-audio" && c.enabled)).toBe(true);
  });

  it("offers GIF for short video", () => {
    expect(caps.some((c) => c.operation === "create-gif" && c.enabled)).toBe(true);
  });

  it("recommends MP4", () => {
    const rec = getRecommendedConversion(input, caps);
    expect(rec?.outputFormat).toBe("mp4");
  });

  it("does not offer preset heights above source (1080p max)", () => {
    const mp4Cap = caps.find((c) => c.outputFormat === "mp4");
    expect(mp4Cap).toBeDefined();
    for (const preset of mp4Cap!.presets) {
      const h = parseInt(preset.quality, 10);
      if (!isNaN(h)) expect(h).toBeLessThanOrEqual(1080);
    }
  });
});

describe("getSupportedConversions — video only (no audio)", () => {
  const input = makeDescriptor({
    hasAudio: false,
    hasVideo: true,
    videoStreams: [{ index: 0, codec: "h264", width: 1280, height: 720, fps: 25, bitrate: null, pixelFormat: "yuv420p", isDefault: true }],
  });

  const caps = getSupportedConversions(input, TOOLS);

  it("does NOT offer audio extraction", () => {
    expect(caps.some((c) => c.operation === "extract-audio")).toBe(false);
  });

  it("does NOT offer audio output formats", () => {
    for (const fmt of ["mp3", "wav", "flac", "m4a", "ogg"]) {
      expect(caps.some((c) => c.outputFormat === fmt)).toBe(false);
    }
  });

  it("offers GIF", () => {
    expect(caps.some((c) => c.operation === "create-gif" && c.enabled)).toBe(true);
  });
});

describe("getSupportedConversions — long video GIF warning", () => {
  const input = makeDescriptor({
    hasVideo: true,
    hasAudio: false,
    durationSeconds: 400, // > 300s limit
    videoStreams: [{ index: 0, codec: "h264", width: 1280, height: 720, fps: 25, bitrate: null, pixelFormat: null, isDefault: true }],
  });

  const caps = getSupportedConversions(input, TOOLS);

  it("disables GIF for very long videos", () => {
    const gif = caps.find((c) => c.operation === "create-gif");
    expect(gif?.enabled).toBe(false);
  });
});

describe("getSupportedConversions — missing tools", () => {
  const input = makeDescriptor({ hasAudio: true, hasVideo: true });

  it("returns empty array when ffmpeg is unavailable", () => {
    const caps = getSupportedConversions(input, { ...TOOLS, ffmpeg: false });
    expect(caps).toHaveLength(0);
  });
});
