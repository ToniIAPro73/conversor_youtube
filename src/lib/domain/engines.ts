// Engine interface contracts — all conversion engines implement ConversionEngine.

import type { UniversalFileDescriptor, FileCategory, LossProfile } from "./descriptors";

export type EngineId =
  | "ffmpeg-media"
  | "sharp-image"
  | "qpdf"
  | "sevenzip"
  | "data-ts"
  | "pandoc"
  | "libreoffice"
  | "calibre"
  | "tesseract"
  | "background-removal";

export type CapabilityState =
  | "available"
  | "unavailable-tool"
  | "unsupported-input"
  | "unsafe"
  | "experimental"
  | "disabled-license";

export type MobilePortability =
  | "portable-domain"
  | "replace-adapter-on-mobile"
  | "desktop-only";

export interface ConversionPreset {
  id: string;
  label: string;
  quality: string;
  description: string;
  isRecommended?: boolean;
}

export interface ConversionCapability {
  id: string;
  operation: string;
  outputFormat: string;
  outputMime: string;
  label: string;
  description: string;
  lossProfile: LossProfile;
  state: CapabilityState;
  unavailableReason?: string;
  recommended: boolean;
  presets: ConversionPreset[];
  warnings: string[];
  engineId: EngineId;
  mobilePortability: MobilePortability;
}

export interface EngineProbeResult {
  available: boolean;
  version: string | null;
  binaryPath: string | null;
  capabilities: string[];
  error?: string;
}

export interface StoredInput {
  id: string;
  localPath: string;
  descriptor: UniversalFileDescriptor;
}

export interface ConversionRequest {
  capabilityId: string;
  presetId: string | null;
  options: Record<string, unknown>;
  outputName: string;
}

export interface ConversionPlan {
  jobId: string;
  engineId: EngineId;
  operation: string;
  inputPath: string;
  outputPath: string;
  outputFormat: string;
  options: Record<string, unknown>;
  args: string[];
  env: Record<string, string>;
  timeoutMs: number;
  estimatedSizeBytes: number | null;
}

export interface ExecutionResult {
  success: boolean;
  outputPath: string;
  outputSizeBytes: number;
  durationMs: number;
  logs: string[];
  warnings: string[];
  error?: string;
}

export interface ArtifactValidation {
  valid: boolean;
  checks: { name: string; passed: boolean; detail?: string }[];
  error?: string;
}

// ── Engine interface ────────────────────────────────────────────────────────

export interface ConversionEngine {
  readonly id: EngineId;
  readonly supportedCategories: readonly FileCategory[];

  probe(): Promise<EngineProbeResult>;

  getCapabilities(
    descriptor: UniversalFileDescriptor,
    probeResult: EngineProbeResult
  ): ConversionCapability[];

  execute(
    plan: ConversionPlan,
    onProgress?: (progress: number, stage: string) => void
  ): Promise<ExecutionResult>;

  validate(
    outputPath: string,
    plan: ConversionPlan
  ): Promise<ArtifactValidation>;
}

// ── Engine registry entry ───────────────────────────────────────────────────

export interface EngineRegistration {
  engine: ConversionEngine;
  categories: FileCategory[];
  requiredTools: string[];
  enabled: boolean;
  disabledReason?: string;
  probeResult?: EngineProbeResult;
}
