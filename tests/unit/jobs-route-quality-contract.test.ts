/**
 * Contract tests for POST /api/jobs — quality field regression.
 *
 * Regression: UI was sending quality: <object> when Zod expected quality: string.
 * Fix: UI now sends qualitySelection: <object>; backend accepts both paths.
 *
 * 7 tests:
 * 1. POST with qualitySelection object → 200 OK, job created
 * 2. POST with legacy quality string "1080" → 200 OK (backward compat)
 * 3. POST with quality: <object> (old broken shape) → 400 VALIDATION_ERROR
 * 4. POST with qualitySelection for MKV → job created, quality serialized as JSON
 * 5. POST missing rightsConfirmed → 400 RIGHTS_NOT_CONFIRMED
 * 6. POST with qualitySelection + bad profile → 400 VALIDATION_ERROR with field path
 * 7. resolveQuality: JSON-encoded VideoQualitySelection round-trips correctly
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Mock all heavy dependencies ──────────────────────────────────────────────

vi.mock("@/lib/jobs/job-manager", () => ({
  jobManager: {
    getActiveJobsCount: vi.fn().mockReturnValue(0),
    getClientActiveJob: vi.fn().mockReturnValue(null),
    createJob: vi.fn().mockReturnValue({ id: "job-123", status: "queued" }),
  },
}));

vi.mock("@/lib/media/processor", () => ({
  processJob: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/jobs/universal-job-processor", () => ({
  processUniversalJob: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/media/metadata", () => ({
  getVideoMetadata: vi.fn().mockResolvedValue({ title: "Test" }),
}));

vi.mock("@/lib/youtube/normalize-url", () => ({
  normalizeYoutubeUrl: vi.fn().mockImplementation((url: string) => url),
}));

vi.mock("@/lib/infrastructure/db/database", () => ({
  getDb: vi.fn(() => ({
    prepare: vi.fn(() => ({ run: vi.fn(), get: vi.fn() })),
  })),
}));

vi.mock("@/lib/engines/registry", () => ({
  getEngine: vi.fn().mockReturnValue(null),
}));

vi.mock("@/lib/detection/file-detector", () => ({
  buildDescriptor: vi.fn(),
}));

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeRequest(body: unknown) {
  return new NextRequest("http://localhost/api/jobs", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const VALID_QUALITY_SELECTION = {
  profile: "source-max",
  resolutionLimit: "max",
  fallbackPolicy: "reject",
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("POST /api/jobs — quality contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("1. qualitySelection object → 200 OK, job created", async () => {
    const { POST } = await import(
      "@/server/desktop-routes/jobs-route"
    );
    const res = await POST(
      makeRequest({
        url: "https://www.youtube.com/watch?v=88fD-UtG_yo",
        format: "mkv",
        qualitySelection: VALID_QUALITY_SELECTION,
        rightsConfirmed: true,
      })
    );
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.jobId).toBe("job-123");
  });

  it("2. legacy quality string '1080' → 200 OK (backward compat)", async () => {
    const { POST } = await import(
      "@/server/desktop-routes/jobs-route"
    );
    const res = await POST(
      makeRequest({
        url: "https://www.youtube.com/watch?v=88fD-UtG_yo",
        format: "mp4",
        quality: "1080",
        rightsConfirmed: true,
      })
    );
    expect(res.status).toBe(200);
    expect((await res.json()).jobId).toBe("job-123");
  });

  it("3. quality: <object> (old broken shape) → 400 VALIDATION_ERROR", async () => {
    const { POST } = await import(
      "@/server/desktop-routes/jobs-route"
    );
    const res = await POST(
      makeRequest({
        url: "https://www.youtube.com/watch?v=88fD-UtG_yo",
        format: "mkv",
        // Old incorrect shape: sending VideoQualitySelection as `quality`
        quality: VALID_QUALITY_SELECTION,
        rightsConfirmed: true,
      })
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.code).toBe("VALIDATION_ERROR");
    // Error message must identify the field
    expect(json.error).toMatch(/quality/i);
  });

  it("4. qualitySelection for MKV → jobManager.createJob called with JSON-serialized quality", async () => {
    const { jobManager } = await import("@/lib/jobs/job-manager");
    const { POST } = await import(
      "@/server/desktop-routes/jobs-route"
    );
    await POST(
      makeRequest({
        url: "https://www.youtube.com/watch?v=88fD-UtG_yo",
        format: "mkv",
        qualitySelection: VALID_QUALITY_SELECTION,
        rightsConfirmed: true,
      })
    );
    const createJobCalls = vi.mocked(jobManager.createJob).mock.calls;
    expect(createJobCalls.length).toBeGreaterThan(0);
    // Third argument is `quality`
    const qualityArg = createJobCalls[0]![2];
    // Must be a JSON string, not the raw object
    expect(typeof qualityArg).toBe("string");
    const parsed = JSON.parse(qualityArg);
    expect(parsed.profile).toBe("source-max");
    expect(parsed.resolutionLimit).toBe("max");
  });

  it("5. missing rightsConfirmed → 400 RIGHTS_NOT_CONFIRMED", async () => {
    const { POST } = await import(
      "@/server/desktop-routes/jobs-route"
    );
    const res = await POST(
      makeRequest({
        url: "https://www.youtube.com/watch?v=88fD-UtG_yo",
        format: "mkv",
        qualitySelection: VALID_QUALITY_SELECTION,
        rightsConfirmed: false,
      })
    );
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("RIGHTS_NOT_CONFIRMED");
  });

  it("6. qualitySelection with invalid profile → 400 VALIDATION_ERROR with field path", async () => {
    const { POST } = await import(
      "@/server/desktop-routes/jobs-route"
    );
    const res = await POST(
      makeRequest({
        url: "https://www.youtube.com/watch?v=88fD-UtG_yo",
        format: "mkv",
        qualitySelection: {
          profile: "invalid-profile",
          resolutionLimit: "max",
          fallbackPolicy: "reject",
        },
        rightsConfirmed: true,
      })
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.code).toBe("VALIDATION_ERROR");
    // Error should indicate which field failed
    expect(json.error).toMatch(/qualitySelection/i);
  });

  it("7. resolveQuality: JSON-serialized VideoQualitySelection round-trips to object", async () => {
    const { VideoQualitySelectionSchema } = await import(
      "@/lib/quality/quality-contract"
    );
    const original = {
      profile: "mp4-compatible" as const,
      resolutionLimit: 1080 as const,
      fallbackPolicy: "reject" as const,
    };
    const serialized = JSON.stringify(original);

    // Simulate what processor.ts resolveQuality does
    const parsed = JSON.parse(serialized);
    const result = VideoQualitySelectionSchema.safeParse(parsed);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.profile).toBe("mp4-compatible");
      expect(result.data.resolutionLimit).toBe(1080);
      expect(result.data.fallbackPolicy).toBe("reject");
    }
  });
});
