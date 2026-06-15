import {
  createJob as dbCreateJob,
  getJob as dbGetJob,
  updateJob as dbUpdateJob,
  getActiveJobsCount as dbGetActiveJobsCount,
  getClientActiveJob as dbGetClientActiveJob,
  listJobs as dbListJobs,
  markInterruptedJobs,
  cleanupExpiredJobs,
  type JobRow,
  type JobStatus,
} from "../infrastructure/db/job-repository";
import { CONFIG } from "../config";
import crypto from "crypto";

export type { JobStatus, JobRow as Job };

class JobManager {
  private static instance: JobManager;

  private constructor() {
    if (typeof window === "undefined") {
      // Mark any jobs that were active when the process died
      markInterruptedJobs();
      // Periodic cleanup
      setInterval(() => cleanupExpiredJobs(), 5 * 60 * 1000);
    }
  }

  public static getInstance(): JobManager {
    if (!JobManager.instance) {
      JobManager.instance = new JobManager();
    }
    return JobManager.instance;
  }

  public createJob(
    inputReference: string,
    outputFormat: string,
    quality: string,
    clientIp: string,
    operation = "transcode-audio",
    inputKind: "remote-url" | "local-file" = "remote-url",
    inputTitle?: string
  ): JobRow {
    return dbCreateJob({
      inputKind,
      inputReference,
      inputTitle,
      operation,
      outputFormat,
      quality,
      clientIp,
      ttlMinutes: CONFIG.media.limits.jobTtlMinutes,
    });
  }

  public getJob(id: string): JobRow | null {
    return dbGetJob(id);
  }

  public updateJob(id: string, updates: Parameters<typeof dbUpdateJob>[1]): void {
    dbUpdateJob(id, updates);
  }

  public getActiveJobsCount(): number {
    return dbGetActiveJobsCount();
  }

  public getClientActiveJob(clientIp: string): JobRow | null {
    return dbGetClientActiveJob(clientIp);
  }

  public listJobs(limit = 50): JobRow[] {
    return dbListJobs(limit);
  }

  public generateDownloadToken(): string {
    return crypto.randomBytes(32).toString("hex");
  }

  public hashToken(token: string): string {
    return crypto.createHash("sha256").update(token).digest("hex");
  }
}

export const jobManager = JobManager.getInstance();
