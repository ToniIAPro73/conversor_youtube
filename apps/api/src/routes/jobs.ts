import { Hono } from "hono";
import { z } from "zod";
import { requireScope } from "../middleware/auth.js";
import type { AuthContext } from "../middleware/auth.js";

const CreateJobSchema = z.object({
  operation: z.string().min(1),
  input: z.object({ uploadId: z.string().min(1) }),
  options: z.record(z.unknown()).optional().default({}),
  callback: z.object({ webhookEndpointId: z.string() }).optional(),
  idempotencyKey: z.string().max(255).optional(),
  metadata: z.object({
    sourceApplication: z.string().optional(),
    workspaceId: z.string().optional(),
    correlationId: z.string().optional(),
  }).optional().default({}),
});

export function createJobsRouter(): Hono {
  const app = new Hono();

  // POST /jobs — create conversion job
  app.post("/", requireScope("filestudio:jobs:create"), async (c) => {
    const auth = c.get("auth") as AuthContext;
    const body = await c.req.json().catch(() => null);
    const parsed = CreateJobSchema.safeParse(body);

    if (!parsed.success) {
      return c.json({
        type: "about:blank",
        title: "Bad Request",
        status: 400,
        code: "VALIDATION_FAILED",
        detail: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
      }, 400);
    }

    const data = parsed.data;
    const correlationId = c.req.header("X-Correlation-Id") ?? data.metadata?.correlationId;

    // Idempotency check (service handles at middleware level — stub for now)
    const idempotencyKey = c.req.header("Idempotency-Key") ?? data.idempotencyKey;

    // Job creation delegated to JobService (injected via context)
    const jobService = c.get("jobService") as JobService | undefined;
    if (!jobService) {
      return c.json({ type: "about:blank", title: "Service Unavailable", status: 503, code: "ENGINE_UNAVAILABLE" }, 503);
    }

    try {
      const job = await jobService.create({
        clientId: auth.claims.client_id,
        workspaceId: auth.claims.sub,
        operation: data.operation,
        uploadId: data.input.uploadId,
        options: data.options,
        metadata: { ...data.metadata, correlationId },
        idempotencyKey,
        webhookEndpointId: data.callback?.webhookEndpointId,
      });

      return c.json({
        jobId: job.id,
        status: job.status,
        operation: job.operation,
        createdAt: job.createdAt.toISOString(),
        links: {
          self: `/api/v1/jobs/${job.id}`,
          events: `/api/v1/jobs/${job.id}/events`,
        },
      }, 202);
    } catch (err) {
      if (err instanceof Error && err.message.includes("IDEMPOTENCY_CONFLICT")) {
        return c.json({ type: "about:blank", title: "Conflict", status: 409, code: "IDEMPOTENCY_CONFLICT" }, 409);
      }
      if (err instanceof Error && err.message.includes("OPERATION_UNAVAILABLE")) {
        return c.json({ type: "about:blank", title: "Unprocessable Entity", status: 422, code: "OPERATION_UNAVAILABLE", detail: err.message }, 422);
      }
      throw err;
    }
  });

  // GET /jobs/:id
  app.get("/:id", requireScope("filestudio:jobs:read"), async (c) => {
    const auth = c.get("auth") as AuthContext;
    const jobService = c.get("jobService") as JobService | undefined;
    if (!jobService) {
      return c.json({ type: "about:blank", title: "Service Unavailable", status: 503, code: "ENGINE_UNAVAILABLE" }, 503);
    }

    const job = await jobService.getByIdAndClient(c.req.param("id"), auth.claims.client_id);
    if (!job) {
      return c.json({ type: "about:blank", title: "Not Found", status: 404, code: "JOB_NOT_FOUND" }, 404);
    }

    return c.json({
      jobId: job.id,
      status: job.status,
      operation: job.operation,
      progress: job.metadata?.progress ?? null,
      createdAt: job.createdAt.toISOString(),
      updatedAt: job.updatedAt.toISOString(),
      startedAt: job.startedAt?.toISOString() ?? null,
      completedAt: job.completedAt?.toISOString() ?? null,
    });
  });

  // POST /jobs/:id/cancel
  app.post("/:id/cancel", requireScope("filestudio:jobs:cancel"), async (c) => {
    const auth = c.get("auth") as AuthContext;
    const jobService = c.get("jobService") as JobService | undefined;
    if (!jobService) {
      return c.json({ type: "about:blank", title: "Service Unavailable", status: 503, code: "ENGINE_UNAVAILABLE" }, 503);
    }

    const ok = await jobService.cancel(c.req.param("id"), auth.claims.client_id);
    if (ok === null) {
      return c.json({ type: "about:blank", title: "Not Found", status: 404, code: "JOB_NOT_FOUND" }, 404);
    }
    if (!ok) {
      return c.json({ type: "about:blank", title: "Conflict", status: 409, code: "INVALID_STATE", detail: "Job cannot be cancelled in its current state" }, 409);
    }

    return c.json({ ok: true, message: "Cancellation requested" });
  });

  // GET /jobs/:id/events — SSE stream
  app.get("/:id/events", requireScope("filestudio:jobs:read"), async (c) => {
    const auth = c.get("auth") as AuthContext;
    const jobService = c.get("jobService") as JobService | undefined;

    // Verify job exists and belongs to client
    const job = await jobService?.getByIdAndClient(c.req.param("id"), auth.claims.client_id);
    if (!job) {
      return c.json({ type: "about:blank", title: "Not Found", status: 404, code: "JOB_NOT_FOUND" }, 404);
    }

    // Return SSE stream
    return c.streamText(async (stream) => {
      // Initial state event
      await stream.writeln(`event: job.status\ndata: ${JSON.stringify({ jobId: job.id, status: job.status, timestamp: new Date().toISOString() })}\n`);

      // Event subscription injected via context
      const eventBus = c.get("eventBus") as EventBus | undefined;
      if (!eventBus) {
        await stream.writeln(`event: end\ndata: {}\n`);
        return;
      }

      await new Promise<void>((resolve) => {
        const unsub = eventBus.subscribe(job.id, async (event) => {
          try {
            await stream.writeln(`event: ${event.type}\ndata: ${JSON.stringify(event.payload)}\n`);
          } catch {
            // stream closed
          }
          if (["job.completed", "job.failed", "job.cancelled"].includes(event.type)) {
            unsub();
            resolve();
          }
        });

        // Auto-close after 5 minutes
        setTimeout(() => { unsub(); resolve(); }, 5 * 60 * 1000);
      });
    });
  });

  // POST /jobs/:id/result-token
  app.post("/:id/result-token", requireScope("filestudio:results:read"), async (c) => {
    const auth = c.get("auth") as AuthContext;
    const jobService = c.get("jobService") as JobService | undefined;
    if (!jobService) {
      return c.json({ type: "about:blank", title: "Service Unavailable", status: 503, code: "ENGINE_UNAVAILABLE" }, 503);
    }

    const result = await jobService.createDownloadToken(c.req.param("id"), auth.claims.client_id);
    if (!result) {
      return c.json({ type: "about:blank", title: "Not Found", status: 404, code: "JOB_NOT_FOUND" }, 404);
    }

    return c.json({ token: result.token, expiresAt: result.expiresAt.toISOString() }, 201);
  });

  return app;
}

// ── Service interfaces (implemented in Subfase 5.3) ──────────────────────────

interface JobService {
  create(input: {
    clientId: string;
    workspaceId: string;
    operation: string;
    uploadId: string;
    options?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
    idempotencyKey?: string;
    webhookEndpointId?: string;
  }): Promise<{ id: string; status: string; operation: string; createdAt: Date; updatedAt: Date; startedAt?: Date | null; completedAt?: Date | null; metadata?: Record<string, unknown> }>;

  getByIdAndClient(id: string, clientId: string): Promise<{
    id: string;
    status: string;
    operation: string;
    createdAt: Date;
    updatedAt: Date;
    startedAt?: Date | null;
    completedAt?: Date | null;
    metadata?: Record<string, unknown>;
  } | null>;

  cancel(id: string, clientId: string): Promise<boolean | null>;

  createDownloadToken(jobId: string, clientId: string): Promise<{ token: string; expiresAt: Date } | null>;
}

interface EventBus {
  subscribe(jobId: string, handler: (event: { type: string; payload: Record<string, unknown> }) => Promise<void>): () => void;
}
