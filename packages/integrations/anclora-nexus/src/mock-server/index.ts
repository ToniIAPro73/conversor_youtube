// Mock FileStudio Service server — used by Nexus integration tests.
// Simulates the full API surface so Nexus can test against it without
// deploying the real Service or touching a real database.
import { Hono } from "hono";
import type { Server } from "node:http";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { serve } from "@hono/node-server";

interface MockJob {
  id: string;
  status: "created" | "queued" | "processing" | "completed" | "failed" | "cancelled";
  operation: string;
  uploadId: string;
  options: Record<string, unknown>;
  createdAt: Date;
  idempotencyKey?: string;
}

interface MockUpload {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  expiresAt: Date;
}

export interface MockServerState {
  jobs: Map<string, MockJob>;
  uploads: Map<string, MockUpload>;
  tokens: Map<string, string>; // token → jobId
  webhookDeliveries: Array<{ url: string; payload: unknown }>;
  idempotencyKeys: Map<string, { jobId: string; requestHash: string }>;
}

function makeId(prefix: string) {
  return `${prefix}_${randomBytes(12).toString("hex")}`;
}

function requestHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function tokenAccepted(auth: string | undefined, expected: string): boolean {
  if (!auth?.startsWith("Bearer ")) return false;
  const received = Buffer.from(auth.slice(7));
  const wanted = Buffer.from(expected);
  return received.length === wanted.length && timingSafeEqual(received, wanted);
}

