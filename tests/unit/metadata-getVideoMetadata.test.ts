/**
 * Integration tests for getVideoMetadata() in src/lib/media/metadata.ts
 *
 * All spawn calls are mocked — no real yt-dlp binary required.
 * Covers: exit code 0 success, non-zero error patterns, timeout (null code),
 *         ENOENT (binary not found), invalid JSON output.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { EventEmitter } from "events";
import * as child_process from "child_process";

// ── Hoisted mock for child_process ────────────────────────────────────────────
vi.mock("child_process", async (importOriginal) => {
  const original = await importOriginal<typeof import("child_process")>();
  return { ...original, spawn: vi.fn() };
});

// ── Hoisted mock for fs (suppress log writes in tests) ────────────────────────
// Must include `default` so that `import fs from "fs"` in metadata.ts gets the
// mocked functions (CJS interop: default export = module namespace object).
vi.mock("fs", async (importOriginal) => {
  const original = await importOriginal<typeof import("fs")>();
  const mocked = {
    ...original,
    mkdirSync: vi.fn(),
    appendFileSync: vi.fn(),
    existsSync: vi.fn().mockReturnValue(true),
  };
  return { ...mocked, default: mocked };
});

// ── Helpers ────────────────────────────────────────────────────────────────────

interface FakeProcess extends EventEmitter {
  stdout: EventEmitter;
  stderr: EventEmitter;
}

function makeFakeProcess(): FakeProcess {
  const proc = new EventEmitter() as FakeProcess;
  proc.stdout = new EventEmitter();
  proc.stderr = new EventEmitter();
  return proc;
}

/** Minimal valid yt-dlp --dump-single-json output for a 1080p video */
const VALID_METADATA_JSON = JSON.stringify({
  id: "88fD-UtG_yo",
  title: "Test Video",
  uploader: "Test Channel",
  thumbnail: "https://img.youtube.com/vi/88fD-UtG_yo/maxresdefault.jpg",
  duration: 120,
  formats: [
    {
      format_id: "137",
      vcodec: "avc1.640028",
      acodec: "none",
      height: 1080,
      width: 1920,
      fps: 30,
      ext: "mp4",
      filesize: 50000000,
      tbr: 3000,
    },
    {
      format_id: "140",
      vcodec: "none",
      acodec: "mp4a.40.2",
      height: null,
      width: null,
      fps: null,
      ext: "m4a",
      filesize: 5000000,
      tbr: 128,
    },
    {
      format_id: "313",
      vcodec: "vp9",
      acodec: "none",
      height: 2160,
      width: 3840,
      fps: 60,
      ext: "webm",
      filesize: null,
      tbr: 8000,
    },
  ],
});

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("getVideoMetadata — success path", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("resolves with title, videoFormats array (1080p + 2160p), and availableHeights", async () => {
    const spawnMock = vi.mocked(child_process.spawn);
    const proc = makeFakeProcess();
    spawnMock.mockReturnValue(proc as unknown as ReturnType<typeof child_process.spawn>);

    const { getVideoMetadata } = await import("../../src/lib/media/metadata");
    const promise = getVideoMetadata("https://www.youtube.com/watch?v=88fD-UtG_yo");

    proc.stdout.emit("data", VALID_METADATA_JSON);
    proc.emit("close", 0);

    const result = await promise;
    expect(result.title).toBe("Test Video");
    expect(result.videoId).toBe("88fD-UtG_yo");
    expect(result.availableHeights).toContain(1080);
    expect(result.availableHeights).toContain(2160);
    expect(result.videoFormats.some((f) => f.height === 2160 && f.fps === 60)).toBe(true);
    expect(result.videoFormats.some((f) => f.height === 1080)).toBe(true);
    expect(result.durationSeconds).toBe(120);
  });

  it("does NOT invoke --no-check-certificates in the spawn args", async () => {
    const spawnMock = vi.mocked(child_process.spawn);
    let capturedArgs: string[] = [];
    const proc = makeFakeProcess();
    spawnMock.mockImplementation((_bin, args) => {
      capturedArgs = args as string[];
      return proc as unknown as ReturnType<typeof child_process.spawn>;
    });

    const { getVideoMetadata } = await import("../../src/lib/media/metadata");
    const promise = getVideoMetadata("https://www.youtube.com/watch?v=88fD-UtG_yo");

    proc.stdout.emit("data", VALID_METADATA_JSON);
    proc.emit("close", 0);

    await promise;
    expect(capturedArgs).not.toContain("--no-check-certificates");
    expect(capturedArgs).toContain("--dump-single-json");
    expect(capturedArgs).toContain("--skip-download");
    expect(capturedArgs).toContain("--no-playlist");
  });

  it("uses shell: false in spawn options", async () => {
    const spawnMock = vi.mocked(child_process.spawn);
    let capturedOptions: Record<string, unknown> = {};
    const proc = makeFakeProcess();
    spawnMock.mockImplementation((_bin, _args, options) => {
      capturedOptions = options as Record<string, unknown>;
      return proc as unknown as ReturnType<typeof child_process.spawn>;
    });

    const { getVideoMetadata } = await import("../../src/lib/media/metadata");
    const promise = getVideoMetadata("https://www.youtube.com/watch?v=88fD-UtG_yo");

    proc.stdout.emit("data", VALID_METADATA_JSON);
    proc.emit("close", 0);

    await promise;
    expect(capturedOptions.shell).toBe(false);
  });
});

