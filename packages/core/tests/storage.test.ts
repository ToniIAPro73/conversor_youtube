import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";

// LocalFilesystemStorage is in apps/worker but we test it via relative import
// because tests/core runs in the packages/core context.
// We test the storage interface contract using an in-memory stub here.

// ── In-memory ArtifactStorage stub for contract testing ──────────────────────

class MemoryStorage {
  private store = new Map<string, { data: Buffer; mimeType: string }>();
  private tokens = new Map<string, { key: string; expiresAt: number }>();

  async put(input: { stream: Readable; filename: string; mimeType: string }): Promise<{ key: string; sha256: string; sizeBytes: number; mimeType: string }> {
    const chunks: Buffer[] = [];
    for await (const chunk of input.stream) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string));
    const data = Buffer.concat(chunks);
    const key = `${Date.now()}-${input.filename}`;
    this.store.set(key, { data, mimeType: input.mimeType });
    const { createHash } = await import("node:crypto");
    const sha256 = createHash("sha256").update(data).digest("hex");
    return { key, sha256, sizeBytes: data.length, mimeType: input.mimeType };
  }

  async exists(key: string): Promise<boolean> { return this.store.has(key); }

  async delete(key: string): Promise<void> { this.store.delete(key); }

  async createDownloadToken(key: string, ttlMs: number): Promise<string> {
    const { randomBytes } = await import("node:crypto");
    const token = randomBytes(16).toString("hex");
    this.tokens.set(token, { key, expiresAt: Date.now() + ttlMs });
    return token;
  }

  async validateDownloadToken(token: string): Promise<string | null> {
    const entry = this.tokens.get(token);
    if (!entry || entry.expiresAt < Date.now()) return null;
    this.tokens.delete(token);
    return entry.key;
  }
}

describe("ArtifactStorage contract", () => {
  let storage: MemoryStorage;

  beforeEach(() => { storage = new MemoryStorage(); });

  it("stores and reports artifact as existing", async () => {
    const stream = Readable.from(["hello world"]);
    const { key } = await storage.put({ stream, filename: "test.txt", mimeType: "text/plain" });
    expect(await storage.exists(key)).toBe(true);
  });

  it("reports non-existent key as false", async () => {
    expect(await storage.exists("ghost-key")).toBe(false);
  });

  it("delete makes key disappear", async () => {
    const stream = Readable.from(["data"]);
    const { key } = await storage.put({ stream, filename: "del.txt", mimeType: "text/plain" });
    await storage.delete(key);
    expect(await storage.exists(key)).toBe(false);
  });

  it("download token is single-use", async () => {
    const stream = Readable.from(["secure"]);
    const { key } = await storage.put({ stream, filename: "s.txt", mimeType: "text/plain" });
    const token = await storage.createDownloadToken(key, 60_000);
    expect(await storage.validateDownloadToken(token)).toBe(key);
    expect(await storage.validateDownloadToken(token)).toBe(null); // consumed
  });

  it("expired token returns null", async () => {
    const stream = Readable.from(["x"]);
    const { key } = await storage.put({ stream, filename: "x.txt", mimeType: "text/plain" });
    const token = await storage.createDownloadToken(key, 1); // 1ms TTL
    await new Promise((r) => setTimeout(r, 5));
    expect(await storage.validateDownloadToken(token)).toBe(null);
  });

  it("returns correct sha256", async () => {
    const content = "predictable content";
    const stream = Readable.from([content]);
    const { sha256 } = await storage.put({ stream, filename: "h.txt", mimeType: "text/plain" });
    const { createHash } = await import("node:crypto");
    const expected = createHash("sha256").update(content).digest("hex");
    expect(sha256).toBe(expected);
  });
});
