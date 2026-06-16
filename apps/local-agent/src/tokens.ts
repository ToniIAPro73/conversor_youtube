import type { AgentCredentials } from "./types.js";
import type { CredentialStore } from "./credential-store.js";

export interface TokenTransport {
  refresh(input: { refreshToken: string; deviceId: string }): Promise<{
    accessToken: string;
    refreshToken: string;
    accessTokenExpiresAt: number;
    refreshTokenExpiresAt: number;
  }>;
  unpair(input: { accessToken: string; refreshToken: string; deviceId: string }): Promise<void>;
}

export class HttpTokenTransport implements TokenTransport {
  constructor(private readonly baseUrl: string, private readonly timeoutMs = 10_000) {}

  async refresh(input: { refreshToken: string; deviceId: string }) {
    const res = await fetchWithTimeout(`${this.baseUrl}/api/v1/agent/token/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }, this.timeoutMs);
    if (res.status === 401 || res.status === 403) {
      throw new Error("AGENT_REPAIR_REQUIRED");
    }
    if (!res.ok) throw new Error(`Token refresh failed: ${res.status}`);
    return res.json() as ReturnType<TokenTransport["refresh"]>;
  }

  async unpair(input: { accessToken: string; refreshToken: string; deviceId: string }) {
    const res = await fetchWithTimeout(`${this.baseUrl}/api/v1/agent/unpair`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${input.accessToken}` },
      body: JSON.stringify({ refreshToken: input.refreshToken, deviceId: input.deviceId }),
    }, this.timeoutMs);
    if (!res.ok && res.status !== 401 && res.status !== 403) {
      throw new Error(`Unpair failed: ${res.status}`);
    }
  }
}

export class RotatingTokenManager {
  constructor(
    private credentials: AgentCredentials,
    private readonly store: CredentialStore,
    private readonly transport: TokenTransport,
    private readonly refreshSkewMs = 60_000
  ) {}

  snapshot(): AgentCredentials {
    return { ...this.credentials };
  }

  async getValidToken(): Promise<string> {
    if (this.credentials.revoked) {
      throw new Error("AGENT_DEVICE_REVOKED");
    }
    if (Date.now() < this.credentials.accessTokenExpiresAt - this.refreshSkewMs) {
      return this.credentials.accessToken;
    }
    if (Date.now() >= this.credentials.refreshTokenExpiresAt) {
      await this.store.clear();
      throw new Error("AGENT_REPAIR_REQUIRED");
    }

    const refreshed = await this.transport.refresh({
      refreshToken: this.credentials.refreshToken,
      deviceId: this.credentials.deviceId,
    });
    this.credentials = {
      ...this.credentials,
      accessToken: refreshed.accessToken,
      refreshToken: refreshed.refreshToken,
      accessTokenExpiresAt: refreshed.accessTokenExpiresAt,
      refreshTokenExpiresAt: refreshed.refreshTokenExpiresAt,
    };
    const current = await this.store.load();
    if (current) {
      await this.store.save({ ...current, credentials: this.credentials });
    }
    return this.credentials.accessToken;
  }

  async unpair(): Promise<void> {
    await this.transport.unpair({
      accessToken: this.credentials.accessToken,
      refreshToken: this.credentials.refreshToken,
      deviceId: this.credentials.deviceId,
    }).finally(() => this.store.clear());
    this.credentials = { ...this.credentials, revoked: true };
  }
}

async function fetchWithTimeout(url: string, init: RequestInit, ms: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}
