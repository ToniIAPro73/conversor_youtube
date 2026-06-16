// ConversionQueue interface — implemented by in-process queue (Desktop) and BullMQ (Service).

import type { EngineId } from "./engines.js";

export interface QueueJobPayload {
  jobId: string;
  operation: string;
  engineId: EngineId;
  inputPath: string;
  outputPath: string;
  options: Record<string, unknown>;
  timeoutMs: number;
  clientId: string;
  workspaceId: string;
  correlationId?: string;
}

export interface QueueJobOptions {
  priority?: number;
  delay?: number;
  attempts?: number;
  backoff?: { type: "exponential" | "fixed"; delay: number };
}

export interface EnqueuedJob {
  queueJobId: string;
  jobId: string;
  enqueuedAt: Date;
}

export interface ConversionQueue {
  enqueue(payload: QueueJobPayload, options?: QueueJobOptions): Promise<EnqueuedJob>;
  cancel(queueJobId: string): Promise<boolean>;
  getQueueDepth(queueName?: string): Promise<number>;
  getActiveCount(queueName?: string): Promise<number>;
  close(): Promise<void>;
}

export const QUEUE_NAMES = {
  DOCUMENTS: "filestudio:documents",
  IMAGES: "filestudio:images",
  MEDIA: "filestudio:media",
  OCR: "filestudio:ocr",
  EBOOKS: "filestudio:ebooks",
  DATA: "filestudio:data",
  MAINTENANCE: "filestudio:maintenance",
} as const;

export type QueueName = typeof QUEUE_NAMES[keyof typeof QUEUE_NAMES];
