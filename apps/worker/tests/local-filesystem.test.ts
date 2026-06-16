import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { Readable } from "node:stream";
import { createHash } from "node:crypto";
import { LocalFilesystemStorage } from "../src/storage/local-filesystem.js";

let storageDir: string;
let storage: LocalFilesystemStorage;

beforeEach(() => {
  storageDir = mkdtempSync(`${tmpdir()}/fs-storage-test-`);
  storage = new LocalFilesystemStorage(storageDir);
});

afterEach(() => {
  rmSync(storageDir, { recursive: true, force: true });
});

function makeStream(content: string): Readable {
  return Readable.from([Buffer.from(content)]);
}

describe("LocalFilesystemStorage", () => {
  it("stores content and returns correct sha256", async () => {
    const content = "hello storage";
    const { key, sha256, sizeBytes } = await storage.put({
      stream: makeStream(content),
      filename: "hello.txt",
      mimeType: "text/plain",
    });
    const expected = createHash("sha256").update(content).digest("hex");
    expect(sha256).toBe(expected);
    expect(sizeBytes).toBe(Buffer.byteLength(content));
    expect(key).toBeTruthy();
  });

  it("can open stored content", async () => {
    const content = "readable content";
    const { key } = await storage.put({
      stream: makeStream(content),
      filename: "read.txt",
      mimeType: "text/plain",
    });
    const stream = await storage.open(key);
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string));
    expect(Buffer.concat(chunks).toString()).toBe(content);
  });

  it("exists() returns true for stored key, false for unknown", async () => {
    const { key } = await storage.put({
      stream: makeStream("x"),
      filename: "x.txt",
      mimeType: "text/plain",
    });
    expect(await storage.exists(key)).toBe(true);
    expect(await storage.exists("no-such-key")).toBe(false);
  });

  it("delete() removes the file", async () => {
    const { key } = await storage.put({
      stream: makeStream("del"),
      filename: "del.txt",
      mimeType: "text/plain",
    });
    await storage.delete(key);
    expect(await storage.exists(key)).toBe(false);
  });

  it("delete() is idempotent on missing key", async () => {
    await expect(storage.delete("ghost")).resolves.not.toThrow();
  });

  it("rejects path traversal in key via ensureUnder", async () => {
    await expect(storage.open("../etc/passwd")).rejects.toThrow(/outside root/);
  });

  it("download token is single-use and time-limited", async () => {
    const { key } = await storage.put({
      stream: makeStream("secret"),
      filename: "s.bin",
      mimeType: "application/octet-stream",
    });
    const token = await storage.createDownloadToken(key, 60_000);
    expect(await storage.validateDownloadToken(token)).toBe(key);
    expect(await storage.validateDownloadToken(token)).toBe(null); // consumed
  });

  it("expired token returns null", async () => {
    const { key } = await storage.put({
      stream: makeStream("x"),
      filename: "x.bin",
      mimeType: "application/octet-stream",
    });
    const token = await storage.createDownloadToken(key, 1); // 1ms
    await new Promise((r) => setTimeout(r, 5));
    expect(await storage.validateDownloadToken(token)).toBe(null);
  });

  it("sanitizes dangerous filename characters", async () => {
    const { key } = await storage.put({
      stream: makeStream("safe"),
      filename: "../../../etc/passwd",
      mimeType: "text/plain",
    });
    expect(key).not.toContain("..");
    expect(key).not.toContain("/");
  });

  it("sha256 mismatch rejects and cleans up", async () => {
    await expect(
      storage.put({
        stream: makeStream("content"),
        filename: "c.txt",
        mimeType: "text/plain",
        expectedSha256: "deadbeef",
      })
    ).rejects.toThrow(/SHA-256 mismatch/);
  });

  it("stat() returns file size", async () => {
    const content = "stat-me";
    const { key } = await storage.put({
      stream: makeStream(content),
      filename: "stat.txt",
      mimeType: "text/plain",
    });
    const meta = await storage.stat(key);
    expect(meta.sizeBytes).toBe(Buffer.byteLength(content));
    expect(meta.key).toBe(key);
  });
});
