import { describe, expect, it } from "vitest";
import { InMemoryAgentService } from "../src/routes/agent.js";

const auth = { claims: { client_id: "client_nexus", sub: "ws_1", scopes: ["filestudio:admin"] } };
const publicKey = "-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEA0000000000000000000000000000000000000000000=\n-----END PUBLIC KEY-----";

describe("Agent service", () => {
  it("supports approved pairing, token refresh rotation, capabilities and unpair", () => {
    const service = new InMemoryAgentService();
    const pairing = service.createPairing({
      publicKey,
      deviceName: "Workstation",
      platform: "linux",
      arch: "x64",
      version: "0.2.0",
    });
    const approved = service.approve(pairing.requestId, pairing.code, auth);
    expect("deviceId" in approved).toBe(true);
    if (!("deviceId" in approved)) throw new Error("not approved");

    expect(service.status(pairing.requestId)).toMatchObject({ status: "authorized", deviceId: approved.deviceId });
    const refreshed = service.refresh(approved.refreshToken, approved.deviceId);
    expect("refreshToken" in refreshed).toBe(true);
    expect("refreshToken" in refreshed && refreshed.refreshToken).not.toBe(approved.refreshToken);

    const reuse = service.refresh(approved.refreshToken, approved.deviceId);
    expect(reuse).toMatchObject({ error: "AUTH_REFRESH_REUSE_DETECTED" });
    expect(service.authenticate(approved.accessToken)).toBeNull();
  });

  it("prevents pairing code reuse and supports rejection", () => {
    const service = new InMemoryAgentService();
    const pairing = service.createPairing({ publicKey, deviceName: "PC", platform: "linux", arch: "x64", version: "0.2.0" });
    expect(service.reject(pairing.requestId)).toBe(true);
    expect(service.status(pairing.requestId)).toEqual({ status: "rejected" });
    expect(service.approve(pairing.requestId, pairing.code, auth)).toEqual({ error: "PAIRING_NOT_PENDING" });
  });

  it("leases only jobs matching device workspace and capabilities", () => {
    const service = new InMemoryAgentService();
    const pairing = service.createPairing({ publicKey, deviceName: "PC", platform: "linux", arch: "x64", version: "0.2.0" });
    const approved = service.approve(pairing.requestId, pairing.code, auth);
    if (!("deviceId" in approved)) throw new Error("not approved");
    const device = service.authenticate(approved.accessToken);
    expect(device).not.toBeNull();
    service.saveCapabilities(approved.deviceId, {
      deviceId: approved.deviceId,
      platform: "linux",
      arch: "x64",
      version: "0.2.0",
      operations: ["data.json-to-yaml"],
      engineVersions: { "data-ts": "yaml" },
      limits: { maxFileSizeBytes: 1024, maxConcurrent: 1 },
      load: 0,
      freeDiskBytes: 0,
      status: "idle",
      lastSeen: new Date().toISOString(),
    });
    service.enqueueLocalJob({
      workspaceId: "ws_1",
      clientId: "client_nexus",
      operation: "data.json-to-yaml",
      input: new TextEncoder().encode('{"ok":true}'),
      inputFilename: "input.json",
      inputMimeType: "application/json",
      options: {},
      requestingOrg: "Nexus",
      requestingApp: "Contract",
      retentionMinutes: 1,
      timeoutMs: 10_000,
    });
    const job = service.nextJob(device!);
    expect(job?.operation).toBe("data.json-to-yaml");
    const leaseId = service.accept(job!.id, device!);
    expect(leaseId).toMatch(/^lease_/);
  });
});
