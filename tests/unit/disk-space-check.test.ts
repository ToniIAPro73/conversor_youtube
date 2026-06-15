// Unit tests for disk space checker.

import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock ProcessRunner ─────────────────────────────────────────────────────────

const mockRunResult = {
  exitCode: 0,
  stdout: `Filesystem     1024-blocks    Used Available Capacity Mounted on
/dev/sda1        51425600 20480000  30945600      40% /`,
  stderr: "",
  timedOut: false,
  durationMs: 50,
};

vi.mock("../../src/lib/infrastructure/processes/process-runner", () => {
  return {
    ProcessRunner: class MockProcessRunner {
      run = vi.fn().mockResolvedValue(mockRunResult);
    },
  };
});

describe("Disk Space Check", () => {
  beforeEach(() => {
    // Reset mock result to default
    Object.assign(mockRunResult, {
      exitCode: 0,
      stdout: `Filesystem     1024-blocks    Used Available Capacity Mounted on
/dev/sda1        51425600 20480000  30945600      40% /`,
      stderr: "",
      timedOut: false,
      durationMs: 50,
    });
  });

  it("returns sufficient=true when free space exceeds requirement", async () => {
    const { checkDiskSpace } = await import("../../src/lib/jobs/disk-space-check");
    const result = await checkDiskSpace(1024, "/tmp");
    expect(result.sufficient).toBe(true);
    expect(result.freeBytes).toBeGreaterThan(0);
    expect(result.requiredBytes).toBe(1024);
    expect(result.message).toContain("Sufficient");
  });

  it("returns sufficient=false when free space is less than requirement", async () => {
    const { checkDiskSpace } = await import("../../src/lib/jobs/disk-space-check");
    // Request more than the 30945600 * 1024 bytes available in mock
    const hugeNumber = 100 * 1024 * 1024 * 1024 * 1024; // 100 TB
    const result = await checkDiskSpace(hugeNumber, "/tmp");
    expect(result.sufficient).toBe(false);
    expect(result.requiredBytes).toBe(hugeNumber);
    expect(result.message).toContain("Insufficient");
  });

  it("returns correct freeBytes from df output", async () => {
    const { checkDiskSpace } = await import("../../src/lib/jobs/disk-space-check");
    const result = await checkDiskSpace(1, "/tmp");
    // From mock: 30945600 * 1024 bytes
    expect(result.freeBytes).toBe(30945600 * 1024);
  });

  it("includes MB values in the message", async () => {
    const { checkDiskSpace } = await import("../../src/lib/jobs/disk-space-check");
    const result = await checkDiskSpace(1024, "/tmp");
    expect(result.message).toContain("MB");
  });

  it("message for sufficient space mentions 'Sufficient'", async () => {
    const { checkDiskSpace } = await import("../../src/lib/jobs/disk-space-check");
    const result = await checkDiskSpace(1, "/tmp");
    expect(result.message).toMatch(/Sufficient/i);
  });

  it("message for insufficient space mentions 'Insufficient'", async () => {
    const { checkDiskSpace } = await import("../../src/lib/jobs/disk-space-check");
    const result = await checkDiskSpace(Number.MAX_SAFE_INTEGER, "/tmp");
    expect(result.message).toMatch(/Insufficient/i);
  });
});

describe("Disk Space Check — error handling", () => {
  it("returns sufficient=true (optimistic) when df returns non-zero exit code", async () => {
    Object.assign(mockRunResult, {
      exitCode: 1,
      stdout: "",
      stderr: "df: error",
    });

    const { checkDiskSpace } = await import("../../src/lib/jobs/disk-space-check");
    const result = await checkDiskSpace(1024, "/tmp");
    expect(result.sufficient).toBe(true); // Optimistic fallback
    expect(result.freeBytes).toBe(-1);
    expect(result.message).toContain("proceeding optimistically");
  });

  it("returns sufficient=true (optimistic) when df output is unparseable", async () => {
    Object.assign(mockRunResult, {
      exitCode: 0,
      stdout: "nonsense output",
    });

    const { checkDiskSpace } = await import("../../src/lib/jobs/disk-space-check");
    const result = await checkDiskSpace(1024, "/tmp");
    expect(result.sufficient).toBe(true);
    expect(result.freeBytes).toBe(-1);
  });
});
