import postgres from "postgres";
import { monotonicFactory } from "ulid";
import type {
  JobRepository,
  JobRecord,
  CreateJobInput,
  JobTransition,
  JobEvent,
  JobLease,
} from "@anclora/filestudio-core";
import { assertValidTransition } from "@anclora/filestudio-core";
import type { JobStatus } from "@anclora/filestudio-core";

const ulid = monotonicFactory();

// Type-safe JSON serializer for postgres tagged templates
// postgres's json() requires JSONValue but Record<string, unknown> is wider;
// serializing through JSON.parse(JSON.stringify()) coerces to a safe shape.
function jsonb(v: Record<string, unknown>): postgres.JSONValue {
  return JSON.parse(JSON.stringify(v)) as postgres.JSONValue;
}

function rowToJobRecord(row: Record<string, unknown>): JobRecord {
  return {
    id: row.id as string,
    clientId: row.client_id as string,
    workspaceId: row.workspace_id as string,
    operation: row.operation as string,
    uploadId: (row.upload_id as string | null) ?? null,
    status: row.status as JobStatus,
    priority: row.priority as number,
    options: (row.options as Record<string, unknown>) ?? {},
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    engineId: (row.engine_id as import("@anclora/filestudio-core").EngineId | null) ?? null,
    queueName: (row.queue_name as string) ?? "",
    idempotencyKey: (row.idempotency_key as string | null) ?? null,
    correlationId: (row.correlation_id as string | null) ?? null,
    inputPath: (row.input_path as string | null) ?? null,
    outputPath: (row.output_path as string | null) ?? null,
    sha256Input: (row.sha256_input as string | null) ?? null,
    sha256Output: (row.sha256_output as string | null) ?? null,
    createdAt: row.created_at as Date,
    updatedAt: row.updated_at as Date,
    queuedAt: (row.queued_at as Date | null) ?? null,
    startedAt: (row.started_at as Date | null) ?? null,
    completedAt: (row.completed_at as Date | null) ?? null,
    expiresAt: (row.expires_at as Date | null) ?? null,
    deletedAt: (row.deleted_at as Date | null) ?? null,
  };
}

export class PostgresJobRepository implements JobRepository {
  constructor(private readonly sql: postgres.Sql) {}

  async create(input: CreateJobInput): Promise<JobRecord> {
    const id = ulid();
    const rows = await this.sql`
      INSERT INTO jobs (
        id, client_id, workspace_id, operation, upload_id,
        options, metadata, priority, idempotency_key, correlation_id,
        queue_name, status
      ) VALUES (
        ${id}, ${input.clientId}, ${input.workspaceId}, ${input.operation},
        ${input.uploadId ?? null},
        ${this.sql.json(jsonb(input.options ?? {}))},
        ${this.sql.json(jsonb(input.metadata ?? {}))},
        ${input.priority ?? 5},
        ${input.idempotencyKey ?? null},
        ${input.correlationId ?? null},
        ${input.queueName ?? null},
        'created'
      )
      RETURNING *
    `;
    return rowToJobRecord(rows[0] as Record<string, unknown>);
  }

  async getById(id: string): Promise<JobRecord | null> {
    const rows = await this.sql`SELECT * FROM jobs WHERE id = ${id} AND deleted_at IS NULL`;
    if (rows.length === 0) return null;
    return rowToJobRecord(rows[0] as Record<string, unknown>);
  }

  async getByIdAndClient(id: string, clientId: string): Promise<JobRecord | null> {
    const rows = await this.sql`
      SELECT * FROM jobs WHERE id = ${id} AND client_id = ${clientId} AND deleted_at IS NULL
    `;
    if (rows.length === 0) return null;
    return rowToJobRecord(rows[0] as Record<string, unknown>);
  }

