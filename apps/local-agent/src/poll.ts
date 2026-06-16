// Job polling — long-polls the Service API for agent jobs, executes with consent,
// uploads results. HTTPS outbound only, no inbound ports.
import { createHash } from "node:crypto";
import { createWriteStream, mkdirSync, rmSync, existsSync, statSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";
import { pipeline } from "node:stream/promises";
import type { AgentJob, AgentCredentials, AgentCapabilities } from "./types.js";
import type { ConsentEngine } from "./consent.js";
import { expectedOutputPath, LocalOperationRegistry, validateSafeFilename } from "./operations.js";

export interface JobPoller {
  start(): void;
  stop(): Promise<void>;
}

interface TokenRefresher {
  getValidToken(): Promise<string>;
}

export class AgentJobPoller implements JobPoller {
  private running = false;
  private abortController: AbortController | null = null;

  constructor(
    private readonly credentials: AgentCredentials,
    private readonly consent: ConsentEngine,
    private readonly capabilities: AgentCapabilities,
    private readonly tokenRefresher: TokenRefresher,
    private readonly operations: LocalOperationRegistry = new LocalOperationRegistry(),
    private readonly log: (msg: string) => void = console.log
  ) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    void this.loop();
  }

  async stop(): Promise<void> {
    this.running = false;
    this.abortController?.abort();
  }

  private async loop(): Promise<void> {
    while (this.running) {
      try {
        await this.pollOnce();
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") break;
        this.log(`[poll] Error: ${err instanceof Error ? err.message : String(err)}`);
        await sleep(5_000); // back-off on error
      }
    }
    this.log("[poll] Stopped.");
  }

  private async pollOnce(): Promise<void> {
    const token = await this.tokenRefresher.getValidToken();
    this.abortController = new AbortController();

    await this.publishCapabilities(token);

    const res = await fetch(`${this.credentials.serverBaseUrl}/api/v1/agent/jobs/available`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Accept": "application/json",
      },
      signal: this.abortController.signal,
      // Long-poll: server holds connection up to 30s
    });

    if (res.status === 204) return; // no jobs available
    if (res.status === 401) throw new Error("Unauthorized — credentials revoked");
    if (!res.ok) throw new Error(`Poll failed: ${res.status}`);

    const job = await res.json() as AgentJob;
    await this.handleJob(job, token);
  }

  private async handleJob(job: AgentJob, token: string): Promise<void> {
    this.log(`[poll] Received job: ${job.id} op=${job.operation} size=${job.inputSizeBytes}`);

    // Validate job
    if (!this.capabilities.operations.includes(job.operation)) {
      this.log(`[poll] Rejecting unknown operation: ${job.operation}`);
      await this.rejectJob(job.id, token, "Operation not in capabilities");
      return;
    }

    if (job.inputSizeBytes > this.capabilities.limits.maxFileSizeBytes) {
      await this.rejectJob(job.id, token, "File exceeds size limit");
      return;
    }

    // Consent check
    const decision = await this.consent.evaluate(job);
    if (!decision.approved) {
      this.log(`[poll] Consent denied: ${decision.reason}`);
      await this.rejectJob(job.id, token, decision.reason);
      return;
    }

    // Accept lease
    await this.acceptJob(job.id, token);

    // Download input
    const workDir = join(tmpdir(), `filestudio-agent-${randomBytes(8).toString("hex")}`);
    mkdirSync(workDir, { recursive: true });
    const inputPath = join(workDir, `input_${validateSafeFilename(job.inputFilename)}`);
    const outputPath = expectedOutputPath(workDir, job);

    try {
      await this.downloadInput(job, token, inputPath);
      if (job.inputSha256) {
        const actualInputSha = sha256File(inputPath);
        if (actualInputSha !== job.inputSha256) throw new Error("INPUT_HASH_MISMATCH");
      }
      this.log(`[poll] Downloaded input → ${inputPath}`);

      const executionAbort = new AbortController();
      const pollAbort = this.abortController;
      pollAbort?.signal.addEventListener("abort", () => executionAbort.abort(), { once: true });
      const result = await this.operations.execute(job, inputPath, outputPath, executionAbort.signal);
      if (result.outputSizeBytes <= 0) throw new Error("OUTPUT_EMPTY");

      await this.uploadResult(job.id, token, result.outputPath, result.outputMimeType, result.outputSha256);
      await this.confirmJob(job.id, token, result.outputSha256, result.outputSizeBytes);
      this.log(`[poll] Job ${job.id} completed successfully.`);
    } catch (err) {
      this.log(`[poll] Job ${job.id} failed: ${err instanceof Error ? err.message : String(err)}`);
      await this.failJob(job.id, token, String(err));
    } finally {
      if (existsSync(workDir)) rmSync(workDir, { recursive: true, force: true });
    }
  }

  // ── API calls ──────────────────────────────────────────────────────────────

  private async publishCapabilities(token: string): Promise<void> {
    await fetch(`${this.credentials.serverBaseUrl}/api/v1/agent/capabilities`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(this.capabilities),
    });
    await fetch(`${this.credentials.serverBaseUrl}/api/v1/agent/heartbeat`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ deviceId: this.capabilities.deviceId, status: this.capabilities.status, lastSeen: new Date().toISOString() }),
    });
  }

  private async downloadInput(job: AgentJob, token: string, dest: string): Promise<void> {
    const res = await fetch(
      `${this.credentials.serverBaseUrl}/api/v1/agent/jobs/${job.id}/input`,
      { headers: { Authorization: `Bearer ${token}`, "X-Agent-Input-Token": job.inputToken ?? "" }, redirect: "error" }
    );
    if (!res.ok || !res.body) throw new Error(`Download failed: ${res.status}`);
    const length = Number(res.headers.get("Content-Length") ?? job.inputSizeBytes);
    if (!Number.isFinite(length) || length > this.capabilities.limits.maxFileSizeBytes) {
      throw new Error("UPLOAD_TOO_LARGE");
    }
    const writer = createWriteStream(dest);
    await pipeline(res.body as unknown as NodeJS.ReadableStream, writer);
    if (statSync(dest).size !== length) throw new Error("INPUT_SIZE_MISMATCH");
  }

  private async acceptJob(jobId: string, token: string): Promise<void> {
    const res = await fetch(
      `${this.credentials.serverBaseUrl}/api/v1/agent/jobs/${jobId}/accept`,
      { method: "POST", headers: { Authorization: `Bearer ${token}` } }
    );
    if (!res.ok) throw new Error(`Accept failed: ${res.status}`);
  }

  private async rejectJob(jobId: string, token: string, reason: string): Promise<void> {
    await fetch(
      `${this.credentials.serverBaseUrl}/api/v1/agent/jobs/${jobId}/reject`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      }
    ).catch(() => {}); // best-effort
  }

  private async uploadResult(jobId: string, token: string, outputPath: string, mimeType: string, sha256: string): Promise<void> {
    const { createReadStream, statSync } = await import("node:fs");
    const size = statSync(outputPath).size;
    const res = await fetch(
      `${this.credentials.serverBaseUrl}/api/v1/agent/jobs/${jobId}/result`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": mimeType,
          "Content-Length": String(size),
          "X-Content-Sha256": sha256,
        },
        body: createReadStream(outputPath) as unknown as ReadableStream,
        redirect: "error",
        duplex: "half",
      } as RequestInit & { duplex: "half" }
    );
    if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
  }

  private async confirmJob(jobId: string, token: string, sha256: string, sizeBytes: number): Promise<void> {
    const res = await fetch(
      `${this.credentials.serverBaseUrl}/api/v1/agent/jobs/${jobId}/confirm`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ sha256, sizeBytes }),
      }
    );
    if (!res.ok) throw new Error(`Confirm failed: ${res.status}`);
  }

  private async failJob(jobId: string, token: string, error: string): Promise<void> {
    await fetch(
      `${this.credentials.serverBaseUrl}/api/v1/agent/jobs/${jobId}/fail`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ error }),
      }
    ).catch(() => {});
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function sha256File(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}
