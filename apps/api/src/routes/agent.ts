import { Hono } from "hono";
import { z } from "zod";
import { createHash, randomBytes } from "node:crypto";
import { requireScope } from "../middleware/auth.js";
import type { AuthContext } from "../middleware/auth.js";

const ACCESS_TTL_MS = 10 * 60_000;
const REFRESH_TTL_MS = 30 * 24 * 60 * 60_000;
const PAIRING_TTL_MS = 10 * 60_000;
const MAX_PAIRING_ATTEMPTS = 20;

const PairingSchema = z.object({
  publicKey: z.string().includes("PUBLIC KEY"),
  deviceName: z.string().min(1).max(120),
  platform: z.string().min(1).max(40),
  arch: z.string().min(1).max(40),
  version: z.string().min(1).max(40),
});

const CapabilitiesSchema = z.object({
  deviceId: z.string(),
  platform: z.string(),
  arch: z.string(),
  version: z.string(),
  operations: z.array(z.string()),
  engineVersions: z.record(z.string(), z.string()),
  limits: z.object({ maxFileSizeBytes: z.number(), maxConcurrent: z.number() }),
  load: z.number(),
  freeDiskBytes: z.number(),
  status: z.enum(["idle", "busy", "paused"]),
  lastSeen: z.string(),
});

const HeartbeatSchema = z.object({
  deviceId: z.string(),
  status: z.enum(["idle", "busy", "paused"]),
  lastSeen: z.string(),
});

export interface AgentJobRecord {
  id: string;
  workspaceId: string;
  clientId: string;
  deviceId?: string;
  status: "available" | "leased" | "completed" | "failed" | "rejected" | "cancelled";
  operation: string;
  input: Uint8Array;
  inputSha256: string;
  inputSizeBytes: number;
  inputFilename: string;
  inputMimeType: string;
  options: Record<string, unknown>;
  requestingOrg: string;
  requestingApp: string;
  retentionMinutes: number;
  timeoutMs: number;
  inputToken: string;
  leaseId?: string;
  result?: { bytes: Uint8Array; sha256: string; sizeBytes: number; mimeType: string };
  error?: string;
}

interface PairingRecord {
  requestId: string;
  codeHash: string;
  publicKey: string;
  deviceName: string;
  platform: string;
  arch: string;
  version: string;
  status: "pending" | "authorized" | "rejected" | "expired";
  attempts: number;
  expiresAt: number;
  deviceId?: string;
  accessToken?: string;
  refreshToken?: string;
  accessTokenExpiresAt?: number;
  refreshTokenExpiresAt?: number;
}

interface DeviceRecord {
  deviceId: string;
  publicKey: string;
  workspaceId: string;
  clientId: string;
  status: "active" | "revoked";
  accessTokenHash: string;
  refreshTokenHash: string;
  refreshFamily: string;
  accessTokenExpiresAt: number;
  refreshTokenExpiresAt: number;
  capabilities?: z.infer<typeof CapabilitiesSchema>;
  lastSeen?: string;
}

export class InMemoryAgentService {
  private pairings = new Map<string, PairingRecord>();
  private devices = new Map<string, DeviceRecord>();
  private jobs = new Map<string, AgentJobRecord>();

  createPairing(input: z.infer<typeof PairingSchema>) {
    const requestId = `apr_${randomBytes(10).toString("hex")}`;
    const code = String(randomInt(100000, 999999));
    const record: PairingRecord = {
      requestId,
      codeHash: hash(code),
      publicKey: input.publicKey,
      deviceName: input.deviceName,
      platform: input.platform,
      arch: input.arch,
      version: input.version,
      status: "pending",
      attempts: 0,
      expiresAt: Date.now() + PAIRING_TTL_MS,
    };
    this.pairings.set(requestId, record);
    return { requestId, code, expiresAt: record.expiresAt };
  }

