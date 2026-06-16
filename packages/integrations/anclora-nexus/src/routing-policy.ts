// ConversionRoutingPolicy implementation for Nexus.
// Decides where to execute a conversion based on data classification,
// file size, available routes, and user consent.

import type {
  ConversionRoutingPolicy,
  RoutingRequest,
  RoutingDecision,
} from "@anclora/filestudio-core";

export interface NexusRoutingPolicyConfig {
  largeFileThresholdBytes: number;
  allowConfidentialPrivateService: boolean;
  allowedResidencies: string[];
  requireConsentForRestricted: boolean;
}

const DEFAULT_CONFIG: NexusRoutingPolicyConfig = {
  largeFileThresholdBytes: 50 * 1024 * 1024,
  allowConfidentialPrivateService: false,
  allowedResidencies: ["EU", "ES"],
  requireConsentForRestricted: true,
};

export class NexusRoutingPolicy implements ConversionRoutingPolicy {
  constructor(private readonly config: NexusRoutingPolicyConfig = DEFAULT_CONFIG) {}

  async decide(req: RoutingRequest): Promise<RoutingDecision> {
    const { classification, fileSizeBytes, userConsent, availableRoutes } = req;
    const requestedResidency = req.metadata?.residency as string | undefined;

    if (requestedResidency && !this.config.allowedResidencies.includes(requestedResidency)) {
      return { target: "reject", reason: `data residency ${requestedResidency} is not allowed` };
    }

    // 1. Consent is always required — no silent processing
    if (!userConsent) {
      return { target: "reject", reason: "user consent not granted" };
    }

    // 2. Restricted data → require human approval before routing anywhere
    if (classification === "restricted") {
      if (!availableRoutes.includes("require-human-approval")) {
        return { target: "reject", reason: "restricted data requires approval but route unavailable" };
      }
      return { target: "require-human-approval", reason: "restricted classification requires explicit approval", requiresApproval: true };
    }

    // 3. Confidential → prefer local to avoid data leaving the network
    if (classification === "confidential") {
      if (availableRoutes.includes("local-desktop")) {
        return { target: "local-desktop", reason: "confidential data stays on local desktop" };
      }
      if (availableRoutes.includes("local-agent")) {
        return { target: "local-agent", reason: "confidential data routed to authorized local agent", deviceId: req.metadata?.preferredDeviceId as string | undefined };
      }
      if (availableRoutes.includes("private-service") && this.config.allowConfidentialPrivateService) {
        return { target: "private-service", reason: "confidential data explicitly allowed on private VPS service" };
      }
      return { target: "reject", reason: "no suitable route for confidential data" };
    }

    // 4. Large files → prefer local agent (avoids upload bandwidth cost)
    if (fileSizeBytes > this.config.largeFileThresholdBytes) {
      const preferred = req.metadata?.preferredDeviceId as string | undefined;
      if (availableRoutes.includes("local-agent")) {
        return { target: "local-agent", reason: `large file (${formatMB(fileSizeBytes)}) routed to local agent`, deviceId: preferred };
      }
    }

    // 5. Internal/public data → prefer private-service (fastest, scalable)
    if (availableRoutes.includes("private-service")) {
      return { target: "private-service", reason: "default route for internal/public data" };
    }

    // 6. Fallback to local
    if (availableRoutes.includes("local-desktop")) {
      return { target: "local-desktop", reason: "fallback to local desktop (no service available)" };
    }
    if (availableRoutes.includes("local-agent")) {
      return { target: "local-agent", reason: "fallback to local agent", deviceId: req.metadata?.preferredDeviceId as string | undefined };
    }

    return { target: "reject", reason: "no available routes" };
  }
}

function formatMB(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
