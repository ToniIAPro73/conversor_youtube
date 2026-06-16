import { mkdtempSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { EncryptedFileCredentialStore, MemoryCredentialStore } from "../src/credential-store.js";
import type { StoredAgentIdentity } from "../src/types.js";

const identity: StoredAgentIdentity = {
  privateKeyPem: "-----BEGIN PRIVATE KEY-----\nsecret\n-----END PRIVATE KEY-----",
  credentials: {
    deviceId: "dev_test",
    accessToken: "access_secret",
    refreshToken: "refresh_secret",
    accessTokenExpiresAt: Date.now() + 1_000,
    refreshTokenExpiresAt: Date.now() + 10_000,
    serverBaseUrl: "https://filestudio.example.test",
  },
};

describe("CredentialStore", () => {
  it("supports an isolated memory adapter for tests", async () => {
    const store = new MemoryCredentialStore();
    await store.save(identity);
    expect(await store.load()).toEqual(identity);
    await store.clear();
    expect(await store.load()).toBeNull();
  });

  it("encrypts portable fallback credentials and restricts permissions", async () => {
    const dir = mkdtempSync(join(tmpdir(), "agent-store-"));
    const file = join(dir, "credentials.json");
    const store = new EncryptedFileCredentialStore(file, "correct horse battery staple");
    await store.save(identity);

    const raw = readFileSync(file, "utf8");
    expect(raw).not.toContain("access_secret");
    expect(raw).not.toContain("refresh_secret");
    expect(raw).not.toContain("PRIVATE KEY");
    expect(statSync(file).mode & 0o777).toBe(0o600);
    expect(await store.load()).toEqual(identity);
  });

  it("requires explicit strong key for portable fallback", () => {
    expect(() => new EncryptedFileCredentialStore("/tmp/nope", "short")).toThrow(/requires/i);
  });
});
