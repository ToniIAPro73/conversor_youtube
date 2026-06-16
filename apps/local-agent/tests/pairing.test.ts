import { describe, it, expect, vi } from "vitest";
import { PairingFlow } from "../src/pairing.js";
import type { PairingTransport } from "../src/pairing.js";
import type { AgentConfig } from "../src/types.js";

const BASE_CONFIG: AgentConfig = {
  deviceName: "Test Device",
  platform: "linux",
  arch: "x64",
  version: "0.2.0",
  policy: "allow-approved-operations",
  approvedOperations: [],
  maxFileSizeBytes: 100 * 1024 * 1024,
  maxConcurrent: 1,
};

// Factory helpers for mock transports

function authorizedTransport(overrides: { code?: string } = {}): PairingTransport {
  return {
    async requestPairingCode() {
      return {
        requestId: "req_abc",
        code: overrides.code ?? "123456",
        expiresAt: Date.now() + 300_000,
      };
    },
    async pollPairingStatus() {
      return {
        status: "authorized",
        accessToken: "tok_access",
        refreshToken: "tok_refresh",
        deviceId: "dev_001",
        accessTokenExpiresAt: Date.now() + 600_000,
        refreshTokenExpiresAt: Date.now() + 86_400_000,
      };
    },
  };
}

function pendingTransport(): PairingTransport {
  return {
    async requestPairingCode() {
      return { requestId: "req_pending", code: "999999", expiresAt: Date.now() + 1 };
    },
    async pollPairingStatus() {
      return { status: "pending" };
    },
  };
}

function rejectedTransport(): PairingTransport {
  return {
    async requestPairingCode() {
      return { requestId: "req_rej", code: "000000", expiresAt: Date.now() + 300_000 };
    },
    async pollPairingStatus() {
      return { status: "rejected" };
    },
  };
}

describe("PairingFlow", () => {
  it("calls transport.requestPairingCode with device metadata", async () => {
    const transport = authorizedTransport();
    const spy = vi.spyOn(transport, "requestPairingCode");
    const flow = new PairingFlow(BASE_CONFIG, transport, () => {}, 5);
    await flow.run();
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({
        deviceName: "Test Device",
        platform: "linux",
        arch: "x64",
        version: "0.2.0",
      })
    );
  });

  it("includes public key PEM in requestPairingCode payload", async () => {
    const transport = authorizedTransport();
    const spy = vi.spyOn(transport, "requestPairingCode");
    const flow = new PairingFlow(BASE_CONFIG, transport, () => {}, 5);
    await flow.run();
    const args = spy.mock.calls[0][0];
    expect(typeof args.publicKey).toBe("string");
    expect(args.publicKey).toContain("PUBLIC KEY");
  });

  it("returns credentials on authorized response", async () => {
    const flow = new PairingFlow(BASE_CONFIG, authorizedTransport(), () => {}, 5);
    const result = await flow.run();
    expect(result.credentials.deviceId).toBe("dev_001");
    expect(result.credentials.accessToken).toBe("tok_access");
    expect(result.credentials.refreshToken).toBe("tok_refresh");
    expect(result.credentials.accessTokenExpiresAt).toBeGreaterThan(Date.now());
    expect(result.credentials.refreshTokenExpiresAt).toBeGreaterThan(Date.now());
  });

  it("returns privateKeyPem along with credentials", async () => {
    const flow = new PairingFlow(BASE_CONFIG, authorizedTransport(), () => {}, 5);
    const result = await flow.run();
    expect(result.privateKeyPem).toContain("PRIVATE KEY");
  });

  it("throws when pairing is rejected by administrator", async () => {
    const flow = new PairingFlow(BASE_CONFIG, rejectedTransport(), () => {}, 5);
    await expect(flow.run()).rejects.toThrow(/rejected/i);
  });

  it("times out when expiresAt is in the past (loop exits immediately)", async () => {
    const flow = new PairingFlow(BASE_CONFIG, pendingTransport(), () => {}, 5);
    await expect(flow.run()).rejects.toThrow(/expired/i);
  });

  it("logs the 6-digit code during pairing", async () => {
    const log = vi.fn();
    const flow = new PairingFlow(BASE_CONFIG, authorizedTransport({ code: "654321" }), log, 5);
    await flow.run();
    const logged = log.mock.calls.map((c) => String(c[0])).join("\n");
    expect(logged).toContain("654321");
  });
});