  status(requestId: string) {
    const record = this.pairings.get(requestId);
    if (!record) return null;
    if (record.status === "pending" && Date.now() > record.expiresAt) {
      record.status = "expired";
    }
    if (record.status !== "authorized") return { status: record.status };
    return {
      status: "authorized" as const,
      accessToken: record.accessToken!,
      refreshToken: record.refreshToken!,
      deviceId: record.deviceId!,
      accessTokenExpiresAt: record.accessTokenExpiresAt!,
      refreshTokenExpiresAt: record.refreshTokenExpiresAt!,
    };
  }

  approve(requestId: string, code: string, auth: AuthContext) {
    const record = this.pairings.get(requestId);
    if (!record) return { error: "PAIRING_NOT_FOUND" as const };
    if (record.status !== "pending") return { error: "PAIRING_NOT_PENDING" as const };
    if (Date.now() > record.expiresAt) {
      record.status = "expired";
      return { error: "PAIRING_EXPIRED" as const };
    }
    record.attempts += 1;
    if (record.attempts > MAX_PAIRING_ATTEMPTS) {
      record.status = "rejected";
      return { error: "PAIRING_TOO_MANY_ATTEMPTS" as const };
    }
    if (hash(code) !== record.codeHash) return { error: "PAIRING_CODE_INVALID" as const };

    const deviceId = `dev_${randomBytes(10).toString("hex")}`;
    const tokens = issueTokens();
    const device: DeviceRecord = {
      deviceId,
      publicKey: record.publicKey,
      workspaceId: auth.claims.sub,
      clientId: auth.claims.client_id,
      status: "active",
      accessTokenHash: hash(tokens.accessToken),
      refreshTokenHash: hash(tokens.refreshToken),
      refreshFamily: tokens.refreshFamily,
      accessTokenExpiresAt: tokens.accessTokenExpiresAt,
      refreshTokenExpiresAt: tokens.refreshTokenExpiresAt,
    };
    this.devices.set(deviceId, device);
    Object.assign(record, {
      status: "authorized" as const,
      deviceId,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      accessTokenExpiresAt: tokens.accessTokenExpiresAt,
      refreshTokenExpiresAt: tokens.refreshTokenExpiresAt,
    });
    return { deviceId, ...tokens };
  }

  reject(requestId: string) {
    const record = this.pairings.get(requestId);
    if (!record) return false;
    if (record.status === "pending") record.status = "rejected";
    return true;
  }

  refresh(refreshToken: string, deviceId: string) {
    const device = this.devices.get(deviceId);
    if (!device || device.status !== "active") return { error: "AGENT_DEVICE_REVOKED" as const };
    if (Date.now() > device.refreshTokenExpiresAt) return { error: "AUTH_EXPIRED_TOKEN" as const };
    if (hash(refreshToken) !== device.refreshTokenHash) {
      device.status = "revoked";
      return { error: "AUTH_REFRESH_REUSE_DETECTED" as const };
    }
    const tokens = issueTokens(device.refreshFamily);
    Object.assign(device, {
      accessTokenHash: hash(tokens.accessToken),
      refreshTokenHash: hash(tokens.refreshToken),
      accessTokenExpiresAt: tokens.accessTokenExpiresAt,
      refreshTokenExpiresAt: tokens.refreshTokenExpiresAt,
    });
    return tokens;
  }

  unpair(accessToken: string, refreshToken: string, deviceId: string) {
    const device = this.devices.get(deviceId);
    if (!device) return false;
    if (hash(accessToken) !== device.accessTokenHash && hash(refreshToken) !== device.refreshTokenHash) return false;
    device.status = "revoked";
    return true;
  }

  authenticate(accessToken: string): DeviceRecord | null {
    const tokenHash = hash(accessToken);
    for (const device of this.devices.values()) {
      if (device.accessTokenHash === tokenHash) {
        if (device.status !== "active" || Date.now() > device.accessTokenExpiresAt) return null;
        return device;
      }
    }
    return null;
  }

  saveCapabilities(deviceId: string, capabilities: z.infer<typeof CapabilitiesSchema>) {
    const device = this.devices.get(deviceId);
    if (!device || device.status !== "active") return false;
    device.capabilities = capabilities;
    device.lastSeen = new Date().toISOString();
    return true;
  }

