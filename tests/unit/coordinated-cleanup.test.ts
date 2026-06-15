// Unit tests for the coordinated cleanup system.
// Tests the cleanup logic by mocking DB and filesystem operations.

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Shared mutable state ──────────────────────────────────────────────────────

const mockExpiredJobs: Array<{ id: string; output_relative_path: string; category: string | null }> = [];
const mockActiveJobs: Array<{ output_relative_path: string; id: string }> = [];
const mockDbUpdates: Array<{ id: string; status: string }> = [];
let existingPaths: Set<string> = new Set();

// Track fs operations
const fsOps: { method: string; path: string }[] = [];

// ── Mocks ──────────────────────────────────────────────────────────────────────

vi.mock("../../src/lib/infrastructure/db/database", () => ({
  getDb: () => ({
    prepare: (sql: string) => {
      if (sql.includes("status = 'completed' AND expires_at")) {
        return { all: () => [...mockExpiredJobs] };
      }
      if (sql.includes("DISTINCT output_relative_path")) {
        return { all: () => mockActiveJobs.map((j) => ({ output_relative_path: j.output_relative_path })) };
      }
      if (sql.includes("DISTINCT id") && sql.includes("status IN")) {
        return { all: () => mockActiveJobs.map((j) => ({ id: j.id })) };
      }
      if (sql.includes("UPDATE jobs SET status = 'expired'")) {
        return {
          run: (id: string) => {
            mockDbUpdates.push({ id, status: "expired" });
          },
        };
      }
      return { all: () => [], run: () => {} };
    },
  }),
}));

vi.mock("../../src/lib/config", () => ({
  CONFIG: {
    media: {
      tempDir: "/tmp/test-media",
      limits: {
        jobTtlMinutes: 60,
      },
    },
  },
}));

vi.mock("fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("fs")>();
  return {
    ...actual,
    default: {
      ...actual,
      existsSync: (p: string) => {
        fsOps.push({ method: "existsSync", path: p });
        return existingPaths.has(p);
      },
      unlinkSync: (p: string) => {
        fsOps.push({ method: "unlinkSync", path: p });
      },
      rmSync: (p: string, _opts?: { recursive?: boolean; force?: boolean }) => {
        fsOps.push({ method: "rmSync", path: p });
      },
      statSync: () => ({
        mtimeMs: Date.now() - 2 * 60 * 60 * 1000, // 2 hours ago (past TTL)
        size: 1024,
        isDirectory: () => false,
      }),
      readdirSync: () => [],
    },
    existsSync: (p: string) => {
      fsOps.push({ method: "existsSync", path: p });
      return existingPaths.has(p);
    },
    unlinkSync: (p: string) => {
      fsOps.push({ method: "unlinkSync", path: p });
    },
    rmSync: (p: string, _opts?: { recursive?: boolean; force?: boolean }) => {
      fsOps.push({ method: "rmSync", path: p });
    },
    statSync: () => ({
      mtimeMs: Date.now() - 2 * 60 * 60 * 1000,
      size: 1024,
      isDirectory: () => false,
    }),
    readdirSync: () => [],
  };
});

describe("Coordinated Cleanup", () => {
  beforeEach(() => {
    mockExpiredJobs.length = 0;
    mockActiveJobs.length = 0;
    mockDbUpdates.length = 0;
    fsOps.length = 0;
    existingPaths = new Set();
  });

  it("returns zero metrics when there are no expired jobs", async () => {
    const { coordinatedCleanup } = await import("../../src/lib/jobs/coordinated-cleanup");
    const metrics = await coordinatedCleanup();
    expect(metrics.jobsExpired).toBe(0);
    expect(metrics.artifactsDeleted).toBe(0);
    expect(metrics.orphanedFilesDeleted).toBe(0);
    expect(metrics.failures).toBe(0);
  });

  it("expires completed jobs past their TTL and deletes artifacts", async () => {
    existingPaths.add("/tmp/test-media/job-1/output.mp3");
    existingPaths.add("/tmp/test-media/job-1");

    mockExpiredJobs.push({
      id: "job-1",
      output_relative_path: "job-1/output.mp3",
      category: "audio",
    });

    const { coordinatedCleanup } = await import("../../src/lib/jobs/coordinated-cleanup");
    const metrics = await coordinatedCleanup();
    expect(metrics.jobsExpired).toBe(1);
    expect(metrics.artifactsDeleted).toBe(1);
    expect(mockDbUpdates).toContainEqual({ id: "job-1", status: "expired" });
    // Verify unlink was called for the artifact
    expect(fsOps.some((op) => op.method === "unlinkSync" && op.path === "/tmp/test-media/job-1/output.mp3")).toBe(true);
  });

  it("does not delete artifacts outside the temp directory", async () => {
    existingPaths.add("/etc/passwd");

    mockExpiredJobs.push({
      id: "job-2",
      output_relative_path: "../../etc/passwd",
      category: null,
    });

    const { coordinatedCleanup } = await import("../../src/lib/jobs/coordinated-cleanup");
    const metrics = await coordinatedCleanup();
    // Job should be marked expired but artifact should NOT be deleted (path traversal)
    expect(metrics.jobsExpired).toBe(1);
    expect(metrics.artifactsDeleted).toBe(0);
  });

  it("handles multiple expired jobs", async () => {
    existingPaths.add("/tmp/test-media/job-a/output.pdf");
    existingPaths.add("/tmp/test-media/job-b/output.png");
    existingPaths.add("/tmp/test-media/job-a");
    existingPaths.add("/tmp/test-media/job-b");

    mockExpiredJobs.push(
      { id: "job-a", output_relative_path: "job-a/output.pdf", category: "pdf" },
      { id: "job-b", output_relative_path: "job-b/output.png", category: "image" },
    );

    const { coordinatedCleanup } = await import("../../src/lib/jobs/coordinated-cleanup");
    const metrics = await coordinatedCleanup();
    expect(metrics.jobsExpired).toBe(2);
    expect(metrics.artifactsDeleted).toBe(2);
  });

  it("is idempotent — safe to run multiple times", async () => {
    existingPaths.add("/tmp/test-media/job-3/output.docx");
    existingPaths.add("/tmp/test-media/job-3");

    mockExpiredJobs.push({
      id: "job-3",
      output_relative_path: "job-3/output.docx",
      category: "document",
    });

    const { coordinatedCleanup } = await import("../../src/lib/jobs/coordinated-cleanup");
    const first = await coordinatedCleanup();
    const second = await coordinatedCleanup();

    // Both runs should succeed without error
    expect(first.failures).toBe(0);
    expect(second.failures).toBe(0);
  });

  it("skips jobs with no output_relative_path", async () => {
    mockExpiredJobs.push({
      id: "job-noref",
      output_relative_path: "",
      category: null,
    });

    const { coordinatedCleanup } = await import("../../src/lib/jobs/coordinated-cleanup");
    const metrics = await coordinatedCleanup();
    // Empty string is falsy, so artifact deletion is skipped
    expect(metrics.artifactsDeleted).toBe(0);
  });
});
