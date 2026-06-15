import { describe, it, expect } from "vitest";
import path from "path";
import { ensurePathSafety, resolveArtifactPath } from "../../src/lib/security/path-safety";

const ROOT = "/tmp/test-root";

describe("ensurePathSafety", () => {
  it("allows a path inside the root", () => {
    const result = ensurePathSafety("/tmp/test-root/jobs/abc/output.mp3", ROOT);
    expect(result).toBe(path.resolve("/tmp/test-root/jobs/abc/output.mp3"));
  });

  it("throws on path traversal with ..", () => {
    expect(() =>
      ensurePathSafety("/tmp/test-root/../etc/passwd", ROOT)
    ).toThrow(/path traversal/i);
  });

  it("throws when path is outside root entirely", () => {
    expect(() =>
      ensurePathSafety("/etc/passwd", ROOT)
    ).toThrow(/path traversal/i);
  });

  it("throws on traversal via encoded segments that resolve outside", () => {
    expect(() =>
      ensurePathSafety("/tmp/test-root/../../etc/shadow", ROOT)
    ).toThrow(/path traversal/i);
  });

  it("allows root itself (root is considered inside itself)", () => {
    const result = ensurePathSafety(ROOT, ROOT);
    expect(result).toBe(path.resolve(ROOT));
  });
});

describe("resolveArtifactPath", () => {
  it("resolves a valid relative path", () => {
    const result = resolveArtifactPath("jobs/abc/output.mp3", ROOT);
    expect(result).toBe(path.resolve(ROOT, "jobs/abc/output.mp3"));
  });

  it("throws on traversal via relative path", () => {
    expect(() =>
      resolveArtifactPath("../../etc/passwd", ROOT)
    ).toThrow(/path traversal/i);
  });
});
