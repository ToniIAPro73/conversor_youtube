import { getDb } from "./database";
import crypto from "crypto";

export type JobStatus =
  | "queued"
  | "downloading"
  | "processing"
  | "verifying"
  | "completed"
  | "failed"
  | "cancelled"
  | "interrupted"
  | "expired";

export interface JobRow {
  id: string;
  input_kind: string;
  input_reference: string;
  input_title: string | null;
  operation: string;
  output_format: string;
  quality: string;
  options_json: string | null;
  status: JobStatus;
  stage: string;
  progress: number;
  error_code: string | null;
  error_message: string | null;
  output_file_name: string | null;
  output_relative_path: string | null;
  file_size_bytes: number | null;
  mime_type: string | null;
  download_token_hash: string | null;
  client_ip: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  updated_at: string;
  expires_at: string;
  // Universal fields (migration v2)
  category: string | null;
  engine_id: string | null;
  engine_version: string | null;
  conversion_id: string | null;
  input_mime_type: string | null;
  input_format: string | null;
  output_mime_type: string | null;
  loss_profile: string | null;
  batch_id: string | null;
  warnings_json: string | null;
  validation_json: string | null;
  toolchain_snapshot_json: string | null;
}

export interface CreateJobParams {
  inputKind: "remote-url" | "local-file";
  inputReference: string;
  inputTitle?: string;
  operation: string;
  outputFormat: string;
  quality: string;
  clientIp: string;
  ttlMinutes?: number;
}

export function createJob(params: CreateJobParams): JobRow {
  const db = getDb();
  const id = crypto.randomBytes(16).toString("hex");
  const ttl = params.ttlMinutes ?? 60;
  const expiresAt = new Date(Date.now() + ttl * 60 * 1000).toISOString();

  db.prepare(`
    INSERT INTO jobs (
      id, input_kind, input_reference, input_title,
      operation, output_format, quality,
      status, stage, progress,
      client_ip, expires_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'queued', 'En cola', 0, ?, ?)
  `).run(
    id,
    params.inputKind,
    params.inputReference,
    params.inputTitle ?? null,
    params.operation,
    params.outputFormat,
    params.quality,
    params.clientIp,
    expiresAt
  );

  return getJob(id)!;
}

export function getJob(id: string): JobRow | null {
  const db = getDb();
  return (
    (db.prepare("SELECT * FROM jobs WHERE id = ?").get(id) as JobRow | undefined) ?? null
  );
}

export function updateJob(
  id: string,
  updates: Partial<
    Pick<
      JobRow,
      | "status"
      | "stage"
      | "progress"
      | "error_code"
      | "error_message"
      | "output_file_name"
      | "output_relative_path"
      | "file_size_bytes"
      | "mime_type"
      | "download_token_hash"
      | "started_at"
      | "completed_at"
      | "cancelled_at"
      | "input_title"
      | "category"
      | "engine_id"
      | "engine_version"
      | "conversion_id"
      | "input_mime_type"
      | "input_format"
      | "output_mime_type"
      | "loss_profile"
      | "batch_id"
      | "warnings_json"
      | "validation_json"
      | "toolchain_snapshot_json"
    >
  >
): void {
  const db = getDb();
  const fields: string[] = ["updated_at = datetime('now')"];
  const values: unknown[] = [];

  for (const [key, value] of Object.entries(updates)) {
    const col = camelToSnake(key);
    fields.push(`${col} = ?`);
    values.push(value);
  }
  values.push(id);

  db.prepare(`UPDATE jobs SET ${fields.join(", ")} WHERE id = ?`).run(...values);
}

export function getActiveJobsCount(): number {
  const db = getDb();
  const row = db
    .prepare(
      "SELECT COUNT(*) as cnt FROM jobs WHERE status IN ('queued','downloading','processing','verifying')"
    )
    .get() as { cnt: number };
  return row.cnt;
}

export function getClientActiveJob(clientIp: string): JobRow | null {
  const db = getDb();
  return (
    (db
      .prepare(
        "SELECT * FROM jobs WHERE client_ip = ? AND status IN ('queued','downloading','processing','verifying') LIMIT 1"
      )
      .get(clientIp) as JobRow | undefined) ?? null
  );
}

export function listJobs(limit = 50): JobRow[] {
  const db = getDb();
  return db
    .prepare("SELECT * FROM jobs ORDER BY created_at DESC LIMIT ?")
    .all(limit) as JobRow[];
}

export function markInterruptedJobs(): void {
  const db = getDb();
  db.prepare(`
    UPDATE jobs
    SET status = 'interrupted', updated_at = datetime('now')
    WHERE status IN ('queued', 'downloading', 'processing', 'verifying')
  `).run();
}

export function cleanupExpiredJobs(): number {
  const db = getDb();
  const result = db.prepare(`
    UPDATE jobs SET status = 'expired', updated_at = datetime('now')
    WHERE status = 'completed' AND expires_at < datetime('now')
  `).run();
  return result.changes;
}

function camelToSnake(str: string): string {
  return str.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
}
