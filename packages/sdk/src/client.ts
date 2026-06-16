// AncloraFileStudioClient — TypeScript SDK for Anclora FileStudio Service.
// Intended for use by Nexus and other internal Anclora applications.

export interface ClientOptions {
  baseUrl: string;
  clientId: string;
  tokenProvider: () => Promise<string>;
  timeoutMs?: number;
  maxRetries?: number;
}

export class FileStudioError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
    public readonly correlationId?: string
  ) {
    super(message);
    this.name = "FileStudioError";
  }
}

export class FileStudioAuthError extends FileStudioError {}
export class FileStudioNotFoundError extends FileStudioError {}
export class FileStudioRateLimitError extends FileStudioError {
  constructor(code: string, message: string, status: number, public readonly retryAfterSeconds: number) {
    super(code, message, status);
  }
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class BaseResource {
  constructor(protected readonly client: AncloraFileStudioClient) {}

  protected async request<T>(
    method: string,
    path: string,
    options: {
      body?: unknown;
      headers?: Record<string, string>;
      signal?: AbortSignal;
      idempotencyKey?: string;
    } = {}
  ): Promise<T> {
    const token = await this.client.options.tokenProvider();
    const url = `${this.client.options.baseUrl}${path}`;

    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "X-Anclora-Client-Id": this.client.options.clientId,
      ...options.headers,
    };

    if (options.idempotencyKey) {
      headers["Idempotency-Key"] = options.idempotencyKey;
    }

    let lastError: Error | null = null;
    const maxRetries = this.client.options.maxRetries ?? 3;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.client.options.timeoutMs ?? 30_000);
      const signal = options.signal
        ? AbortSignal.any([options.signal, controller.signal])
        : controller.signal;

      try {
        const res = await fetch(url, {
          method,
          headers,
          body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
          signal,
        });

        clearTimeout(timeout);

        if (res.ok) {
          if (res.status === 204) return undefined as T;
          return await res.json() as T;
        }

        // Error responses
        const errorBody = await res.json().catch(() => ({ title: res.statusText, code: "UNKNOWN" })) as {
          title?: string;
          code?: string;
          detail?: string;
          correlationId?: string;
        };

        const msg = errorBody.detail ?? errorBody.title ?? `HTTP ${res.status}`;
        const code = errorBody.code ?? "UNKNOWN";
        const corrId = errorBody.correlationId;

        if (res.status === 401 || res.status === 403) {
          throw new FileStudioAuthError(code, msg, res.status, corrId);
        }
        if (res.status === 404) {
          throw new FileStudioNotFoundError(code, msg, res.status, corrId);
        }
        if (res.status === 429) {
          const retryAfter = parseInt(res.headers.get("Retry-After") ?? "60", 10);
          const err = new FileStudioRateLimitError(code, msg, res.status, retryAfter);
          if (attempt < maxRetries) {
            await sleep(retryAfter * 1000);
            lastError = err;
            continue;
          }
          throw err;
        }
        if (res.status >= 500 && attempt < maxRetries) {
          // Retry with exponential backoff for 5xx
          await sleep(Math.min(1000 * 2 ** attempt, 16_000));
          lastError = new FileStudioError(code, msg, res.status, corrId);
          continue;
        }

        throw new FileStudioError(code, msg, res.status, corrId);
      } catch (err) {
        clearTimeout(timeout);
        if (err instanceof FileStudioError) throw err;
        if (options.signal?.aborted || (err instanceof Error && err.name === "AbortError")) {
          throw new Error("Request aborted");
        }
        if (attempt < maxRetries) {
          await sleep(Math.min(500 * 2 ** attempt, 8_000));
          lastError = err as Error;
          continue;
        }
        throw err;
      }
    }

    throw lastError ?? new Error("Max retries exceeded");
  }
}

export interface UploadRecord {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  sha256: string;
  expiresAt: string;
  status: string;
}

class UploadsResource extends BaseResource {
  async create(
    file: File | Blob,
    options: { filename?: string; mimeType?: string; signal?: AbortSignal } = {}
  ): Promise<UploadRecord> {
    const form = new FormData();
    form.append("file", file, options.filename ?? (file instanceof File ? file.name : "file"));

    const token = await this.client.options.tokenProvider();
    const url = `${this.client.options.baseUrl}/api/v1/uploads`;

    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "X-Anclora-Client-Id": this.client.options.clientId,
      },
      body: form,
      signal: options.signal,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ title: res.statusText, code: "UNKNOWN" })) as { code?: string; detail?: string; title?: string };
      throw new FileStudioError(err.code ?? "UNKNOWN", err.detail ?? err.title ?? `HTTP ${res.status}`, res.status);
    }

    return res.json() as Promise<UploadRecord>;
  }

  async get(uploadId: string, signal?: AbortSignal): Promise<UploadRecord> {
    return this.request("GET", `/api/v1/uploads/${uploadId}`, { signal });
  }

  async delete(uploadId: string, signal?: AbortSignal): Promise<void> {
    return this.request("DELETE", `/api/v1/uploads/${uploadId}`, { signal });
  }
}