  async transition(id: string, t: JobTransition): Promise<JobRecord> {
    const current = await this.getById(id);
    if (!current) throw new Error(`Job not found: ${id}`);
    assertValidTransition(current.status, t.to);

    const now = new Date();
    const queuedAt = t.to === "queued" ? now : null;
    const startedAt = t.to === "processing" ? now : null;
    let completedAt: Date | null = null;
    if (["completed", "partial_failure", "failed", "cancelled"].includes(t.to)) {
      completedAt = now;
    }

    const rows = await this.sql`
      UPDATE jobs SET
        status        = ${t.to},
        updated_at    = ${now},
        engine_id     = COALESCE(${t.engineId ?? null}, engine_id),
        input_path    = COALESCE(${t.inputPath ?? null}, input_path),
        output_path   = COALESCE(${t.outputPath ?? null}, output_path),
        sha256_input  = COALESCE(${t.sha256Input ?? null}, sha256_input),
        sha256_output = COALESCE(${t.sha256Output ?? null}, sha256_output),
        queued_at     = COALESCE(${queuedAt}, queued_at),
        started_at    = COALESCE(${startedAt}, started_at),
        completed_at  = COALESCE(${completedAt}, completed_at)
      WHERE id = ${id}
      RETURNING *
    `;
    return rowToJobRecord(rows[0] as Record<string, unknown>);
  }

  async appendEvent(event: JobEvent): Promise<void> {
    await this.sql`
      INSERT INTO job_events (job_id, event_type, payload)
      VALUES (${event.jobId}, ${event.eventType}, ${this.sql.json(jsonb(event.payload))})
    `;
  }

  async leaseNext(queueName: string, workerId: string, timeoutMs: number): Promise<JobLease | null> {
    const expiresAt = new Date(Date.now() + timeoutMs);

    const rows = await this.sql`
      WITH candidate AS (
        SELECT j.id FROM jobs j
        LEFT JOIN job_leases l ON l.job_id = j.id
        WHERE j.queue_name = ${queueName}
          AND j.status = 'queued'
          AND j.deleted_at IS NULL
          AND (l.job_id IS NULL OR l.expires_at < NOW())
        ORDER BY j.priority DESC, j.created_at
        LIMIT 1
        FOR UPDATE OF j SKIP LOCKED
      )
      INSERT INTO job_leases (job_id, worker_id, expires_at)
      SELECT id, ${workerId}, ${expiresAt} FROM candidate
      ON CONFLICT (job_id) DO UPDATE
        SET worker_id = EXCLUDED.worker_id,
            leased_at = NOW(),
            expires_at = EXCLUDED.expires_at
      RETURNING job_id, worker_id, expires_at
    `;

    if (rows.length === 0) return null;
    const row = rows[0] as { job_id: string; worker_id: string; expires_at: Date };

    // Transition job to leased
    await this.sql`
      UPDATE jobs SET status = 'leased', updated_at = NOW() WHERE id = ${row.job_id}
    `;

    return { jobId: row.job_id, workerId: row.worker_id, expiresAt: row.expires_at };
  }

  async renewLease(jobId: string, workerId: string, timeoutMs: number): Promise<boolean> {
    const expiresAt = new Date(Date.now() + timeoutMs);
    const rows = await this.sql`
      UPDATE job_leases SET expires_at = ${expiresAt}
      WHERE job_id = ${jobId} AND worker_id = ${workerId}
      RETURNING job_id
    `;
    return rows.length > 0;
  }

  async releaseLease(jobId: string, workerId: string): Promise<void> {
    await this.sql`
      DELETE FROM job_leases WHERE job_id = ${jobId} AND worker_id = ${workerId}
    `;
  }

  async listByClient(clientId: string, limit: number, offset: number): Promise<JobRecord[]> {
    const rows = await this.sql`
      SELECT * FROM jobs
      WHERE client_id = ${clientId} AND deleted_at IS NULL
      ORDER BY created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `;
    return rows.map((r) => rowToJobRecord(r as Record<string, unknown>));
  }

  async deleteExpired(before: Date): Promise<number> {
    const rows = await this.sql`
      UPDATE jobs SET status = 'expired', deleted_at = NOW(), updated_at = NOW()
      WHERE expires_at < ${before}
        AND status NOT IN ('completed','partial_failure','failed','cancelled','expired','deleted')
      RETURNING id
    `;
    return rows.length;
  }
}
