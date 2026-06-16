import { describe, it, expect, vi } from "vitest";
import { ConsentEngine } from "../src/consent.js";
import type { ConsentUI } from "../src/consent.js";
import type { AgentConfig, AgentJob } from "../src/types.js";

function makeConfig(overrides: Partial<AgentConfig> = {}): AgentConfig {
  return {
    deviceName: "Test Device",
    platform: "linux",
    arch: "x64",
    version: "0.2.0",
    policy: "allow-approved-operations",
    approvedOperations: ["document.docx-to-pdf"],
    maxFileSizeBytes: 100 * 1024 * 1024,
    maxConcurrent: 1,
    ...overrides,
  };
}

function makeJob(overrides: Partial<AgentJob> = {}): AgentJob {
  return {
    id: "job_test",
    operation: "document.docx-to-pdf",
    inputToken: "tok_abc",
    inputSizeBytes: 1024,
    inputFilename: "test.docx",
    inputMimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    options: {},
    requestingOrg: "Test Org",
    requestingApp: "Test App",
    retentionMinutes: 60,
    timeoutMs: 30_000,
    ...overrides,
  };
}

function makeUI(approved = true): ConsentUI {
  return { prompt: vi.fn().mockResolvedValue(approved) };
}

describe("ConsentEngine", () => {
  describe("disabled policy", () => {
    it("rejects all jobs without consulting UI", async () => {
      const ui = makeUI(true);
      const engine = new ConsentEngine(makeConfig({ policy: "disabled" }), ui);
      const result = await engine.evaluate(makeJob());
      expect(result.approved).toBe(false);
      expect(result.reason).toContain("disabled");
      expect((ui.prompt as ReturnType<typeof vi.fn>).mock.calls.length).toBe(0);
    });
  });

  describe("allow-approved-operations policy", () => {
    it("auto-approves whitelisted operation without consulting UI", async () => {
      const ui = makeUI(false); // would deny if asked
      const engine = new ConsentEngine(makeConfig(), ui);
      const result = await engine.evaluate(makeJob({ operation: "document.docx-to-pdf" }));
      expect(result.approved).toBe(true);
      expect(result.reason).toContain("auto-approved");
      expect((ui.prompt as ReturnType<typeof vi.fn>).mock.calls.length).toBe(0);
    });

    it("falls through to UI for non-approved operations", async () => {
      const ui = makeUI(true);
      const engine = new ConsentEngine(makeConfig(), ui);
      const result = await engine.evaluate(makeJob({ operation: "image.png-to-webp" }));
      expect((ui.prompt as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1);
      expect(result.approved).toBe(true);
      expect(result.reason).toContain("user-approved");
    });

    it("respects UI rejection for non-approved operations", async () => {
      const ui = makeUI(false);
      const engine = new ConsentEngine(makeConfig(), ui);
      const result = await engine.evaluate(makeJob({ operation: "image.png-to-webp" }));
      expect(result.approved).toBe(false);
      expect(result.reason).toContain("user-rejected");
    });
  });

  describe("ask-always policy", () => {
    it("always consults UI even for whitelisted operations", async () => {
      const ui = makeUI(true);
      const engine = new ConsentEngine(makeConfig({ policy: "ask-always" }), ui);
      const result = await engine.evaluate(makeJob({ operation: "document.docx-to-pdf" }));
      expect((ui.prompt as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1);
      expect(result.approved).toBe(true);
    });

    it("ConsoleConsentUI auto-rejects in non-TTY daemon mode", async () => {
      // When no TTY, ConsoleConsentUI returns false
      const { ConsoleConsentUI } = await import("../src/consent.js");
      const ui = new ConsoleConsentUI();
      // process.stdin.isTTY is falsy in test environment
      const result = await ui.prompt(makeJob());
      expect(result).toBe(false);
    });
  });

  describe("file size gate", () => {
    it("rejects files exceeding maxFileSizeBytes before consulting UI", async () => {
      const ui = makeUI(true);
      const engine = new ConsentEngine(
        makeConfig({ maxFileSizeBytes: 10 * 1024 }),
        ui
      );
      const result = await engine.evaluate(makeJob({ inputSizeBytes: 20 * 1024 }));
      expect(result.approved).toBe(false);
      expect(result.reason).toContain("too large");
      expect((ui.prompt as ReturnType<typeof vi.fn>).mock.calls.length).toBe(0);
    });

    it("approves files exactly at size limit via whitelist", async () => {
      const ui = makeUI(false);
      const engine = new ConsentEngine(
        makeConfig({ maxFileSizeBytes: 10 * 1024 }),
        ui
      );
      const result = await engine.evaluate(makeJob({ inputSizeBytes: 10 * 1024 }));
      // File size check passes, and operation is whitelisted
      expect(result.approved).toBe(true);
    });
  });
});
