import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  AncloraFileStudioClient,
  FileStudioError,
  FileStudioAuthError,
  FileStudioNotFoundError,
  FileStudioRateLimitError,
} from "../src/client.js";

const BASE_URL = "https://filestudio.anclora.internal";
const TOKEN = "test.jwt.token";

function makeClient(tokenProvider?: () => Promise<string>) {
  return new AncloraFileStudioClient({
    baseUrl: BASE_URL,
    clientId: "anclora-nexus",
    tokenProvider: tokenProvider ?? (() => Promise.resolve(TOKEN)),
    maxRetries: 0, // no retries in tests
  });
}

function mockFetch(status: number, body: unknown, headers: Record<string, string> = {}) {
  vi.stubGlobal("fetch", vi.fn().mockImplementation(() =>
    Promise.resolve(new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json", ...headers },
    }))
  ));
}

describe("AncloraFileStudioClient", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  describe("constructor", () => {
    it("exposes uploads and jobs resources", () => {
      const client = makeClient();
      expect(client.uploads).toBeDefined();
      expect(client.jobs).toBeDefined();
    });

    it("stores options", () => {
      const client = makeClient();
      expect(client.options.baseUrl).toBe(BASE_URL);
      expect(client.options.clientId).toBe("anclora-nexus");
    });
  });

  describe("jobs.get", () => {
    it("returns job record on 200", async () => {
      const jobPayload = {
        jobId: "job_01", status: "completed", operation: "document.docx-to-pdf",
        createdAt: "2026-06-16T10:00:00Z", updatedAt: "2026-06-16T10:01:00Z",
        links: { self: "/api/v1/jobs/job_01", events: "/api/v1/jobs/job_01/events" },
      };
      mockFetch(200, jobPayload);

      const client = makeClient();
      const job = await client.jobs.get("job_01");
      expect(job.jobId).toBe("job_01");
      expect(job.status).toBe("completed");
    });

    it("throws FileStudioNotFoundError on 404", async () => {
      mockFetch(404, { code: "JOB_NOT_FOUND", detail: "Job not found" });
      const client = makeClient();
      await expect(client.jobs.get("job_missing")).rejects.toThrow(FileStudioNotFoundError);
    });

    it("throws FileStudioAuthError on 401", async () => {
      mockFetch(401, { code: "AUTH_INVALID_TOKEN", detail: "Invalid token" });
      const client = makeClient();
      await expect(client.jobs.get("job_01")).rejects.toThrow(FileStudioAuthError);
    });

    it("throws FileStudioAuthError on 403", async () => {
      mockFetch(403, { code: "AUTH_INSUFFICIENT_SCOPE", detail: "Scope required" });
      const client = makeClient();
      await expect(client.jobs.get("job_01")).rejects.toThrow(FileStudioAuthError);
    });
  });

  describe("jobs.create", () => {
    it("sends idempotency key as header", async () => {
      const fetchSpy = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({
          jobId: "job_01", status: "queued", operation: "document.docx-to-pdf",
          createdAt: "2026-06-16T10:00:00Z", updatedAt: "2026-06-16T10:00:00Z",
          links: { self: "/api/v1/jobs/job_01", events: "/api/v1/jobs/job_01/events" },
        }), { status: 202, headers: { "Content-Type": "application/json" } })
      );
      vi.stubGlobal("fetch", fetchSpy);

      const client = makeClient();
      await client.jobs.create({
        operation: "document.docx-to-pdf",
        uploadId: "upl_01",
        idempotencyKey: "nexus-doc-123",
      });

      const call = fetchSpy.mock.calls[0] as [string, RequestInit];
      const headers = call[1].headers as Record<string, string>;
      expect(headers["Idempotency-Key"]).toBe("nexus-doc-123");
    });

    it("throws FileStudioError on 422", async () => {
      mockFetch(422, { code: "OPERATION_UNAVAILABLE", detail: "LibreOffice not installed" });
      const client = makeClient();
      await expect(client.jobs.create({ operation: "document.docx-to-pdf", uploadId: "upl_01" }))
        .rejects.toThrow(FileStudioError);
    });
  });

  describe("jobs.cancel", () => {
    it("returns ok:true on success", async () => {
      mockFetch(200, { ok: true, message: "Cancellation requested" });
      const client = makeClient();
      const result = await client.jobs.cancel("job_01");
      expect(result.ok).toBe(true);
    });
  });

  describe("jobs.waitForCompletion", () => {
    it("returns job when terminal status reached", async () => {
      const completedJob = {
        jobId: "job_01", status: "completed", operation: "document.docx-to-pdf",
        createdAt: "2026-06-16T10:00:00Z", updatedAt: "2026-06-16T10:01:00Z",
        links: { self: "/api/v1/jobs/job_01", events: "/api/v1/jobs/job_01/events" },
      };
      mockFetch(200, completedJob);
      const client = makeClient();
      const job = await client.jobs.waitForCompletion("job_01", { pollIntervalMs: 1 });
      expect(job.status).toBe("completed");
    });

    it("throws when job fails", async () => {
      const failedJob = {
        jobId: "job_01", status: "failed", operation: "document.docx-to-pdf",
        createdAt: "2026-06-16T10:00:00Z", updatedAt: "2026-06-16T10:01:00Z",
        links: { self: "/api/v1/jobs/job_01", events: "/api/v1/jobs/job_01/events" },
      };
      mockFetch(200, failedJob);
      const client = makeClient();
      await expect(client.jobs.waitForCompletion("job_01", { pollIntervalMs: 1 }))
        .rejects.toThrow("ended with status: failed");
    });

    it("throws when timeout exceeded", async () => {
      const processingJob = {
        jobId: "job_01", status: "processing", operation: "document.docx-to-pdf",
        createdAt: "2026-06-16T10:00:00Z", updatedAt: "2026-06-16T10:00:00Z",
        links: { self: "/api/v1/jobs/job_01", events: "/api/v1/jobs/job_01/events" },
      };
      mockFetch(200, processingJob);
      const client = makeClient();
      await expect(
        client.jobs.waitForCompletion("job_01", { timeoutMs: 50, pollIntervalMs: 10 })
      ).rejects.toThrow("did not complete within");
    });
  });

  describe("FileStudioRateLimitError", () => {
    it("includes retryAfterSeconds", async () => {
      mockFetch(429, { code: "RATE_LIMITED", detail: "Too many requests" }, { "Retry-After": "30" });
      const client = makeClient();
      try {
        await client.jobs.get("job_01");
        expect.fail("should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(FileStudioRateLimitError);
        expect((err as FileStudioRateLimitError).retryAfterSeconds).toBe(30);
      }
    });
  });

  describe("AbortSignal", () => {
    it("throws when signal is already aborted", async () => {
      const controller = new AbortController();
      controller.abort();

      // fetch should not even be called if signal is pre-aborted
      const fetchSpy = vi.fn().mockRejectedValue(Object.assign(new Error("aborted"), { name: "AbortError" }));
      vi.stubGlobal("fetch", fetchSpy);

      const client = makeClient();
      await expect(client.jobs.get("job_01", controller.signal)).rejects.toThrow();
    });
  });
});
