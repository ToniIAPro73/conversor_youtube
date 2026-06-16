// LocalFilesystemStorage — implements ArtifactStorage for Desktop and single-node VPS.
import { createReadStream, createWriteStream, existsSync, statSync, mkdirSync } from "node:fs";
import { unlink, stat } from "node:fs/promises";
import { join, resolve, relative, dirname, basename } from "node:path";
import { pipeline } from "node:stream/promises";
import { createHash, randomBytes } from "node:crypto";
import type { Readable } from "node:stream";
import type { ArtifactStorage, PutArtifactInput, StoredArtifact, ArtifactMetadata } from "@anclora/filestudio-core";

function ensureUnder(target: string, root: string): string {
  const resolvedTarget = resolve(target);
  const resolvedRoot = resolve(root);
  const rel = relative(resolvedRoot, resolvedTarget);
  if (rel.startsWith("..") || resolve(rel) === resolve("/")) {
    throw new Error(`Security: path "${resolvedTarget}" is outside root "${resolvedRoot}"`);
  }
  return resolvedTarget;
}

export class LocalFilesystemStorage implements ArtifactStorage {
  private readonly root: string;
  private readonly tokenMap = new Map<string, { key: string; expiresAt: number }>();

  constructor(storageRoot: string) {
    this.root = resolve(storageRoot);
    mkdirSync(this.root, { recursive: true });
  }

  async put(input: PutArtifactInput): Promise<StoredArtifact> {
    // Sanitize filename: strip path traversal, keep only safe chars
    const safe = basename(input.filename)
      .replace(/[^a-zA-Z0-9._-]/g, "_")
      .replace(/\.{2,}/g, "_")  // collapse any .. sequences
      .slice(0, 200) || "file";
    const key = `${Date.now()}-${randomBytes(8).toString("hex")}-${safe}`;
    const dest = ensureUnder(join(this.root, key), this.root);

    mkdirSync(dirname(dest), { recursive: true });

    const hash = createHash("sha256");
    let sizeBytes = 0;

    const writer = createWriteStream(dest);
    const readable = input.stream as unknown as Readable;

    await pipeline(
      readable,
      async function* (source: AsyncIterable<Buffer>) {
        for await (const chunk of source) {
          hash.update(chunk);
          sizeBytes += chunk.length;
          yield chunk;
        }
      },
      writer
    );

    const sha256 = hash.digest("hex");

    if (input.expectedSha256 && sha256 !== input.expectedSha256) {
      await unlink(dest).catch(() => {});
      throw new Error(`SHA-256 mismatch: expected ${input.expectedSha256}, got ${sha256}`);
    }

    return { key, sha256, sizeBytes, mimeType: input.mimeType };
  }

  async open(key: string): Promise<Readable> {
    const path = ensureUnder(join(this.root, key), this.root);
    if (!existsSync(path)) throw new Error(`Artifact not found: ${key}`);
    return createReadStream(path) as unknown as Readable;
  }

  async stat(key: string): Promise<ArtifactMetadata> {
    const path = ensureUnder(join(this.root, key), this.root);
    const s = statSync(path);
    return {
      key,
      sizeBytes: s.size,
      mimeType: "application/octet-stream",
      sha256: "",
      createdAt: s.birthtime,
    };
  }

  async exists(key: string): Promise<boolean> {
    try {
      const path = ensureUnder(join(this.root, key), this.root);
      return existsSync(path);
    } catch {
      return false;
    }
  }

  async delete(key: string): Promise<void> {
    const path = ensureUnder(join(this.root, key), this.root);
    await unlink(path).catch(() => {}); // idempotent
  }

  async createDownloadToken(key: string, ttlMs: number): Promise<string> {
    const token = randomBytes(32).toString("hex");
    this.tokenMap.set(token, { key, expiresAt: Date.now() + ttlMs });
    // Prune expired tokens
    for (const [t, v] of this.tokenMap) {
      if (v.expiresAt < Date.now()) this.tokenMap.delete(t);
    }
    return token;
  }

  async validateDownloadToken(token: string): Promise<string | null> {
    const entry = this.tokenMap.get(token);
    if (!entry || entry.expiresAt < Date.now()) return null;
    this.tokenMap.delete(token); // single-use
    return entry.key;
  }
}