  heartbeat(deviceId: string, heartbeat: z.infer<typeof HeartbeatSchema>) {
    const device = this.devices.get(deviceId);
    if (!device || device.status !== "active") return false;
    device.lastSeen = heartbeat.lastSeen;
    if (device.capabilities) device.capabilities.status = heartbeat.status;
    return true;
  }

  enqueueLocalJob(job: Omit<AgentJobRecord, "id" | "status" | "inputToken" | "inputSha256" | "inputSizeBytes"> & { id?: string }) {
    const id = job.id ?? `ajob_${randomBytes(10).toString("hex")}`;
    const inputSha256 = createHash("sha256").update(job.input).digest("hex");
    const record: AgentJobRecord = {
      ...job,
      id,
      status: "available",
      inputToken: randomBytes(24).toString("base64url"),
      inputSha256,
      inputSizeBytes: job.input.byteLength,
    };
    this.jobs.set(id, record);
    return record;
  }

  nextJob(device: DeviceRecord) {
    for (const job of this.jobs.values()) {
      if (job.status !== "available") continue;
      if (job.deviceId && job.deviceId !== device.deviceId) continue;
      if (job.workspaceId !== device.workspaceId || job.clientId !== device.clientId) continue;
      if (!device.capabilities?.operations.includes(job.operation)) continue;
      return job;
    }
    return null;
  }

  accept(jobId: string, device: DeviceRecord) {
    const job = this.jobs.get(jobId);
    if (!job || job.status !== "available") return null;
    job.status = "leased";
    job.deviceId = device.deviceId;
    job.leaseId = `lease_${randomBytes(8).toString("hex")}`;
    return job.leaseId;
  }

  rejectJob(jobId: string, device: DeviceRecord, reason: string) {
    const job = this.jobs.get(jobId);
    if (!job || job.deviceId && job.deviceId !== device.deviceId) return false;
    job.status = "rejected";
    job.error = reason;
    return true;
  }

  input(jobId: string, device: DeviceRecord, inputToken: string) {
    const job = this.jobs.get(jobId);
    if (!job || job.deviceId !== device.deviceId || job.inputToken !== inputToken) return null;
    return job;
  }

  saveResult(jobId: string, device: DeviceRecord, result: { bytes: Uint8Array; sha256: string; sizeBytes: number; mimeType: string }) {
    const job = this.jobs.get(jobId);
    if (!job || job.deviceId !== device.deviceId || job.status !== "leased") return false;
    if (hashBytes(result.bytes) !== result.sha256 || result.bytes.byteLength !== result.sizeBytes) return false;
    job.result = result;
    return true;
  }

  confirm(jobId: string, device: DeviceRecord, sha256: string, sizeBytes: number) {
    const job = this.jobs.get(jobId);
    if (!job || job.deviceId !== device.deviceId || !job.result) return false;
    if (job.result.sha256 !== sha256 || job.result.sizeBytes !== sizeBytes) return false;
    job.status = "completed";
    return true;
  }

  fail(jobId: string, device: DeviceRecord, error: string) {
    const job = this.jobs.get(jobId);
    if (!job || job.deviceId !== device.deviceId) return false;
    job.status = "failed";
    job.error = error;
    return true;
  }

  cancelled(jobId: string, device: DeviceRecord) {
    const job = this.jobs.get(jobId);
    if (!job || job.deviceId !== device.deviceId) return false;
    job.status = "cancelled";
    return true;
  }

  getJob(jobId: string) {
    return this.jobs.get(jobId) ?? null;
  }
}

export const defaultAgentService = new InMemoryAgentService();

