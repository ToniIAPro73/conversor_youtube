// BullMQ implementation of ConversionQueue
import { Queue } from "bullmq";
import type { ConversionQueue, QueueJobPayload, QueueJobOptions, EnqueuedJob } from "@anclora/filestudio-core";
import { QUEUE_NAMES } from "@anclora/filestudio-core";
import type { Redis } from "ioredis";
import { monotonicFactory } from "ulid";

const ulid = monotonicFactory();

export class BullMQConversionQueue implements ConversionQueue {
  private readonly queues = new Map<string, Queue<QueueJobPayload, unknown, string>>();

  constructor(private readonly connection: Redis) {
    for (const name of Object.values(QUEUE_NAMES)) {
      this.queues.set(
        name,
        new Queue<QueueJobPayload, unknown, string>(name, {
          connection: connection as never,
          defaultJobOptions: {
            removeOnComplete: { age: 3600 }, // keep 1h for debugging
            removeOnFail: { age: 86400 },     // keep 1d for inspection
          },
        })
      );
    }
  }

  private resolveQueue(queueName?: string): Queue<QueueJobPayload, unknown, string> {
    const name = queueName ?? QUEUE_NAMES.MEDIA;
    const q = this.queues.get(name);
    if (!q) throw new Error(`Unknown queue: ${name}`);
    return q;
  }

  async enqueue(payload: QueueJobPayload, options?: QueueJobOptions): Promise<EnqueuedJob> {
    const queue = this.resolveQueue(payload.options?.queueName as string | undefined);
    const queueJobId = ulid();

    await queue.add(payload.operation, payload, {
      jobId: queueJobId,
      priority: options?.priority ?? 5,
      delay: options?.delay,
      attempts: options?.attempts ?? 3,
      backoff: options?.backoff
        ? { type: options.backoff.type, delay: options.backoff.delay }
        : { type: "exponential", delay: 5000 },
    });

    return { queueJobId, jobId: payload.jobId, enqueuedAt: new Date() };
  }

  async cancel(queueJobId: string): Promise<boolean> {
    for (const queue of this.queues.values()) {
      const job = await queue.getJob(queueJobId);
      if (job) {
        await job.remove();
        return true;
      }
    }
    return false;
  }

  async getQueueDepth(queueName?: string): Promise<number> {
    const queue = this.resolveQueue(queueName);
    return queue.getWaitingCount();
  }

  async getActiveCount(queueName?: string): Promise<number> {
    const queue = this.resolveQueue(queueName);
    return queue.getActiveCount();
  }

  async close(): Promise<void> {
    await Promise.all([...this.queues.values()].map((q) => q.close()));
  }
}
