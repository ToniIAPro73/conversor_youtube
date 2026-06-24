/**
 * Tests for probeOutputFile — mocks spawn, fs.existsSync and fs.statSync
 * to avoid real ffprobe execution in CI.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { PassThrough } from "stream";

const { mockSpawn, mockExistsSync, mockStatSync } = vi.hoisted(() => ({
  mockSpawn: vi.fn(),
  mockExistsSync: vi.fn().mockReturnValue(true),
  mockStatSync: vi.fn().mockReturnValue({ size: 52428800 }),
}));

vi.mock("child_process", () => ({ spawn: mockSpawn }));
vi.mock("fs", async (importOriginal) => {
  const mod = await importOriginal<typeof import("fs")>();
  return {
    ...mod,
    default: { ...mod, existsSync: mockExistsSync, statSync: mockStatSync },
    existsSync: mockExistsSync,
    statSync: mockStatSync,
  };
});

import { probeOutputFile } from "../../src/lib/media/probe";

/** Build a fake spawn child backed by a PassThrough for stdout. */
function fakeChild(jsonOutput: string, exitCode = 0, spawnError?: NodeJS.ErrnoException) {
  const stdoutStream = new PassThrough();
  const stderrStream = new PassThrough();

  const closeListeners: Array<(code: number | null) => void> = [];
  const errorListeners: Array<(err: NodeJS.ErrnoException) => void> = [];

  const child = {
    stdout: stdoutStream,
    stderr: stderrStream,
    kill: vi.fn(),
    on: vi.fn((event: string, cb: (arg: unknown) => void) => {
      if (event === "close") closeListeners.push(cb as (code: number | null) => void);
      if (event === "error") errorListeners.push(cb as (err: NodeJS.ErrnoException) => void);
    }),
  };

  if (spawnError) {
    setImmediate(() => errorListeners.forEach((cb) => cb(spawnError)));
  } else {
    setImmediate(() => {
      stdoutStream.push(Buffer.from(jsonOutput));
      stdoutStream.push(null);
      // Allow stream data to propagate before close fires
      setImmediate(() => closeListeners.forEach((cb) => cb(exitCode)));
    });
  }

  return child;
}

function makeVideoJson(opts: {
  width: number; height: number; fps: string;
  vcodec: string; acodec: string;
  duration: string; size: string; container: string;
}) {
  return JSON.stringify({
    streams: [
      { codec_type: "video", codec_name: opts.vcodec, width: opts.width, height: opts.height, r_frame_rate: opts.fps },
      { codec_type: "audio", codec_name: opts.acodec },
    ],
    format: { format_name: opts.container, duration: opts.duration, size: opts.size },
  });
}

describe("probeOutputFile", () => {
  beforeEach(() => {
    mockSpawn.mockReset();
    mockExistsSync.mockReturnValue(true);
    mockStatSync.mockReturnValue({ size: 52428800 });
  });

  it("returns structured metadata for a valid 1080p file", async () => {
    mockStatSync.mockReturnValue({ size: 52428800 });
    mockSpawn.mockReturnValueOnce(
      fakeChild(makeVideoJson({
        width: 1920, height: 1080, fps: "30/1",
        vcodec: "h264", acodec: "aac",
        duration: "120.5", size: "52428800", container: "mp4",
      }))
    );

    const result = await probeOutputFile("/tmp/output.mp4", "/usr/bin/ffprobe");

    expect(result.width).toBe(1920);
    expect(result.height).toBe(1080);
    expect(result.fps).toBe(30);
    expect(result.videoCodec).toBe("h264");
    expect(result.audioCodec).toBe("aac");
    expect(result.durationSeconds).toBeCloseTo(120.5, 1);
    expect(result.fileSizeBytes).toBe(52428800);
  });

  it("returns height 2160 and ~60fps for a 4K 60fps file", async () => {
    mockStatSync.mockReturnValue({ size: 524288000 });
    mockSpawn.mockReturnValueOnce(
      fakeChild(makeVideoJson({
        width: 3840, height: 2160, fps: "60000/1001",
        vcodec: "vp9", acodec: "opus",
        duration: "300", size: "524288000", container: "matroska,webm",
      }))
    );

    const result = await probeOutputFile("/tmp/4k.webm", "/usr/bin/ffprobe");

    expect(result.height).toBe(2160);
    expect(result.width).toBe(3840);
    expect(result.videoCodec).toBe("vp9");
    expect(result.audioCodec).toBe("opus");
    // 60000/1001 ≈ 59.94
    expect(result.fps).toBeGreaterThan(59);
    expect(result.fps).toBeLessThan(61);
  });

  it("throws ARTIFACT_VALIDATION_FAILED when file does not exist", async () => {
    mockExistsSync.mockReturnValue(false);

    await expect(
      probeOutputFile("/tmp/missing.mp4", "/usr/bin/ffprobe")
    ).rejects.toMatchObject({ code: "ARTIFACT_VALIDATION_FAILED" });
  });

  it("throws DEPENDENCY_MISSING when ffprobe binary is not found (ENOENT)", async () => {
    const err = Object.assign(new Error("ENOENT"), { code: "ENOENT" }) as NodeJS.ErrnoException;
    mockSpawn.mockReturnValueOnce(fakeChild("", 0, err));

    await expect(
      probeOutputFile("/tmp/output.mp4", "/nonexistent/ffprobe")
    ).rejects.toMatchObject({ code: "DEPENDENCY_MISSING" });
  });

  it("rejects when ffprobe exits with non-zero exit code", async () => {
    mockSpawn.mockReturnValueOnce(fakeChild("", 1));

    await expect(
      probeOutputFile("/tmp/output.mp4", "/usr/bin/ffprobe")
    ).rejects.toBeDefined();
  });
});
