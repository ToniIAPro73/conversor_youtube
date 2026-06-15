// Unified Analysis Result — replaces the dual (local-file / universal-file) model
// with a clean discriminated union that covers all three input kinds.

import type { FileCategory, FileAttributes } from "./descriptors";
import type { MediaDescriptor } from "../media/probe";
import type { EngineId, MobilePortability } from "./engines";

// ── Discriminants ─────────────────────────────────────────────────────────────

export type AnalysisKind = "remote-url" | "local-media" | "universal-file";

// ── Remote URL Analysis (YouTube, etc.) ────────────────────────────────────────

export interface RemoteUrlAnalysis {
  kind: "remote-url";
  inputId: string;
  originalName: string;
  storedRelativePath: null;
  sizeBytes: number | null;
  descriptor: MediaDescriptor;
  category: FileCategory;
  detectedFormat: string | null;
  confidence: "high" | "medium" | "low";
  warnings: AnalysisWarning[];
  /** Provider-specific metadata */
  provider: string;
  normalizedUrl: string;
  title: string | null;
  channel: string | null;
  thumbnailUrl: string | null;
}

// ── Local Media Analysis (ffprobe path) ───────────────────────────────────────

export interface LocalMediaAnalysis {
  kind: "local-media";
  inputId: string;
  originalName: string;
  storedRelativePath: string;
  sizeBytes: number;
  descriptor: MediaDescriptor;
  category: FileCategory;
  detectedFormat: string | null;
  confidence: "high" | "medium" | "low";
  warnings: AnalysisWarning[];
}

// ── Universal File Analysis (file-detector path) ──────────────────────────────

export interface UniversalFileAnalysis {
  kind: "universal-file";
  inputId: string;
  originalName: string;
  storedRelativePath: string;
  sizeBytes: number;
  descriptor: FileAttributes;
  category: FileCategory;
  detectedFormat: string | null;
  confidence: "high" | "medium" | "low";
  warnings: AnalysisWarning[];
  detectedMimeType: string | null;
  sha256: string | null;
}

// ── Discriminated Union ───────────────────────────────────────────────────────

export type AnalysisResult =
  | RemoteUrlAnalysis
  | LocalMediaAnalysis
  | UniversalFileAnalysis;

// ── Analysis Warning ──────────────────────────────────────────────────────────

export interface AnalysisWarning {
  code: string;
  message: string;
  severity: "info" | "warning" | "danger";
}

// ── Capability Info (normalized across legacy & universal) ─────────────────────

export type CapabilityLossProfile =
  | "lossless"
  | "metadata-risk"
  | "layout-risk"
  | "lossy"
  | "experimental";

export type CapabilityState =
  | "available"
  | "unavailable-tool"
  | "unsupported";

export interface CapabilityInfo {
  /** Unique capability identifier */
  id: string;
  /** Output format extension (e.g., "mp3", "pdf") */
  outputFormat: string;
  /** Human-readable output label (e.g., "MP3 Audio") */
  outputLabel: string;
  /** Current availability state */
  state: CapabilityState;
  /** Loss profile of this conversion path */
  lossProfile: CapabilityLossProfile;
  /** Engine that handles this conversion */
  engineId: EngineId;
  /** Mobile portability classification */
  mobilePortability: MobilePortability;
  /** Warnings specific to this capability */
  warnings: string[];
}

// ── Type guards ───────────────────────────────────────────────────────────────

export function isRemoteUrlAnalysis(result: AnalysisResult): result is RemoteUrlAnalysis {
  return result.kind === "remote-url";
}

export function isLocalMediaAnalysis(result: AnalysisResult): result is LocalMediaAnalysis {
  return result.kind === "local-media";
}

export function isUniversalFileAnalysis(result: AnalysisResult): result is UniversalFileAnalysis {
  return result.kind === "universal-file";
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Derive confidence from detection signals */
export function deriveConfidence(
  detectedByMagic: boolean,
  extensionMatch: boolean,
  mismatchDetected: boolean
): "high" | "medium" | "low" {
  if (detectedByMagic && extensionMatch && !mismatchDetected) return "high";
  if (detectedByMagic || extensionMatch) return "medium";
  return "low";
}

/** Convert legacy engine ConversionCapability to normalized CapabilityInfo */
export function normalizeCapabilityInfo(
  cap: {
    id: string;
    outputFormat: string;
    label?: string;
    outputLabel?: string;
    state?: CapabilityState;
    lossProfile?: CapabilityLossProfile;
    engineId: EngineId;
    mobilePortability: MobilePortability;
    warnings: string[];
    unavailableReason?: string;
  }
): CapabilityInfo {
  // Map legacy state values to unified state
  let normalizedState: CapabilityState = "available";
  if (cap.state) {
    normalizedState = cap.state;
  } else if (cap.unavailableReason) {
    normalizedState = "unavailable-tool";
  }

  // Map legacy loss profiles to unified loss profiles
  let normalizedLoss: CapabilityLossProfile = "lossy";
  if (cap.lossProfile) {
    normalizedLoss = cap.lossProfile;
  }

  return {
    id: cap.id,
    outputFormat: cap.outputFormat,
    outputLabel: cap.outputLabel ?? cap.label ?? cap.outputFormat.toUpperCase(),
    state: normalizedState,
    lossProfile: normalizedLoss,
    engineId: cap.engineId,
    mobilePortability: cap.mobilePortability,
    warnings: cap.warnings ?? [],
  };
}