export function createMockFileStudioServer(options: { acceptedBearerToken?: string; enableTestRoutes?: boolean } = {}): {
  app: Hono;
  state: MockServerState;
  start: (port?: number) => Promise<{ url: string; close: () => Promise<void> }>;
} {
  const state: MockServerState = {
    jobs: new Map(),
    uploads: new Map(),
    tokens: new Map(),
    webhookDeliveries: [],
    idempotencyKeys: new Map(),
  };

  const app = new Hono();
  const acceptedBearerToken = options.acceptedBearerToken ?? "test-token";

  // Auth middleware — strict token comparison even in tests.
  app.use("/api/v1/*", async (c, next) => {
    const auth = c.req.header("Authorization");
    if (!tokenAccepted(auth, acceptedBearerToken)) {
      return c.json({ type: "about:blank", title: "Unauthorized", status: 401, code: "AUTH_INVALID_TOKEN" }, 401);
    }
    await next();
  });

  // Health
  app.get("/api/v1/health", (c) => c.json({ ok: true, app: "anclora-filestudio-service-mock" }));

  // Uploads
  app.post("/api/v1/uploads", async (c) => {
    const body = await c.req.json().catch(() => ({})) as Record<string, unknown>;
    const id = makeId("upl");
    const upload: MockUpload = {
      id,
      filename: String(body.filename ?? "file"),
      mimeType: String(body.mimeType ?? "application/octet-stream"),
      sizeBytes: Number(body.sizeBytes ?? 0),
      sha256: String(body.sha256 ?? "a".repeat(64)),
      expiresAt: new Date(Date.now() + 3600_000),
    };
    state.uploads.set(id, upload);
    return c.json({ ...upload, status: "ready", expiresAt: upload.expiresAt.toISOString() }, 201);
  });

  app.get("/api/v1/uploads/:id", (c) => {
    const upload = state.uploads.get(c.req.param("id"));
    if (!upload) return c.json({ type: "about:blank", title: "Not Found", status: 404, code: "UPLOAD_NOT_FOUND" }, 404);
    return c.json({ ...upload, status: "ready", expiresAt: upload.expiresAt.toISOString() });
  });

  // Jobs
  app.post("/api/v1/jobs", async (c) => {
    const body = await c.req.json().catch(() => ({})) as Record<string, unknown>;
    const idempotencyKey = c.req.header("Idempotency-Key") ?? (body.idempotencyKey as string | undefined);

    // Idempotency check
    const hash = requestHash(body);
    if (idempotencyKey) {
      const existing = state.idempotencyKeys.get(idempotencyKey);
      if (existing) {
        if (existing.requestHash !== hash) {
          return c.json({ type: "about:blank", title: "Conflict", status: 409, code: "IDEMPOTENCY_CONFLICT" }, 409);
        }
        const job = state.jobs.get(existing.jobId);
        if (job) {
          return c.json({
            jobId: job.id,
            status: job.status,
            operation: job.operation,
            createdAt: job.createdAt.toISOString(),
            links: { self: `/api/v1/jobs/${job.id}`, events: `/api/v1/jobs/${job.id}/events` },
          }, 202);
        }
      }
    }

    const id = makeId("job");
    const job: MockJob = {
      id,
      status: "created",
      operation: String((body.operation as string) ?? ""),
      uploadId: String(((body.input as Record<string, unknown>)?.uploadId as string) ?? ""),
      options: (body.options as Record<string, unknown>) ?? {},
      createdAt: new Date(),
      idempotencyKey,
    };
    state.jobs.set(id, job);

    if (idempotencyKey) {
      state.idempotencyKeys.set(idempotencyKey, { jobId: id, requestHash: hash });
    }

    // Auto-advance to completed after a tick (for testing)
    setTimeout(() => {
      const j = state.jobs.get(id);
      if (j && j.status === "created") j.status = "completed";
    }, 50);

    return c.json({
      jobId: id,
      status: "created",
      operation: job.operation,
      createdAt: job.createdAt.toISOString(),
      links: { self: `/api/v1/jobs/${id}`, events: `/api/v1/jobs/${id}/events` },
    }, 202);
  });

  app.get("/api/v1/jobs/:id", (c) => {
    const job = state.jobs.get(c.req.param("id"));
    if (!job) return c.json({ type: "about:blank", title: "Not Found", status: 404, code: "JOB_NOT_FOUND" }, 404);
    return c.json({
      jobId: job.id,
      status: job.status,
      operation: job.operation,
      progress: job.status === "completed" ? 100 : null,
      createdAt: job.createdAt.toISOString(),
      updatedAt: job.createdAt.toISOString(),
      startedAt: job.status !== "created" ? job.createdAt.toISOString() : null,
      completedAt: job.status === "completed" ? job.createdAt.toISOString() : null,
    });
  });

  app.post("/api/v1/jobs/:id/cancel", (c) => {
    const job = state.jobs.get(c.req.param("id"));
    if (!job) return c.json({ type: "about:blank", title: "Not Found", status: 404, code: "JOB_NOT_FOUND" }, 404);
    if (["completed", "failed", "cancelled"].includes(job.status)) {
      return c.json({ type: "about:blank", title: "Conflict", status: 409, code: "INVALID_STATE" }, 409);
    }
    job.status = "cancelled";
    return c.json({ ok: true, message: "Cancellation requested" });
  });

  app.post("/api/v1/jobs/:id/result-token", (c) => {
    const job = state.jobs.get(c.req.param("id"));
    if (!job || job.status !== "completed") {
      return c.json({ type: "about:blank", title: "Not Found", status: 404, code: "JOB_NOT_FOUND" }, 404);
    }
    const token = `tok_${randomBytes(24).toString("base64url")}`;
    state.tokens.set(token, job.id);
    return c.json({ token, expiresAt: new Date(Date.now() + 900_000).toISOString() }, 201);
  });

  // Download (via token)
  app.get("/api/v1/download/:jobId", (c) => {
    const token = c.req.query("token");
    if (!token || !state.tokens.has(token)) {
      return c.json({ type: "about:blank", title: "Unauthorized", status: 401, code: "AUTH_INVALID_TOKEN" }, 401);
    }
    // Return mock file content
    return new Response("MOCK_OUTPUT_FILE_CONTENT", {
      headers: { "Content-Type": "application/pdf", "Content-Disposition": "attachment; filename=output.pdf" },
    });
  });

  // Webhook endpoints registration
  app.post("/api/v1/webhook-endpoints", async (c) => {
    const body = await c.req.json().catch(() => ({})) as Record<string, unknown>;
    const id = makeId("whe");
    return c.json({ id, ...body, status: "active", createdAt: new Date().toISOString() }, 201);
  });

  if (options.enableTestRoutes === true) {
    app.post("/api/v1/__test/deliver-webhook", async (c) => {
      const body = await c.req.json().catch(() => ({}));
      state.webhookDeliveries.push({ url: "", payload: body });
      return c.json({ ok: true });
    });
  }

  const start = async (port = 0) => {
    const serverInstance = await new Promise<ReturnType<typeof serve>>((resolve) => {
      const s = serve({ fetch: app.fetch, port }, () => resolve(s));
    });
    const address = (serverInstance as unknown as { address: () => { port: number } }).address();
    const url = `http://127.0.0.1:${address.port}`;
    const close = () => new Promise<void>((r, j) => {
      (serverInstance as unknown as Server).close((e) => e ? j(e) : r());
    });
    return { url, close };
  };

  return { app, state, start };
}
