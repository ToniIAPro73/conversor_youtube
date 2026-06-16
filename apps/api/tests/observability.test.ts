import { describe, expect, it } from "vitest";
import { METRIC_NAMES, MetricsRegistry, structuredLog } from "../src/observability.js";

describe("observability", () => {
  it("exposes the required metric names", () => {
    expect(METRIC_NAMES).toContain("jobs_created_total");
    expect(METRIC_NAMES).toContain("local_agent_pairing_failures_total");
    const rendered = new MetricsRegistry().renderPrometheus();
    expect(rendered).toContain("worker_heartbeats");
  });

  it("redacts sensitive log material and pseudonymizes ids", () => {
    const line = structuredLog({
      level: "info",
      service: "api",
      version: "test",
      environment: "test",
      clientId: "client-real-name",
      deviceId: "device-real-name",
      message: "Authorization Bearer fixture token=fixture-value https://signed.example/path?token=abc",
    });
    expect(line).not.toContain("client-real-name");
    expect(line).not.toContain("device-real-name");
    expect(line).not.toContain("fixture-value");
    expect(line).not.toContain("signed.example");
    expect(line).toContain("[REDACTED]");
  });
});
