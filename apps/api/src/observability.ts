import { createHash } from "node:crypto";

export const METRIC_NAMES = [
  "jobs_created_total",
  "jobs_completed_total",
  "jobs_failed_total",
  "job_duration_seconds",
  "queue_wait_seconds",
  "active_jobs",
  "worker_heartbeats",
  "storage_bytes",
  "uploads_total",
  "download_bytes",
  "webhook_deliveries_total",
  "webhook_failures_total",
  "rate_limit_rejections_total",
  "auth_failures_total",
  "cleanup_deleted_total",
  "local_agent_connected",
  "local_agent_jobs_total",
  "local_agent_job_duration_seconds",
  "local_agent_pairing_failures_total",
] as const;

type MetricName = typeof METRIC_NAMES[number];

export class MetricsRegistry {
  private values = new Map<MetricName, number>();

  constructor() {
    for (const name of METRIC_NAMES) this.values.set(name, 0);
  }

  increment(name: MetricName, by = 1): void {
    this.values.set(name, (this.values.get(name) ?? 0) + by);
  }

  set(name: MetricName, value: number): void {
    this.values.set(name, value);
  }

  renderPrometheus(): string {
    return METRIC_NAMES.map((name) => `# TYPE ${name} gauge\n${name} ${this.values.get(name) ?? 0}`).join("\n");
  }
}

export const metrics = new MetricsRegistry();

export interface StructuredLogInput {
  level: "debug" | "info" | "warn" | "error";
  service: string;
  version: string;
  environment: string;
  correlationId?: string;
  jobId?: string;
  operationId?: string;
  clientId?: string;
  deviceId?: string;
  errorCode?: string;
  durationMs?: number;
  message: string;
}

export function structuredLog(input: StructuredLogInput): string {
  return JSON.stringify({
    timestamp: new Date().toISOString(),
    level: input.level,
    service: input.service,
    version: input.version,
    environment: input.environment,
    correlationId: input.correlationId,
    jobId: input.jobId,
    operationId: input.operationId,
    clientId: input.clientId ? pseudonymize(input.clientId) : undefined,
    deviceId: input.deviceId ? pseudonymize(input.deviceId) : undefined,
    errorCode: input.errorCode,
    durationMs: input.durationMs,
    message: redact(input.message),
  });
}

export function redact(value: string): string {
  return value
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/g, "Bearer [REDACTED]")
    .replace(/(token|secret|password)=([^&\s]+)/gi, "$1=[REDACTED]")
    .replace(/https?:\/\/\S+/g, "[URL_REDACTED]");
}

function pseudonymize(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}
