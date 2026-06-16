import { createServer, type Server } from "node:http";
import { once } from "node:events";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { AgentJobPoller } from "../src/poll.js";
import { ConsentEngine } from "../src/consent.js";
import { LocalOperationRegistry } from "../src/operations.js";
import type { AgentCapabilities, AgentCredentials, AgentJob } from "../src/types.js";

describe("Local Agent smoke", () => {
  it("publishes capabilities, executes a real conversion, uploads result and confirms hash", async () => {
    const input = Buffer.from('{"hello":"world"}');
    const inputSha256 = sha256(input);
    const events: string[] = [];
    let uploaded: Buffer | undefined;
    let confirmed = false;

    const job: AgentJob = {
      id: "job_smoke",
      operation: "data.json-to-yaml",
      inputSha256,
      inputSizeBytes: input.byteLength,
      inputFilename: "input.json",
      inputMimeType: "application/json",
      options: {},
      requestingOrg: "Nexus",
      requestingApp: "Smoke",
      retentionMinutes: 1,
      timeoutMs: 10_000,
      inputToken: "input-token",
    };

    const server = createServer(async (req, res) => {
      const url = new URL(req.url ?? "/", "http://127.0.0.1");
      if (req.headers.authorization !== "Bearer test-token") {
        res.writeHead(401).end();
        return;
      }
      events.push(`${req.method} ${url.pathname}`);

      if (req.method === "POST" && url.pathname === "/api/v1/agent/capabilities") return json(res, { ok: true });
      if (req.method === "POST" && url.pathname === "/api/v1/agent/heartbeat") return json(res, { ok: true });
      if (req.method === "GET" && url.pathname === "/api/v1/agent/jobs/available") return json(res, job);
      if (req.method === "POST" && url.pathname === "/api/v1/agent/jobs/job_smoke/accept") return json(res, { leaseId: "lease_smoke" });
      if (req.method === "GET" && url.pathname === "/api/v1/agent/jobs/job_smoke/input") {
        if (req.headers["x-agent-input-token"] !== "input-token") {
          res.writeHead(403).end();
          return;
        }
        res.writeHead(200, {
          "Content-Type": "application/json",
          "Content-Length": String(input.byteLength),
          "X-Content-Sha256": inputSha256,
        });
        res.end(input);
        return;
      }
      if (req.method === "PUT" && url.pathname === "/api/v1/agent/jobs/job_smoke/result") {
        uploaded = await readBody(req);
        if (req.headers["x-content-sha256"] !== sha256(uploaded)) {
          res.writeHead(422).end();
          return;
        }
        return json(res, { ok: true });
      }
      if (req.method === "POST" && url.pathname === "/api/v1/agent/jobs/job_smoke/confirm") {
        const body = JSON.parse((await readBody(req)).toString("utf8")) as { sha256: string; sizeBytes: number };
        confirmed = uploaded !== undefined && body.sha256 === sha256(uploaded) && body.sizeBytes === uploaded.byteLength;
        return json(res, { ok: true });
      }
      res.writeHead(404).end();
    });

    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("No test server port");
    const baseUrl = `http://127.0.0.1:${address.port}`;

    const credentials: AgentCredentials = {
      deviceId: "dev_smoke",
      accessToken: "test-token",
      refreshToken: "local-agent-refresh-fixture",
      accessTokenExpiresAt: Date.now() + 600_000,
      refreshTokenExpiresAt: Date.now() + 86_400_000,
      serverBaseUrl: baseUrl,
    };
    const capabilities: AgentCapabilities = await new LocalOperationRegistry().capabilities({
      deviceName: "smoke",
      platform: "linux",
      arch: "x64",
      version: "test",
      policy: "allow-approved-operations",
      approvedOperations: ["data.json-to-yaml"],
      maxFileSizeBytes: 1024 * 1024,
      maxConcurrent: 1,
    }, credentials.deviceId, "idle");

    const poller = new AgentJobPoller(
      credentials,
      new ConsentEngine({
        deviceName: "smoke",
        platform: "linux",
        arch: "x64",
        version: "test",
        policy: "allow-approved-operations",
        approvedOperations: ["data.json-to-yaml"],
        maxFileSizeBytes: 1024 * 1024,
        maxConcurrent: 1,
      }, { prompt: async () => false }),
      capabilities,
      { getValidToken: async () => "test-token" },
      new LocalOperationRegistry(),
      () => {}
    );

    poller.start();
    await waitFor(() => confirmed);
    await poller.stop();
    await close(server);

    expect(uploaded?.toString("utf8")).toContain("hello: world");
    expect(events).toContain("POST /api/v1/agent/capabilities");
    expect(events).toContain("GET /api/v1/agent/jobs/available");
    expect(events).toContain("PUT /api/v1/agent/jobs/job_smoke/result");
    expect(confirmed).toBe(true);
  });
});

function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function json(res: import("node:http").ServerResponse, body: unknown): void {
  const bytes = Buffer.from(JSON.stringify(body));
  res.writeHead(200, { "Content-Type": "application/json", "Content-Length": String(bytes.byteLength) });
  res.end(bytes);
}

async function readBody(req: import("node:http").IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks);
}

async function waitFor(fn: () => boolean): Promise<void> {
  const deadline = Date.now() + 3_000;
  while (Date.now() < deadline) {
    if (fn()) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("Timed out waiting for smoke completion");
}

async function close(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => server.close((err) => err ? reject(err) : resolve()));
}
