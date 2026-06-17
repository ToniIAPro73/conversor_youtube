// Batch processor — orchestrates batch conversion of multiple files.
// Uses the existing `batches` and `batch_jobs` DB tables from migration v2.
// Supports configurable concurrency, partial failure handling, and cancellation.

import crypto from "crypto";
import { getDb } from "../infrastructure/db/database";
import { jobManager } from "./job-manager";
import { processUniversalJob } from "./universal-job-processor";
import { createAppError } from "../errors/error-codes";
import {
  extractEngineIdFromCapabilityId,
  extractOutputFormatFromCapabilityId,
} from "./capability-routing";

// ── Types ────────────────────────────────────────────────────────────────────

export type BatchStatus =
  | "pending"
  | "processing"
  | "completed"
  | "partial-failure"
  | "failed"
  | "cancelled";

export interface BatchInfo {
  id: string;
  name: string | null;
  status: BatchStatus;
  totalJobs: number;
  completedJobs: number;
  failedJobs: number;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  jobs: BatchJobInfo[];
}

export interface BatchJobInfo {
  jobId: string;
  position: number;
  status: string;
  outputFormat: string;
  error: string | null;
}

export interface CreateBatchParams {
  files: string[];            // Input file references (stored relative paths)
  capabilityId: string;       // The conversion capability to apply
  options: Record<string, unknown>;
  name?: string;
  clientIp: string;
  concurrency?: number;       // Max concurrent jobs (default: 2)
}

// ── Defaults ─────────────────────────────────────────────────────────────────

const DEFAULT_CONCURRENCY = 2;

// ── Batch processor ──────────────────────────────────────────────────────────

export async function createBatch(params: CreateBatchParams): Promise<BatchInfo> {
  const {
    files,
    capabilityId,
    options,
    name,
    clientIp,
    concurrency = DEFAULT_CONCURRENCY,
  } = params;

  if (files.length === 0) {
    throw createAppError("INVALID_STATE", "Batch must contain at least one file", { stage: "batch-creation" });
  }

  const batchId = crypto.randomBytes(16).toString("hex");
  const now = new Date().toISOString();
  const db = getDb();

  // Resolve engine from capability ID
  const engineId = extractEngineIdFromCapabilityId(capabilityId);
  const { getEngine } = await import("../engines/registry");
  const engine = getEngine(engineId);
  if (!engine) {
    throw createAppError("ENGINE_NOT_FOUND", `Engine not found: ${engineId}`, { stage: "batch-creation" });
  }

  // Probe engine
  const probeResult = await engine.probe();
  if (!probeResult.available) {
    throw createAppError("ENGINE_UNAVAILABLE", `Engine unavailable: ${engineId}`, { stage: "batch-creation" });
  }

  // Determine output format from capability ID
  const outputFormat = extractOutputFormatFromCapabilityId(capabilityId) ?? "unknown";

  // Create batch record
  db.prepare(`
    INSERT INTO batches (id, name, status, total_jobs, completed_jobs, failed_jobs, created_at, updated_at)
    VALUES (?, ?, 'pending', ?, 0, 0, ?, ?)
  `).run(batchId, name ?? null, files.length, now, now);

  // Create individual jobs and link to batch
  const ttl = 120; // 2 hours TTL for batch jobs
  const expiresAt = new Date(Date.now() + ttl * 60 * 1000).toISOString();

  const insertJobStmt = db.prepare(`
    INSERT INTO jobs (
      id, input_kind, input_reference, input_title,
      operation, output_format, quality, options_json,
      status, stage, progress,
      client_ip, expires_at,
      category, engine_id, conversion_id
    ) VALUES (?, 'universal-file', ?, ?, 'convert-ebook', ?, '0', ?, 'queued', 'En cola', 0, ?, ?, ?, ?, ?)
  `);

  const insertBatchJobStmt = db.prepare(`
    INSERT INTO batch_jobs (batch_id, job_id, position) VALUES (?, ?, ?)
  `);

  const batchJobIds: string[] = [];

  const createJobsTx = db.transaction(() => {
    for (let i = 0; i < files.length; i++) {
      const fileRef = files[i]!;
      const jobId = crypto.randomBytes(16).toString("hex");
      const fileName = fileRef.split("/").pop() ?? fileRef;
      const optionsJson = Object.keys(options).length > 0 ? JSON.stringify(options) : null;

      // Determine category from file extension
      const ext = fileName.split(".").pop()?.toLowerCase() ?? "unknown";
      const category = guessCategory(ext);

      insertJobStmt.run(
        jobId,
        fileRef,
        fileName,
        outputFormat,
        optionsJson,
        clientIp,
        expiresAt,
        category,
        engineId,
        capabilityId
      );

      insertBatchJobStmt.run(batchId, jobId, i);
      batchJobIds.push(jobId);
    }
  });

  createJobsTx();

  // Start processing with concurrency control (async, non-blocking)
  processBatchAsync(batchId, batchJobIds, concurrency).catch((err) => {
    console.error(`[batch-processor] Batch ${batchId} processing error:`, String(err));
  });

  return getBatchStatus(batchId)!;
}

