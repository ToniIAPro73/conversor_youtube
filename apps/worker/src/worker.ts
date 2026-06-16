// Anclora FileStudio — Service Worker
// Consumes conversion jobs from BullMQ queues and processes them.
import { Worker, type Job as BullJob } from "bullmq";
import { Redis } from "ioredis";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { QueueJobPayload } from "@anclora/filestudio-core";
import { QUEUE_NAMES } from "@anclora/filestudio-core";

// ── Config ────────────────────────────────────────────────────────────────────

const ConfigSchema = z.object({
  ANCLORA_WORKER_REDIS_URL: z.string().min(1),
  ANCLORA_WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(32).default(4),
  ANCLORA_WORKER_HEARTBEAT_INTERVAL_MS: z.coerce.number().int().min(5000).default(30_000),
});

function loadConfig() {
  const result = ConfigSchema.safeParse(process.env);
  if (!result.success) {
    console.error("[worker] Invalid configuration:", result.error.flatten());
    process.exit(1);
  }
  return result.data;
}

// ── Processor ─────────────────────────────────────────────────────────────────

async function processJob(job: BullJob<QueueJobPayload>): Promise<void> {
  const { jobId, operation, engineId, inputPath, outputPath, options, timeoutMs } = job.data;

  console.log(`[worker] Processing job=${jobId} op=${operation} engine=${engineId}`);

  await job.updateProgress(0);

  // Delegate to the engine registry (shared with the Next.js Desktop app)
  // In a real multi-process deployment this would import from @anclora/filestudio-engines.
  // For now we stub: the real engine call is wired in when the engines package is complete.
  await runWithTimeout(
    async () => {
      // TODO: import from engines package and call engine.run({ inputPath, outputPath, options })
      // Placeholder for worker test purposes
      await job.updateProgress(50);
      console.log(`[worker] job=${jobId} engine=${engineId} input=${inputPath} output=${outputPath}`);
      await job.updateProgress(100);
    },
    timeoutMs
  );

  console.log(`[worker] Completed job=${jobId}`);
}

async function runWithTimeout<T>(fn: () => Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Job timed out after ${ms}ms`)), ms);
    fn()
      .then((v) => { clearTimeout(timer); resolve(v); })
      .catch((e) => { clearTimeout(timer); reject(e); });
  });
}

// ── Heartbeat ─────────────────────────────────────────────────────────────────

function startHeartbeat(
  workerId: string,
  intervalMs: number,
  queueNames: string[]
): NodeJS.Timeout {
  return setInterval(async () => {
    // Emit to stdout so the orchestrator can pick it up; real implementation
    // writes to the worker_heartbeats PG table via a separate DB connection.
    console.log(JSON.stringify({
      type: "heartbeat",
      workerId,
      queueNames,
      ts: new Date().toISOString(),
    }));
  }, intervalMs);
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────

async function main() {
  const config = loadConfig();
  const workerId = `worker-${randomUUID()}`;

  console.log(`[worker] Starting workerId=${workerId}`);

  const connection = new Redis(config.ANCLORA_WORKER_REDIS_URL, {
    maxRetriesPerRequest: null, // required by BullMQ
    enableReadyCheck: false,
  });

  const allQueues = Object.values(QUEUE_NAMES).filter((q) => q !== QUEUE_NAMES.MAINTENANCE);

  const workers = allQueues.map(
    (queueName) =>
      new Worker<QueueJobPayload>(queueName, processJob, {
        connection,
        concurrency: config.ANCLORA_WORKER_CONCURRENCY,
        stalledInterval: 30_000,
        lockDuration: 60_000,
        lockRenewTime: 15_000,
      })
  );

  for (const w of workers) {
    w.on("error", (err) => console.error(`[worker] BullMQ error:`, err.message));
    w.on("failed", (job, err) =>
      console.error(`[worker] Job ${job?.data.jobId} failed:`, err.message)
    );
  }

  const heartbeatTimer = startHeartbeat(
    workerId,
    config.ANCLORA_WORKER_HEARTBEAT_INTERVAL_MS,
    allQueues
  );

  // Graceful shutdown
  async function shutdown(signal: string) {
    console.log(`[worker] Received ${signal}, draining...`);
    clearInterval(heartbeatTimer);
    await Promise.all(workers.map((w) => w.close()));
    await connection.quit();
    console.log(`[worker] Shutdown complete.`);
    process.exit(0);
  }

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));

  console.log(
    `[worker] Listening on ${allQueues.length} queues with concurrency=${config.ANCLORA_WORKER_CONCURRENCY}`
  );
}

main().catch((err) => {
  console.error("[worker] Fatal:", err);
  process.exit(1);
});
