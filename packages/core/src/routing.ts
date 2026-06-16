// Conversion routing policy — decides where to execute a conversion.
// Implementation lives in Nexus; interface lives in core for SDK/agent consumers.

export type RoutingTarget =
  | "local-desktop"
  | "local-agent"
  | "private-service"
  | "reject"
  | "require-human-approval";

export interface RoutingRequest {
  operation: string;
  fileSizeBytes: number;
  mimeType: string;
  classification: "public" | "internal" | "confidential" | "restricted";
  workspaceId: string;
  clientId: string;
  userConsent: boolean;
  availableRoutes: RoutingTarget[];
  metadata?: Record<string, unknown>;
}

export interface RoutingDecision {
  target: RoutingTarget;
  reason: string;
  deviceId?: string; // only for "local-agent"
  requiresApproval?: boolean;
}

export interface ConversionRoutingPolicy {
  decide(request: RoutingRequest): Promise<RoutingDecision>;
}
