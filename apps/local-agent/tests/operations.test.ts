import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { LocalOperationRegistry } from "../src/operations.js";
import type { AgentJob } from "../src/types.js";

describe("LocalOperationRegistry", () => {
  it("executes a real JSON to YAML conversion and returns hash metadata", async () => {
    const dir = mkdtempSync(join(tmpdir(), "agent-op-"));
    const input = join(dir, "input.json");
    const output = join(dir, "output.yaml");
    writeFileSync(input, JSON.stringify({ hello: "world", count: 2 }));

    const job: AgentJob = {
      id: "job_json",
      operation: "data.json-to-yaml",
      inputSizeBytes: 27,
      inputFilename: "input.json",
      inputMimeType: "application/json",
      options: {},
      requestingOrg: "Test",
      requestingApp: "Vitest",
      retentionMinutes: 1,
      timeoutMs: 10_000,
    };

    const result = await new LocalOperationRegistry().execute(job, input, output, new AbortController().signal);
    expect(readFileSync(output, "utf8")).toContain("hello: world");
    expect(result.outputSizeBytes).toBeGreaterThan(0);
    expect(result.outputSha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it("does not advertise unavailable optional sharp operation when probe fails", async () => {
    const caps = await new LocalOperationRegistry([]).capabilities({
      deviceName: "x",
      platform: "linux",
      arch: "x64",
      version: "test",
      policy: "ask-always",
      approvedOperations: [],
      maxFileSizeBytes: 10,
      maxConcurrent: 1,
    }, "dev", "idle");
    expect(caps.operations).toEqual([]);
  });
});