export function createAgentPublicRouter(service = defaultAgentService): Hono {
  const app = new Hono();

  app.post("/agent-pairing-requests", async (c) => {
    const parsed = PairingSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return validationError(c, parsed.error);
    const result = service.createPairing(parsed.data);
    return c.json(result, 201);
  });

  app.get("/agent-pairing-requests/:requestId/status", (c) => {
    const status = service.status(c.req.param("requestId"));
    if (!status) return problem(c, 404, "PAIRING_NOT_FOUND", "Not Found");
    return c.json(status);
  });

  app.post("/agent/token/refresh", async (c) => {
    const parsed = z.object({ refreshToken: z.string(), deviceId: z.string() }).safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return validationError(c, parsed.error);
    const result = service.refresh(parsed.data.refreshToken, parsed.data.deviceId);
    if ("error" in result) return problem(c, result.error === "AUTH_REFRESH_REUSE_DETECTED" ? 403 : 401, result.error, "Unauthorized");
    return c.json(result);
  });

  app.post("/agent/unpair", async (c) => {
    const auth = c.req.header("Authorization")?.replace(/^Bearer /, "") ?? "";
    const parsed = z.object({ refreshToken: z.string(), deviceId: z.string() }).safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return validationError(c, parsed.error);
    const ok = service.unpair(auth, parsed.data.refreshToken, parsed.data.deviceId);
    return ok ? c.json({ ok: true }) : problem(c, 401, "AUTH_INVALID_TOKEN", "Unauthorized");
  });

  return app;
}

export function createAgentAdminRouter(service = defaultAgentService): Hono {
  const app = new Hono();
  app.post("/agent-pairing-requests/:requestId/approve", requireScope("filestudio:admin"), async (c) => {
    const auth = c.get("auth") as AuthContext;
    const parsed = z.object({ code: z.string().regex(/^\d{6}$/) }).safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return validationError(c, parsed.error);
    const result = service.approve(c.req.param("requestId")!, parsed.data.code, auth);
    if ("error" in result) return problem(c, 409, result.error ?? "PAIRING_ERROR", "Pairing could not be approved");
    return c.json(result);
  });
  app.post("/agent-pairing-requests/:requestId/reject", requireScope("filestudio:admin"), (c) => {
    return service.reject(c.req.param("requestId")!)
      ? c.json({ ok: true })
      : problem(c, 404, "PAIRING_NOT_FOUND", "Not Found");
  });
  return app;
}