export interface JobRecord {
  jobId: string;
  status: string;
  operation: string;
  progress?: number | null;
  createdAt: string;
  updatedAt: string;
  startedAt?: string | null;
  completedAt?: string | null;
  links: { self: string; events: string };
}

export interface CreateJobOptions {
  operation: string;
  uploadId: string;
  options?: Record<string, unknown>;
  webhookEndpointId?: string;
  idempotencyKey?: string;
  metadata?: Record<string, string>;
  signal?: AbortSignal;
}

const TERMINAL_STATUSES = new Set(["completed", "partial_failure", "failed", "cancelled"]);

class JobsResource extends BaseResource {
  async create(opts: CreateJobOptions): Promise<JobRecord> {
    return this.request("POST", "/api/v1/jobs", {
      body: {
        operation: opts.operation,
        input: { uploadId: opts.uploadId },
        options: opts.options ?? {},
        callback: opts.webhookEndpointId ? { webhookEndpointId: opts.webhookEndpointId } : undefined,
        idempotencyKey: opts.idempotencyKey,
        metadata: opts.metadata ?? {},
      },
      idempotencyKey: opts.idempotencyKey,
      signal: opts.signal,
    });
  }

  async get(jobId: string, signal?: AbortSignal): Promise<JobRecord> {
    return this.request("GET", `/api/v1/jobs/${jobId}`, { signal });
  }

  async cancel(jobId: string, signal?: AbortSignal): Promise<{ ok: boolean }> {
    return this.request("POST", `/api/v1/jobs/${jobId}/cancel`, { signal });
  }

  async waitForCompletion(
    jobId: string,
    options: { timeoutMs?: number; pollIntervalMs?: number; signal?: AbortSignal } = {}
  ): Promise<JobRecord> {
    const deadline = Date.now() + (options.timeoutMs ?? 120_000);
    const interval = options.pollIntervalMs ?? 2000;

    while (Date.now() < deadline) {
      if (options.signal?.aborted) throw new Error("Aborted");

      const job = await this.get(jobId, options.signal);
      if (TERMINAL_STATUSES.has(job.status)) {
        if (job.status === "failed" || job.status === "cancelled") {
          throw new FileStudioError("ENGINE_EXECUTE_FAILED", `Job ${jobId} ended with status: ${job.status}`, 500);
        }
        return job;
      }

      await sleep(interval);
    }

    throw new Error(`Job ${jobId} did not complete within ${options.timeoutMs ?? 120_000}ms`);
  }

  async createDownloadToken(jobId: string, signal?: AbortSignal): Promise<{ token: string; expiresAt: string }> {
    return this.request("POST", `/api/v1/jobs/${jobId}/result-token`, { signal });
  }

  async downloadResult(
    jobId: string,
    options: { signal?: AbortSignal } = {}
  ): Promise<{ stream: ReadableStream; sha256: string; filename: string; mimeType: string }> {
    const { token } = await this.createDownloadToken(jobId, options.signal);

    const url = `${this.client.options.baseUrl}/api/v1/jobs/${jobId}/result?token=${token}`;
    const res = await fetch(url, { signal: options.signal });

    if (!res.ok || !res.body) {
      throw new FileStudioError("JOB_NOT_FOUND", `Failed to download result for job ${jobId}`, res.status);
    }

    const sha256 = res.headers.get("X-Content-SHA256") ?? "";
    const disposition = res.headers.get("Content-Disposition") ?? "";
    const filenameMatch = disposition.match(/filename="([^"]+)"/);
    const filename = filenameMatch?.[1] ?? "result";
    const mimeType = res.headers.get("Content-Type") ?? "application/octet-stream";

    return { stream: res.body, sha256, filename, mimeType };
  }
}

export class AncloraFileStudioClient {
  readonly options: ClientOptions;
  readonly uploads: UploadsResource;
  readonly jobs: JobsResource;

  constructor(options: ClientOptions) {
    this.options = options;
    this.uploads = new UploadsResource(this);
    this.jobs = new JobsResource(this);
  }
}