export function getBatchStatus(batchId: string): BatchInfo | null {
  const db = getDb();

  const batch = db.prepare("SELECT * FROM batches WHERE id = ?").get(batchId) as Record<string, unknown> | undefined;
  if (!batch) return null;

  const jobs = db.prepare(`
    SELECT j.id, j.status, j.output_format, j.error_message, bj.position
    FROM batch_jobs bj
    JOIN jobs j ON bj.job_id = j.id
    WHERE bj.batch_id = ?
    ORDER BY bj.position
  `).all(batchId) as Array<{ id: string; status: string; output_format: string; error_message: string | null; position: number }>;

  return {
    id: batch.id as string,
    name: batch.name as string | null,
    status: batch.status as BatchStatus,
    totalJobs: batch.total_jobs as number,
    completedJobs: batch.completed_jobs as number,
    failedJobs: batch.failed_jobs as number,
    createdAt: batch.created_at as string,
    updatedAt: batch.updated_at as string,
    completedAt: batch.completed_at as string | null,
    jobs: jobs.map((j) => ({
      jobId: j.id,
      position: j.position,
      status: j.status,
      outputFormat: j.output_format,
      error: j.error_message,
    })),
  };
}

export function cancelBatch(batchId: string): BatchInfo | null {
  const db = getDb();

  const batch = getBatchStatus(batchId);
  if (!batch) return null;

  if (batch.status !== "pending" && batch.status !== "processing") {
    return batch; // Cannot cancel completed/failed/cancelled batches
  }

  const now = new Date().toISOString();

  // Cancel all queued/pending jobs in the batch
  db.prepare(`
    UPDATE jobs
    SET status = 'cancelled', cancelled_at = ?, updated_at = ?, stage = 'Cancelado'
    WHERE id IN (SELECT job_id FROM batch_jobs WHERE batch_id = ?)
    AND status IN ('queued')
  `).run(now, now, batchId);

  // Update batch status
  db.prepare(`
    UPDATE batches SET status = 'cancelled', updated_at = ? WHERE id = ?
  `).run(now, batchId);

  return getBatchStatus(batchId);
}

// ── Async batch processing with concurrency control ──────────────────────────

async function processBatchAsync(
  batchId: string,
  jobIds: string[],
  concurrency: number
): Promise<void> {
  const db = getDb();
  const now = new Date().toISOString();

  // Update batch to processing
  db.prepare("UPDATE batches SET status = 'processing', updated_at = ? WHERE id = ?").run(now, batchId);

  let completedCount = 0;
  let failedCount = 0;
  const total = jobIds.length;

  // Process jobs with concurrency limit
  const queue = [...jobIds];

  async function processNext(): Promise<void> {
    while (queue.length > 0) {
      const jobId = queue.shift()!;
      const job = jobManager.getJob(jobId);

      // Skip already cancelled jobs
      if (!job || job.status === "cancelled") {
        // Don't count cancelled as failed
        continue;
      }

      try {
        await processUniversalJob(jobId);
      } catch (err) {
        // Job processing handles its own errors; this catch is for unexpected errors
        console.error(`[batch-processor] Job ${jobId} unexpected error:`, String(err));
      }

      // Check final job status
      const finalJob = jobManager.getJob(jobId);
      if (finalJob?.status === "completed") {
        completedCount++;
      } else if (finalJob?.status !== "cancelled") {
        failedCount++;
      }

      // Update batch counters
      const updateNow = new Date().toISOString();
      db.prepare(`
        UPDATE batches
        SET completed_jobs = ?, failed_jobs = ?, updated_at = ?
        WHERE id = ?
      `).run(completedCount, failedCount, updateNow, batchId);
    }
  }

  // Run workers up to concurrency limit
  const workers = Array.from({ length: Math.min(concurrency, jobIds.length) }, () => processNext());
  await Promise.all(workers);

  // Determine final batch status
  const doneNow = new Date().toISOString();
  let finalStatus: BatchStatus;

  if (failedCount === 0 && completedCount === total) {
    finalStatus = "completed";
  } else if (completedCount === 0 && failedCount > 0) {
    finalStatus = "failed";
  } else if (completedCount > 0 && failedCount > 0) {
    finalStatus = "partial-failure";
  } else {
    finalStatus = "cancelled";
  }

  db.prepare(`
    UPDATE batches SET status = ?, completed_at = ?, updated_at = ? WHERE id = ?
  `).run(finalStatus, doneNow, doneNow, batchId);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// extractEngineIdFromCapabilityId and extractOutputFormatFromCapabilityId
// are imported from ./capability-routing

function guessCategory(ext: string): string {
  const CATEGORIES: Record<string, string> = {
    epub: "ebook",
    mobi: "ebook",
    azw3: "ebook",
    pdf: "pdf",
    png: "image",
    jpeg: "image",
    jpg: "image",
    tiff: "image",
    tif: "image",
    webp: "image",
    mp3: "audio",
    wav: "audio",
    flac: "audio",
    mp4: "video",
    mkv: "video",
    webm: "video",
    docx: "document",
    xlsx: "spreadsheet",
    pptx: "presentation",
    zip: "archive",
    "7z": "archive",
  };
  return CATEGORIES[ext] ?? "unknown";
}
