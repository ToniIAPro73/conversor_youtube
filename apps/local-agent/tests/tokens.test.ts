import { describe, expect, it, vi } from "vitest";
import { MemoryCredentialStore } from "../src/credential-store.js";
import { RotatingTokenManager, type TokenTransport } from "../src/tokens.js";
import type { AgentCredentials, StoredAgentIdentity } from "../src/types.js";

function credentials(overrides: Partial<AgentCredentials> = {}): AgentCredentials {
  return {
    deviceId: "dev_test",
    accessToken: "old_access",
    refreshToken: "old_refresh",
    accessTokenExpiresAt: Date.now() - 1,
    refreshTokenExpiresAt: Date.now() + 60_000,
    serverBaseUrl: "https://service.test",
    ...overrides,
  };
}

describe("RotatingTokenManager", () => {
  it("rotates refresh tokens and persists the replacement", async () => {
    const store = new MemoryCredentialStore();
    const identity: StoredAgentIdentity = { credentials: credentials(), privateKeyPem: "private" };
    await store.save(identity);
    const transport: TokenTransport = {
      refresh: vi.fn().mockResolvedValue({
        accessToken: "new_access",
        refreshToken: "new_refresh",
        accessTokenExpiresAt: Date.now() + 600_000,
        refreshTokenExpiresAt: Date.now() + 86_400_000,
      }),
      unpair: vi.fn().mockResolvedValue(undefined),
    };

    const manager = new RotatingTokenManager(identity.credentials, store, transport, 60_000);
    await expect(manager.getValidToken()).resolves.toBe("new_access");
    await expect(store.load()).resolves.toMatchObject({
      credentials: { accessToken: "new_access", refreshToken: "new_refresh" },
    });
  });

  it("clears credentials when refresh token expired", async () => {
    const store = new MemoryCredentialStore();
    await store.save({ credentials: credentials({ refreshTokenExpiresAt: Date.now() - 1 }), privateKeyPem: "private" });
    const manager = new RotatingTokenManager(
      credentials({ refreshTokenExpiresAt: Date.now() - 1 }),
      store,
      { refresh: vi.fn(), unpair: vi.fn() },
      60_000
    );
    await expect(manager.getValidToken()).rejects.toThrow(/REPAIR/);
    await expect(store.load()).resolves.toBeNull();
  });

  it("unpairs and clears local credentials", async () => {
    const store = new MemoryCredentialStore();
    const creds = credentials({ accessTokenExpiresAt: Date.now() + 600_000 });
    await store.save({ credentials: creds, privateKeyPem: "private" });
    const transport: TokenTransport = { refresh: vi.fn(), unpair: vi.fn().mockResolvedValue(undefined) };
    const manager = new RotatingTokenManager(creds, store, transport);
    await manager.unpair();
    expect(transport.unpair).toHaveBeenCalled();
    await expect(store.load()).resolves.toBeNull();
  });
});
