import path from "path";
import fs from "fs";
import { CONFIG } from "../config";

/**
 * Validates that targetPath is strictly inside allowedRoot.
 * Uses path.resolve + path.relative to prevent traversal; does NOT rely on startsWith alone.
 * Returns the resolved absolute path on success.
 * Throws on traversal attempt.
 */
export function ensurePathSafety(targetPath: string, allowedRoot?: string): string {
  const root = allowedRoot ?? getDefaultTempDir();
  const resolvedTarget = path.resolve(targetPath);
  const resolvedRoot = path.resolve(root);

  const relative = path.relative(resolvedRoot, resolvedTarget);

  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(
      `Security: path traversal attempt — "${resolvedTarget}" is outside allowed root "${resolvedRoot}"`
    );
  }

  return resolvedTarget;
}

/**
 * Resolves and validates a relative path against the allowed root.
 * Use this when you receive a stored relative path from the database.
 */
export function resolveArtifactPath(relativePath: string, allowedRoot?: string): string {
  const root = allowedRoot ?? getDefaultTempDir();
  const resolvedRoot = path.resolve(root);
  const candidate = path.resolve(resolvedRoot, relativePath);
  return ensurePathSafety(candidate, resolvedRoot);
}

/**
 * Safe check whether a path exists inside the allowed root.
 * Never throws; returns false if the path is invalid or outside root.
 */
export function safeExistsInRoot(targetPath: string, allowedRoot?: string): boolean {
  try {
    const resolved = ensurePathSafety(targetPath, allowedRoot);
    return fs.existsSync(resolved);
  } catch {
    return false;
  }
}

function getDefaultTempDir(): string {
  return CONFIG.media.tempDir;
}
