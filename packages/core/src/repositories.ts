// Repository interfaces — implemented by Desktop (SQLite) and Service (PostgreSQL).
// Core has no knowledge of the underlying DB technology.

import type { JobStatus } from "./job-state.js";
import type { UniversalFileDescriptor } from "./descriptors.js";
import type { EngineId } from "./engines.js";

// ── Job repository ───────────────────────────────────────────────────────────

export interface JobRecord {
  id: string;
  clientId: string;
  workspaceId: string;
  operation: string;
  uploadId: string | null;
  status: JobStatus;
  priority: number;
  options: Record<string, unknown>;
  metadata: Record<string, unknown>;
  engineId: EngineId | null;
  queueName: string;
  idempotencyKey: string | null;
  correlationId: string | null;
  inputPath: string | null;
  outputPath: string | null;
  sha256Input: string | null;
  sha256Output: string | null;
  createdAt: Date;
  updatedAt: Date;
  queuedAt: Date | null;
  startedAt: Date | null;
  completedAt: Date | null;
  expiresAt: Date | null;
  deletedAt: Date | null;
}

export interface CreateJobInput {
  operation: string;
  clientId: string;
  workspaceId: string;
  uploadId?: string;
  options?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  priority?: number;
  idempotencyKey?: string;
  correlationId?: string;
  queueName?: string;
}

export interface JobTransition {
  to: JobStatus;
  workerId?: string;
  engineId?: EngineId;
  inputPath?: string;
  outputPath?: string;
  sha256Input?: string;
  sha256Output?: string;
  error?: string;
}

export interface JobEvent {
  jobId: string;
  eventType: string;
  payload: Record<string, unknown>;
}

export interface JobLease {
  jobId: string;
  workerId: string;
  expiresAt: Date;
}

export interface JobRepository {
  create(input: CreateJobInput): Promise<JobRecord>;
  getById(id: string): Promise<JobRecord | null>;
  getByIdAndClient(id: string, clientId: string): Promise<JobRecord | null>;
  transition(id: string, transition: JobTransition): Promise<JobRecord>;
  appendEvent(event: JobEvent): Promise<void>;
  leaseNext(queueName: string, workerId: string, timeoutMs: number): Promise<JobLease | null>;
  renewLease(jobId: string, workerId: string, timeoutMs: number): Promise<boolean>;
  releaseLease(jobId: string, workerId: string): Promise<void>;
  listByClient(clientId: string, limit: number, offset: number): Promise<JobRecord[]>;
  deleteExpired(before: Date): Promise<number>;
}

// ── Upload repository ────────────────────────────────────────────────────────

export interface UploadRecord {
  id: string;
  clientId: string;
  workspaceId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  storageKey: string;
  status: "ready" | "consumed" | "expired" | "deleted";
  descriptor: UniversalFileDescriptor | null;
  createdAt: Date;
  expiresAt: Date;
  deletedAt: Date | null;
}

export interface CreateUploadInput {
  clientId: string;
  workspaceId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  storageKey: string;
  ttlMinutes?: number;
}

export interface UploadRepository {
  create(input: CreateUploadInput): Promise<UploadRecord>;
  getById(id: string): Promise<UploadRecord | null>;
  getByIdAndClient(id: string, clientId: string): Promise<UploadRecord | null>;
  markConsumed(id: string): Promise<void>;
  deleteExpired(before: Date): Promise<number>;
}

// ── Idempotency repository ───────────────────────────────────────────────────

export interface IdempotencyRecord {
  id: string;
  clientId: string;
  key: string;
  requestHash: string;
  responseStatus: number;
  responseBody: unknown;
  createdAt: Date;
  expiresAt: Date;
}

export interface IdempotencyRepository {
  find(clientId: string, key: string): Promise<IdempotencyRecord | null>;
  save(record: Omit<IdempotencyRecord, "id" | "createdAt">): Promise<IdempotencyRecord>;
  deleteExpired(before: Date): Promise<number>;
}