export function createAgentAuthenticatedRouter(service = defaultAgentService): Hono {
  const app = new Hono();
  app.use("*", async (c, next) => {
    const token = c.req.header("Authorization")?.replace(/^Bearer /, "") ?? "";
    const device = service.authenticate(token);
    if (!device) return problem(c, 401, "AUTH_INVALID_TOKEN", "Unauthorized");
    c.set("agentDevice", device);
    await next();
  });

  app.post("/capabilities", async (c) => {
    const device = c.get("agentDevice") as DeviceRecord;
    const parsed = CapabilitiesSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return validationError(c, parsed.error);
    if (parsed.data.deviceId !== device.deviceId) return problem(c, 403, "AUTH_INSUFFICIENT_SCOPE", "Wrong device");
    service.saveCapabilities(device.deviceId, parsed.data);
    return c.json({ ok: true });
  });

  app.post("/heartbeat", async (c) => {
    const device = c.get("agentDevice") as DeviceRecord;
    const parsed = HeartbeatSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return validationError(c, parsed.error);
    if (parsed.data.deviceId !== device.deviceId) return problem(c, 403, "AUTH_INSUFFICIENT_SCOPE", "Wrong device");
    service.heartbeat(device.deviceId, parsed.data);
    return c.json({ ok: true });
  });

  app.get("/jobs/available", (c) => {
    const device = c.get("agentDevice") as DeviceRecord;
    const job = service.nextJob(device);
    if (!job) return c.body(null, 204);
    return c.json({
      id: job.id,
      operation: job.operation,
      inputToken: job.inputToken,
      inputSha256: job.inputSha256,
      inputSizeBytes: job.inputSizeBytes,
      inputFilename: job.inputFilename,
      inputMimeType: job.inputMimeType,
      options: job.options,
      requestingOrg: job.requestingOrg,
      requestingApp: job.requestingApp,
      retentionMinutes: job.retentionMinutes,
      timeoutMs: job.timeoutMs,
    });
  });

  app.post("/jobs/:jobId/accept", (c) => {
    const leaseId = service.accept(c.req.param("jobId"), c.get("agentDevice") as DeviceRecord);
    return leaseId ? c.json({ leaseId }) : problem(c, 409, "INVALID_STATE", "Job not available");
  });

  app.post("/jobs/:jobId/reject", async (c) => {
    const parsed = z.object({ reason: z.string().max(500) }).safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return validationError(c, parsed.error);
    return service.rejectJob(c.req.param("jobId"), c.get("agentDevice") as DeviceRecord, parsed.data.reason)
      ? c.json({ ok: true })
      : problem(c, 404, "JOB_NOT_FOUND", "Not Found");
  });

  app.get("/jobs/:jobId/input", (c) => {
    const job = service.input(c.req.param("jobId"), c.get("agentDevice") as DeviceRecord, c.req.header("X-Agent-Input-Token") ?? "");
    if (!job) return problem(c, 404, "JOB_NOT_FOUND", "Not Found");
    return new Response(Buffer.from(job.input), {
      headers: {
        "Content-Type": job.inputMimeType,
        "Content-Length": String(job.inputSizeBytes),
        "X-Content-Sha256": job.inputSha256,
      },
    });
  });

  app.put("/jobs/:jobId/result", async (c) => {
    const sha256 = c.req.header("X-Content-Sha256") ?? "";
    const mimeType = c.req.header("Content-Type") ?? "application/octet-stream";
    const bytes = new Uint8Array(await c.req.arrayBuffer());
    const ok = service.saveResult(c.req.param("jobId"), c.get("agentDevice") as DeviceRecord, {
      bytes,
      sha256,
      sizeBytes: bytes.byteLength,
      mimeType,
    });
    return ok ? c.json({ ok: true }) : problem(c, 422, "OUTPUT_HASH_MISMATCH", "Invalid result");
  });

  app.post("/jobs/:jobId/confirm", async (c) => {
    const parsed = z.object({ sha256: z.string().length(64), sizeBytes: z.number().int().nonnegative() }).safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return validationError(c, parsed.error);
    return service.confirm(c.req.param("jobId"), c.get("agentDevice") as DeviceRecord, parsed.data.sha256, parsed.data.sizeBytes)
      ? c.json({ ok: true })
      : problem(c, 422, "OUTPUT_HASH_MISMATCH", "Invalid result confirmation");
  });

  app.post("/jobs/:jobId/fail", async (c) => {
    const parsed = z.object({ error: z.string().max(1000) }).safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return validationError(c, parsed.error);
    return service.fail(c.req.param("jobId"), c.get("agentDevice") as DeviceRecord, parsed.data.error)
      ? c.json({ ok: true })
      : problem(c, 404, "JOB_NOT_FOUND", "Not Found");
  });

  app.post("/jobs/:jobId/cancelled", (c) => {
    return service.cancelled(c.req.param("jobId"), c.get("agentDevice") as DeviceRecord)
      ? c.json({ ok: true })
      : problem(c, 404, "JOB_NOT_FOUND", "Not Found");
  });

  return app;
}

function issueTokens(refreshFamily = `rtf_${randomBytes(10).toString("hex")}`) {
  return {
    accessToken: `aat_${randomBytes(32).toString("base64url")}`,
    refreshToken: `art_${randomBytes(32).toString("base64url")}`,
    refreshFamily,
    accessTokenExpiresAt: Date.now() + ACCESS_TTL_MS,
    refreshTokenExpiresAt: Date.now() + REFRESH_TTL_MS,
  };
}

function randomInt(min: number, max: number): number {
  return min + randomBytes(4).readUInt32BE(0) % (max - min + 1);
}

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function hashBytes(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function problem(c: { json: (body: unknown, status?: number) => Response }, status: number, code: string, title: string) {
  return c.json({ type: "about:blank", title, status, code }, status);
}

function validationError(c: { json: (body: unknown, status?: number) => Response }, error: z.ZodError) {
  return c.json({
    type: "about:blank",
    title: "Bad Request",
    status: 400,
    code: "VALIDATION_FAILED",
    detail: error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
  }, 400);
}
