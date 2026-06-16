// Contract tests — Nexus calls the mock FileStudio Service and validates
// request/response shapes against the FIXTURES contract.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createMockFileStudioServer } from "../src/mock-server/index.js";
import { FIXTURES } from "../src/fixtures/index.js";
import type { MockServerState } from "../src/mock-server/index.js";

let serverUrl: string;
let closeServer: () => Promise<void>;
let state: MockServerState;

const AUTH_HEADER = { Authorization: "Bearer test-token" };

beforeAll(async () => {
  const mock = createMockFileStudioServer({ acceptedBearerToken: "test-token" });
  state = mock.state;
  const srv = await mock.start();
  serverUrl = srv.url;
  closeServer = srv.close;
});

afterAll(async () => {
  await closeServer();
});

describe("Mock FileStudio Service — contract tests", () => {
  describe("Health", () => {
    it("GET /api/v1/health returns ok", async () => {
      const res = await fetch(`${serverUrl}/api/v1/health`, { headers: AUTH_HEADER });
      expect(res.status).toBe(200);
      const body = await res.json() as { ok: boolean };
      expect(body.ok).toBe(true);
    });
  });

  describe("Authentication", () => {
    it("rejects requests without Bearer token", async () => {
      const res = await fetch(`${serverUrl}/api/v1/jobs`);
      expect(res.status).toBe(401);
      const body = await res.json() as { code: string };
      expect(body.code).toBe("AUTH_INVALID_TOKEN");
    });
  });

  describe("Uploads", () => {
    it("POST /api/v1/uploads creates upload and returns 201", async () => {
      const res = await fetch(`${serverUrl}/api/v1/uploads`, {
        method: "POST",
        headers: { ...AUTH_HEADER, "Content-Type": "application/json" },
        body: JSON.stringify(FIXTURES.upload.request),
      });
      expect(res.status).toBe(201);
      const body = await res.json() as { id: string; filename: string; status: string };
      expect(body.id).toMatch(/^upl_/);
      expect(body.filename).toBe(FIXTURES.upload.request.filename);
      expect(body.status).toBe("ready");
    });

    it("GET /api/v1/uploads/:id returns upload", async () => {
      // Create first
      const create = await fetch(`${serverUrl}/api/v1/uploads`, {
        method: "POST",
        headers: { ...AUTH_HEADER, "Content-Type": "application/json" },
        body: JSON.stringify(FIXTURES.upload.request),
      });
      const { id } = await create.json() as { id: string };

      const res = await fetch(`${serverUrl}/api/v1/uploads/${id}`, { headers: AUTH_HEADER });
      expect(res.status).toBe(200);
      const body = await res.json() as { id: string; status: string };
      expect(body.id).toBe(id);
    });

    it("GET /api/v1/uploads/:id returns 404 for unknown id", async () => {
      const res = await fetch(`${serverUrl}/api/v1/uploads/upl_ghost`, { headers: AUTH_HEADER });
      expect(res.status).toBe(404);
    });
  });

  describe("Jobs", () => {
    let uploadId: string;

    beforeAll(async () => {
      const res = await fetch(`${serverUrl}/api/v1/uploads`, {
        method: "POST",
        headers: { ...AUTH_HEADER, "Content-Type": "application/json" },
        body: JSON.stringify(FIXTURES.upload.request),
      });
      const body = await res.json() as { id: string };
      uploadId = body.id;
    });

    it("POST /api/v1/jobs creates job and returns 202", async () => {
      const body = {
        ...FIXTURES.jobCreate.request,
        input: { uploadId },
      };
      const res = await fetch(`${serverUrl}/api/v1/jobs`, {
        method: "POST",
        headers: { ...AUTH_HEADER, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      expect(res.status).toBe(202);
      const resp = await res.json() as { jobId: string; status: string; links: { self: string } };
      expect(resp.jobId).toMatch(/^job_/);
      expect(resp.status).toBe("created");
      expect(resp.links.self).toContain(resp.jobId);
    });

    it("POST /api/v1/jobs with Idempotency-Key returns same jobId on duplicate", async () => {
      const body = { operation: "document.docx-to-pdf", input: { uploadId }, options: {} };
      const headers = { ...AUTH_HEADER, "Content-Type": "application/json", "Idempotency-Key": "unique-key-42" };

      const res1 = await fetch(`${serverUrl}/api/v1/jobs`, { method: "POST", headers, body: JSON.stringify(body) });
      const job1 = await res1.json() as { jobId: string };

      const res2 = await fetch(`${serverUrl}/api/v1/jobs`, { method: "POST", headers, body: JSON.stringify(body) });
      const job2 = await res2.json() as { jobId: string };

      expect(job1.jobId).toBe(job2.jobId);
    });

    it("POST /api/v1/jobs with same Idempotency-Key and different body returns conflict", async () => {
      const headers = { ...AUTH_HEADER, "Content-Type": "application/json", "Idempotency-Key": "unique-key-conflict" };

      await fetch(`${serverUrl}/api/v1/jobs`, {
        method: "POST",
        headers,
        body: JSON.stringify({ operation: "document.docx-to-pdf", input: { uploadId }, options: {} }),
      });
      const res2 = await fetch(`${serverUrl}/api/v1/jobs`, {
        method: "POST",
        headers,
        body: JSON.stringify({ operation: "image.png-to-webp", input: { uploadId }, options: {} }),
      });

      expect(res2.status).toBe(409);
    });

    it("GET /api/v1/jobs/:id returns job status", async () => {
      const createRes = await fetch(`${serverUrl}/api/v1/jobs`, {
        method: "POST",
        headers: { ...AUTH_HEADER, "Content-Type": "application/json" },
        body: JSON.stringify({ operation: "image.png-to-webp", input: { uploadId }, options: {} }),
      });
      const { jobId } = await createRes.json() as { jobId: string };

      const res = await fetch(`${serverUrl}/api/v1/jobs/${jobId}`, { headers: AUTH_HEADER });
      expect(res.status).toBe(200);
      const body = await res.json() as { jobId: string; status: string };
      expect(body.jobId).toBe(jobId);
      expect(["created", "queued", "completed"]).toContain(body.status);
    });

    it("GET /api/v1/jobs/:id returns 404 for unknown job", async () => {
      const res = await fetch(`${serverUrl}/api/v1/jobs/job_ghost`, { headers: AUTH_HEADER });
      expect(res.status).toBe(404);
      const body = await res.json() as { code: string };
      expect(body.code).toBe("JOB_NOT_FOUND");
    });

    it("POST /api/v1/jobs/:id/cancel cancels a job", async () => {
      const createRes = await fetch(`${serverUrl}/api/v1/jobs`, {
        method: "POST",
        headers: { ...AUTH_HEADER, "Content-Type": "application/json" },
        body: JSON.stringify({ operation: "image.png-to-webp", input: { uploadId }, options: {} }),
      });
      const { jobId } = await createRes.json() as { jobId: string };
      const job = state.jobs.get(jobId)!;
      job.status = "queued"; // ensure it's cancellable

      const res = await fetch(`${serverUrl}/api/v1/jobs/${jobId}/cancel`, {
        method: "POST",
        headers: AUTH_HEADER,
      });
      expect(res.status).toBe(200);
      const body = await res.json() as { ok: boolean };
      expect(body.ok).toBe(true);
      expect(state.jobs.get(jobId)?.status).toBe("cancelled");
    });

    it("POST /api/v1/jobs/:id/result-token returns token for completed job", async () => {
      const createRes = await fetch(`${serverUrl}/api/v1/jobs`, {
        method: "POST",
        headers: { ...AUTH_HEADER, "Content-Type": "application/json" },
        body: JSON.stringify({ operation: "image.png-to-webp", input: { uploadId }, options: {} }),
      });
      const { jobId } = await createRes.json() as { jobId: string };
      // Force completed
      state.jobs.get(jobId)!.status = "completed";

      const res = await fetch(`${serverUrl}/api/v1/jobs/${jobId}/result-token`, {
        method: "POST",
        headers: AUTH_HEADER,
      });
      expect(res.status).toBe(201);
      const body = await res.json() as { token: string; expiresAt: string };
      expect(body.token).toMatch(/^tok_/);
      expect(new Date(body.expiresAt).getTime()).toBeGreaterThan(Date.now());
    });
  });

  describe("Error response shapes match Problem Details (RFC 7807)", () => {
    it("all error responses have type, title, status, code", async () => {
      const res = await fetch(`${serverUrl}/api/v1/jobs/nonexistent`, { headers: AUTH_HEADER });
      const body = await res.json() as Record<string, unknown>;
      expect(body).toHaveProperty("type");
      expect(body).toHaveProperty("title");
      expect(body).toHaveProperty("status");
      expect(body).toHaveProperty("code");
    });
  });
});
