// Pairing flow — generates Ed25519 key pair, requests 6-digit code from server,
// polls until admin authorizes, stores credentials.
import { generateKeyPair } from "node:crypto";
import type { KeyObject } from "node:crypto";
import { promisify } from "node:util";
import type { AgentCredentials, AgentConfig } from "./types.js";

const generateKeyPairAsync = promisify(generateKeyPair);

const DEFAULT_POLL_INTERVAL_MS = 2_000;

export interface PairingTransport {
  requestPairingCode(payload: {
    publicKey: string;
    deviceName: string;
    platform: string;
    arch: string;
    version: string;
  }): Promise<{ requestId: string; code: string; expiresAt: number }>;

  pollPairingStatus(requestId: string): Promise<
    | { status: "pending" }
    | {
        status: "authorized";
        accessToken: string;
        refreshToken: string;
        deviceId: string;
        accessTokenExpiresAt: number;
        refreshTokenExpiresAt: number;
      }
    | { status: "rejected" }
    | { status: "expired" }
  >;
}

export class PairingFlow {
  constructor(
    private readonly config: AgentConfig,
    private readonly transport: PairingTransport,
    private readonly log: (msg: string) => void = console.log,
    private readonly pollIntervalMs: number = DEFAULT_POLL_INTERVAL_MS
  ) {}

  async run(): Promise<{ credentials: AgentCredentials; privateKeyPem: string }> {
    // 1. Generate ephemeral Ed25519 key pair
    const { privateKey, publicKey } = await generateKeyPairAsync("ed25519");
    const publicKeyPem = (publicKey as KeyObject).export({ type: "spki", format: "pem" }).toString();
    const privateKeyPem = (privateKey as KeyObject).export({ type: "pkcs8", format: "pem" }).toString();

    // 2. Request pairing code from server
    const pairingReq = await this.transport.requestPairingCode({
      publicKey: publicKeyPem,
      deviceName: this.config.deviceName,
      platform: this.config.platform,
      arch: this.config.arch,
      version: this.config.version,
    });

    this.log(`\n======================================`);
    this.log(`  Pairing code: ${pairingReq.code}`);
    this.log(`  Enter this code in the Nexus admin UI`);
    this.log(`  Expires in 10 minutes`);
    this.log(`======================================\n`);

    // 3. Poll until authorized or expired
    const result = await this.pollUntilAuthorized(pairingReq);

    if (result.status === "rejected") {
      throw new Error("Pairing rejected by administrator.");
    }
    if (result.status === "expired") {
      throw new Error("Pairing code expired. Please try again.");
    }

    const credentials: AgentCredentials = {
      deviceId: result.deviceId,
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      accessTokenExpiresAt: result.accessTokenExpiresAt,
      refreshTokenExpiresAt: result.refreshTokenExpiresAt,
      serverBaseUrl: "", // set by caller
    };

    return { credentials, privateKeyPem };
  }

  private async pollUntilAuthorized(
    req: { requestId: string; expiresAt: number }
  ) {
    while (Date.now() < req.expiresAt) {
      await sleep(this.pollIntervalMs);
      const status = await this.transport.pollPairingStatus(req.requestId);

      if (status.status === "authorized" || status.status === "rejected" || status.status === "expired") {
        return status;
      }
      this.log("Waiting for admin authorization…");
    }
    return { status: "expired" as const };
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ── HTTP transport implementation ─────────────────────────────────────────────

export class HttpPairingTransport implements PairingTransport {
  constructor(private readonly baseUrl: string, private readonly timeoutMs = 10_000) {}

  async requestPairingCode(payload: Parameters<PairingTransport["requestPairingCode"]>[0]) {
    const res = await fetchWithTimeout(
      `${this.baseUrl}/api/v1/agent-pairing-requests`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
      this.timeoutMs
    );
    if (!res.ok) throw new Error(`Pairing request failed: ${res.status}`);
    return res.json() as ReturnType<PairingTransport["requestPairingCode"]>;
  }

  async pollPairingStatus(requestId: string) {
    const res = await fetchWithTimeout(
      `${this.baseUrl}/api/v1/agent-pairing-requests/${requestId}/status`,
      {},
      this.timeoutMs
    );
    if (!res.ok) throw new Error(`Pairing poll failed: ${res.status}`);
    return res.json() as ReturnType<PairingTransport["pollPairingStatus"]>;
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
