// ArtifactStorage interface — implemented by LocalFilesystemStorage and SharedFilesystemStorage.
// Service also provides S3CompatibleStorage (same interface).

import type { Readable } from "node:stream";

export interface PutArtifactInput {
  stream: Readable;
  filename: string;
  mimeType: string;
  expectedSizeBytes?: number;
  expectedSha256?: string;
}

export interface StoredArtifact {
  key: string;
  sha256: string;
  sizeBytes: number;
  mimeType: string;
}

export interface ArtifactMetadata {
  key: string;
  sizeBytes: number;
  mimeType: string;
  sha256: string;
  createdAt: Date;
}

export interface ArtifactStorage {
  put(input: PutArtifactInput): Promise<StoredArtifact>;
  open(key: string): Promise<Readable>;
  stat(key: string): Promise<ArtifactMetadata>;
  exists(key: string): Promise<boolean>;
  delete(key: string): Promise<void>;
  createDownloadToken(key: string, ttlMs: number): Promise<string>;
  validateDownloadToken(token: string): Promise<string | null>; // returns key or null
}
