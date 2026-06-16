import { describe, it, expect } from "vitest";
import { NexusRoutingPolicy } from "../src/routing-policy.js";
import type { RoutingRequest } from "@anclora/filestudio-core";

const policy = new NexusRoutingPolicy();

function req(overrides: Partial<RoutingRequest> = {}): RoutingRequest {
  return {
    operation: "document.docx-to-pdf",
    fileSizeBytes: 1024 * 1024, // 1 MB
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    classification: "internal",
    workspaceId: "ws_test",
    clientId: "anclora-nexus",
    userConsent: true,
    availableRoutes: ["private-service", "local-agent", "local-desktop", "require-human-approval"],
    ...overrides,
  };
}

describe("NexusRoutingPolicy", () => {
  describe("consent", () => {
    it("rejects when user consent not granted", async () => {
      const d = await policy.decide(req({ userConsent: false }));
      expect(d.target).toBe("reject");
      expect(d.reason).toContain("consent");
    });
  });

  describe("restricted data", () => {
    it("routes to require-human-approval when route available", async () => {
      const d = await policy.decide(req({ classification: "restricted" }));
      expect(d.target).toBe("require-human-approval");
      expect(d.requiresApproval).toBe(true);
    });

    it("rejects when approval route not available", async () => {
      const d = await policy.decide(req({
        classification: "restricted",
        availableRoutes: ["private-service"],
      }));
      expect(d.target).toBe("reject");
      expect(d.reason).toContain("approval");
    });
  });

  describe("confidential data", () => {
    it("prefers local-desktop for confidential data", async () => {
      const d = await policy.decide(req({ classification: "confidential" }));
      expect(d.target).toBe("local-desktop");
    });

    it("falls back to local-agent when no local-desktop", async () => {
      const d = await policy.decide(req({
        classification: "confidential",
        availableRoutes: ["local-agent", "private-service"],
      }));
      expect(d.target).toBe("local-agent");
    });

    it("rejects confidential data when only private-service is available by default", async () => {
      const d = await policy.decide(req({
        classification: "confidential",
        availableRoutes: ["private-service"],
      }));
      expect(d.target).toBe("reject");
    });

    it("uses private-service for confidential data only with explicit policy", async () => {
      const explicitPolicy = new NexusRoutingPolicy({
        largeFileThresholdBytes: 50 * 1024 * 1024,
        allowConfidentialPrivateService: true,
        allowedResidencies: ["EU"],
        requireConsentForRestricted: true,
      });
      const d = await explicitPolicy.decide(req({
        classification: "confidential",
        availableRoutes: ["private-service"],
        metadata: { residency: "EU" },
      }));
      expect(d.target).toBe("private-service");
    });

    it("rejects confidential when no suitable route", async () => {
      const d = await policy.decide(req({
        classification: "confidential",
        availableRoutes: ["require-human-approval"],
      }));
      expect(d.target).toBe("reject");
    });
  });

  describe("large files", () => {
    const LARGE = 60 * 1024 * 1024; // 60 MB

    it("routes large files to local-agent to avoid upload cost", async () => {
      const d = await policy.decide(req({
        fileSizeBytes: LARGE,
        availableRoutes: ["local-agent", "private-service"],
      }));
      expect(d.target).toBe("local-agent");
      expect(d.reason).toContain("large file");
    });

    it("falls back to private-service when no local-agent for large files", async () => {
      const d = await policy.decide(req({
        fileSizeBytes: LARGE,
        availableRoutes: ["private-service"],
      }));
      expect(d.target).toBe("private-service");
    });
  });

  describe("internal/public data", () => {
    it("defaults to private-service for internal data", async () => {
      const d = await policy.decide(req({ classification: "internal" }));
      expect(d.target).toBe("private-service");
    });

    it("defaults to private-service for public data", async () => {
      const d = await policy.decide(req({ classification: "public" }));
      expect(d.target).toBe("private-service");
    });

    it("falls back to local-desktop when no service", async () => {
      const d = await policy.decide(req({
        classification: "internal",
        availableRoutes: ["local-desktop"],
      }));
      expect(d.target).toBe("local-desktop");
    });

    it("falls back to local-agent when no service or desktop", async () => {
      const d = await policy.decide(req({
        classification: "internal",
        availableRoutes: ["local-agent"],
      }));
      expect(d.target).toBe("local-agent");
    });

    it("rejects when no routes available", async () => {
      const d = await policy.decide(req({ availableRoutes: [] }));
      expect(d.target).toBe("reject");
    });
  });

  describe("metadata passthrough", () => {
    it("passes preferredDeviceId to local-agent decisions", async () => {
      const d = await policy.decide(req({
        classification: "confidential",
        availableRoutes: ["local-agent"],
        metadata: { preferredDeviceId: "dev_abc123" },
      }));
      expect(d.target).toBe("local-agent");
      expect(d.deviceId).toBe("dev_abc123");
    });

    it("rejects unavailable data residency", async () => {
      const d = await policy.decide(req({ metadata: { residency: "US" } }));
      expect(d.target).toBe("reject");
      expect(d.reason).toContain("residency");
    });
  });
});