describe("getVideoMetadata — yt-dlp failure paths", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("rejects with VIDEO_UNAVAILABLE when stderr contains 'Video unavailable'", async () => {
    const spawnMock = vi.mocked(child_process.spawn);
    const proc = makeFakeProcess();
    spawnMock.mockReturnValue(proc as unknown as ReturnType<typeof child_process.spawn>);

    const { getVideoMetadata } = await import("../../src/lib/media/metadata");
    const promise = getVideoMetadata("https://www.youtube.com/watch?v=unavailable");

    proc.stderr.emit("data", "ERROR: [youtube] unavailable: Video unavailable\n");
    proc.emit("close", 1);

    await expect(promise).rejects.toMatchObject({
      code: "VIDEO_UNAVAILABLE",
    });
  });

  it("rejects with PROVIDER_VERIFICATION when stderr contains 'Sign in to confirm you're not a bot'", async () => {
    const spawnMock = vi.mocked(child_process.spawn);
    const proc = makeFakeProcess();
    spawnMock.mockReturnValue(proc as unknown as ReturnType<typeof child_process.spawn>);

    const { getVideoMetadata } = await import("../../src/lib/media/metadata");
    const promise = getVideoMetadata("https://www.youtube.com/watch?v=botcheck");

    proc.stderr.emit(
      "data",
      "ERROR: [youtube] botcheck: Sign in to confirm you're not a bot.\n"
    );
    proc.emit("close", 1);

    // Bot check is PROVIDER_VERIFICATION, not CONTENT_RESTRICTED
    await expect(promise).rejects.toMatchObject({
      code: "PROVIDER_VERIFICATION",
    });
  });

  it("rejects with CONTENT_RESTRICTED when stderr contains age restriction", async () => {
    const spawnMock = vi.mocked(child_process.spawn);
    const proc = makeFakeProcess();
    spawnMock.mockReturnValue(proc as unknown as ReturnType<typeof child_process.spawn>);

    const { getVideoMetadata } = await import("../../src/lib/media/metadata");
    const promise = getVideoMetadata("https://www.youtube.com/watch?v=agerestricted");

    proc.stderr.emit(
      "data",
      "ERROR: [youtube] agerestricted: Sign in to confirm your age.\n"
    );
    proc.emit("close", 1);

    await expect(promise).rejects.toMatchObject({
      code: "CONTENT_RESTRICTED",
    });
  });

  it("rejects with RATE_LIMITED when stderr contains '429 Too Many Requests'", async () => {
    const spawnMock = vi.mocked(child_process.spawn);
    const proc = makeFakeProcess();
    spawnMock.mockReturnValue(proc as unknown as ReturnType<typeof child_process.spawn>);

    const { getVideoMetadata } = await import("../../src/lib/media/metadata");
    const promise = getVideoMetadata("https://www.youtube.com/watch?v=ratelimited");

    proc.stderr.emit("data", "WARNING: HTTP Error 429: Too Many Requests\n");
    proc.emit("close", 1);

    await expect(promise).rejects.toMatchObject({
      code: "RATE_LIMITED",
    });
  });

  it("rejects with INTERNAL_ERROR on SSL failure and logs to file", async () => {
    const spawnMock = vi.mocked(child_process.spawn);
    const fsMock = await import("fs");
    const proc = makeFakeProcess();
    spawnMock.mockReturnValue(proc as unknown as ReturnType<typeof child_process.spawn>);

    const { getVideoMetadata } = await import("../../src/lib/media/metadata");
    const promise = getVideoMetadata("https://www.youtube.com/watch?v=sslfail");

    proc.stderr.emit(
      "data",
      "ERROR: unable to download webpage: <urlopen error [SSL: CERTIFICATE_VERIFY_FAILED] certificate verify failed>\n"
    );
    proc.emit("close", 1);

    await expect(promise).rejects.toMatchObject({
      code: "INTERNAL_ERROR",
      message: expect.stringMatching(/SSL|certificado|ssl/i),
    });
    // Verify that the error was logged to file
    expect(fsMock.appendFileSync).toHaveBeenCalled();
  });

  it("rejects with CONVERSION_TIMEOUT when process is killed (exit code null)", async () => {
    const spawnMock = vi.mocked(child_process.spawn);
    const proc = makeFakeProcess();
    spawnMock.mockReturnValue(proc as unknown as ReturnType<typeof child_process.spawn>);

    const { getVideoMetadata } = await import("../../src/lib/media/metadata");
    const promise = getVideoMetadata("https://www.youtube.com/watch?v=slow");

    // Simulate timeout kill: Node.js sends null as exit code
    proc.emit("close", null);

    await expect(promise).rejects.toMatchObject({
      code: "CONVERSION_TIMEOUT",
    });
  });

  it("rejects with DEPENDENCY_MISSING when binary is not found (ENOENT)", async () => {
    const spawnMock = vi.mocked(child_process.spawn);
    const proc = makeFakeProcess();
    spawnMock.mockReturnValue(proc as unknown as ReturnType<typeof child_process.spawn>);

    const { getVideoMetadata } = await import("../../src/lib/media/metadata");
    const promise = getVideoMetadata("https://www.youtube.com/watch?v=noop");

    // Simulate OS-level ENOENT: the binary doesn't exist on disk
    const enoentErr = Object.assign(new Error("spawn yt-dlp ENOENT"), { code: "ENOENT" });
    proc.emit("error", enoentErr);

    await expect(promise).rejects.toMatchObject({
      code: "DEPENDENCY_MISSING",
    });
  });
});

describe("getVideoMetadata — invalid JSON output", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("rejects with INTERNAL_ERROR when yt-dlp emits non-JSON stdout", async () => {
    const fsMock = await import("fs");
    vi.mocked(fsMock.existsSync).mockReturnValue(true);

    const spawnMock = vi.mocked(child_process.spawn);
    const proc = makeFakeProcess();
    spawnMock.mockReturnValue(proc as unknown as ReturnType<typeof child_process.spawn>);

    const { getVideoMetadata } = await import("../../src/lib/media/metadata");
    const promise = getVideoMetadata("https://www.youtube.com/watch?v=badjson");

    proc.stdout.emit("data", "this is not json");
    proc.emit("close", 0);

    await expect(promise).rejects.toMatchObject({
      code: "INTERNAL_ERROR",
    });
  });
});
