// Shared types for the Local Agent

export type ConsentPolicy = "ask-always" | "allow-approved-operations" | "disabled";

export interface AgentCredentials {
  deviceId: string;
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: number; // Unix timestamp (ms)
  refreshTokenExpiresAt: number; // Unix timestamp (ms)
  serverBaseUrl: string;
  revoked?: boolean;
}

export interface AgentConfig {
  deviceName: string;
  platform: NodeJS.Platform;
  arch: string;
  version: string;
  policy: ConsentPolicy;
  approvedOperations: string[]; // used by allow-approved-operations
  maxFileSizeBytes: number;
  maxConcurrent: number;
}

export interface PairingRequest {
  requestId: string;
  code: string;      // 6-digit display code
  expiresAt: number; // Unix timestamp (ms)
  publicKey: string; // PEM — sent to server
}

export interface StoredAgentIdentity {
  credentials: AgentCredentials;
  privateKeyPem: string;
}

export interface AgentJob {
  id: string;
  operation: string;
  inputToken?: string;
  inputSha256?: string;
  inputSizeBytes: number;
  inputFilename: string;
  inputMimeType: string;
  outputMimeType?: string;
  options: Record<string, unknown>;
  requestingOrg: string;
  requestingApp: string;
  retentionMinutes: number;
  timeoutMs: number;
  leaseId?: string;
}

export interface AgentCapabilities {
  deviceId: string;
  platform: string;
  arch: string;
  version: string;
  operations: string[];
  engineVersions: Record<string, string>;
  limits: { maxFileSizeBytes: number; maxConcurrent: number };
  load: number;
  freeDiskBytes: number;
  status: "idle" | "busy" | "paused";
  lastSeen: string;
}
