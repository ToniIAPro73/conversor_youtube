// Webhook delivery service tests — SSRF protection, HMAC signature, delivery
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  signWebhookPayload,
  verifyWebhookSignature,
  buildWebhookHeaders,
  deliverWebhook,
  SsrfError,
} from "../src/services/webhook-delivery.js";

// ── HMAC Signature ────────────────────────────────────────────────────────────

describe("signWebhookPayload", () => {
  it("returns a hex string", () => {
    const sig = signWebhookPayload("secret", 1_700_000_000, '{"hello":"world"}');
    expect(sig).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is deterministic for same inputs", () => {
    const a = signWebhookPayload("secret", 1_700_000_000, "body");
    const b = signWebhookPayload("secret", 1_700_000_000, "body");
    expect(a).toBe(b);
  });

  it("changes when body changes", () => {
    const a = signWebhookPayload("secret", 1_700_000_000, "body-a");
    const b = signWebhookPayload("secret", 1_700_000_000, "body-b");
    expect(a).not.toBe(b);
  });

  it("changes when timestamp changes", () => {
    const a = signWebhookPayload("secret", 1_700_000_000, "body");
    const b = signWebhookPayload("secret", 1_700_000_001, "body");
    expect(a).not.toBe(b);
  });
});

describe("verifyWebhookSignature", () => {
  it("accepts a freshly built signature", () => {
    const body = '{"event":"job.completed"}';
    const headers = buildWebhookHeaders("mysecret", body);
    expect(verifyWebhookSignature("mysecret", headers["X-Anclora-Signature"]!, body)).toBe(true);
  });

  it("rejects wrong secret", () => {
    const body = '{"event":"job.completed"}';
    const headers = buildWebhookHeaders("mysecret", body);
    expect(verifyWebhookSignature("wrongsecret", headers["X-Anclora-Signature"]!, body)).toBe(false);
  });

  it("rejects tampered body", () => {
    const body = '{"event":"job.completed"}';
    const headers = buildWebhookHeaders("mysecret", body);
    expect(verifyWebhookSignature("mysecret", headers["X-Anclora-Signature"]!, '{"tampered":true}')).toBe(false);
  });

  it("rejects expired timestamp (outside tolerance)", () => {
    const oldTimestamp = Math.floor(Date.now() / 1000) - 400;
    const body = "stale body";
    const sig = `t=${oldTimestamp},v1=${signWebhookPayload("secret", oldTimestamp, body)}`;
    expect(verifyWebhookSignature("secret", sig, body, 300)).toBe(false);
  });

  it("rejects malformed signature string", () => {
    expect(verifyWebhookSignature("secret", "notasig", "body")).toBe(false);
  });
});

describe("buildWebhookHeaders", () => {
  it("includes required headers", () => {
    const headers = buildWebhookHeaders("secret", "{}");
    expect(headers["Content-Type"]).toBe("application/json");
    expect(headers["X-Anclora-Signature"]).toMatch(/t=\d+,v1=[0-9a-f]{64}/);
    expect(headers["X-Anclora-Event-Id"]).toMatch(/^[0-9a-f]{32}$/);
  });

  it("generates unique event IDs on each call", () => {
    const a = buildWebhookHeaders("secret", "{}");
    const b = buildWebhookHeaders("secret", "{}");
    expect(a["X-Anclora-Event-Id"]).not.toBe(b["X-Anclora-Event-Id"]);
  });
});

// ── SSRF Protection via deliverWebhook ────────────────────────────────────────

describe("deliverWebhook SSRF protection", () => {
  it("rejects http:// URLs", async () => {
    const result = await deliverWebhook(
      "http://example.com/hook",
      "secret",
      { type: "job.completed", payload: {} }
    );
    expect(result.ok).toBe(false);
    expect(result.error).toContain("HTTPS");
  });

  it("rejects loopback addresses", async () => {
    const result = await deliverWebhook(
      "https://127.0.0.1/hook",
      "secret",
      { type: "job.completed", payload: {} }
    );
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/private|reserved/i);
  });

  it("rejects private class-A addresses", async () => {
    const result = await deliverWebhook(
      "https://10.0.0.1/hook",
      "secret",
      { type: "job.completed", payload: {} }
    );
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/private|reserved/i);
  });

  it("rejects private class-B addresses", async () => {
    const result = await deliverWebhook(
      "https://192.168.1.100/hook",
      "secret",
      { type: "job.completed", payload: {} }
    );
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/private|reserved/i);
  });

  it("rejects link-local addresses", async () => {
    const result = await deliverWebhook(
      "https://169.254.169.254/latest/meta-data",
      "secret",
      { type: "job.completed", payload: {} }
    );
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/private|reserved/i);
  });

  it("rejects invalid URL", async () => {
    const result = await deliverWebhook("not-a-url", "secret", { type: "test", payload: {} });
    expect(result.ok).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it("makes real fetch for valid external URL (with injected lookup + mock fetch)", async () => {
    const mockFetch = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", mockFetch);

    // Inject lookup that returns a public IP (no DNS I/O in tests)
    const mockLookup = vi.fn().mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);

    const result = await deliverWebhook(
      "https://example.com/hook",
      "secret",
      { type: "job.completed", payload: { jobId: "abc" } },
      mockLookup
    );

    expect(result.ok).toBe(true);
    expect(mockFetch).toHaveBeenCalledOnce();
    expect(mockLookup).toHaveBeenCalledWith("example.com", { all: true });

    // Verify HMAC headers were sent
    const [, reqInit] = mockFetch.mock.calls[0]! as [string, RequestInit];
    const sentHeaders = reqInit.headers as Record<string, string>;
    expect(sentHeaders["X-Anclora-Signature"]).toMatch(/t=\d+,v1=[0-9a-f]{64}/);

    // Verify redirect: "error" to block SSRF via redirect
    expect(reqInit.redirect).toBe("error");

    vi.restoreAllMocks();
  });
});
