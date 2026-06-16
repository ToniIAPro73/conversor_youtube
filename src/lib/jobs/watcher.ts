/**
 * Folder watcher — triggers recipe execution when files are added to a watched directory.
 *
 * Design rules:
 * - Uses fs.watch (Node built-in, no polling) — no infinite loops
 * - Self-generated output files are excluded to prevent re-trigger cycles
 * - Maximum 8 watched directories at once
 * - Each watch entry has its own debounce timer (500ms default) per file path
 * - Graceful stop() cleans all watchers and debounce timers
 */

import fs from "fs";
import path from "path";
import { EventEmitter } from "events";
import type { RecipeDefinition } from "../domain/operations";

export interface WatchEntry {
  id: string;
  directory: string;
  recipeId: string;
  outputDirectory: string;
  active: boolean;
  createdAt: string;
}

export interface FileEvent {
  watchId: string;
  filePath: string;
  recipeId: string;
  detectedAt: string;
}

const MAX_WATCHES = 8;
const DEBOUNCE_MS = 500;

// File suffixes added by recipe outputs — used to exclude self-generated files
const OUTPUT_SUFFIX_PATTERNS = ["-converted.", "_out.", "_result."];

function isOutputFile(filename: string): boolean {
  return OUTPUT_SUFFIX_PATTERNS.some((suffix) => filename.includes(suffix));
}

function isEligibleFile(filename: string, inputFilter: RecipeDefinition["inputFilter"]): boolean {
  if (isOutputFile(filename)) return false;

  const ext = path.extname(filename).replace(".", "").toLowerCase();
  if (!ext) return false;

  if (inputFilter.formats && inputFilter.formats.length > 0) {
    if (!inputFilter.formats.includes(ext)) return false;
  }

  return true;
}

export class FolderWatcher extends EventEmitter {
  private entries: Map<string, WatchEntry> = new Map();
  private watchers: Map<string, fs.FSWatcher> = new Map();
  private debounceTimers: Map<string, NodeJS.Timeout> = new Map();

  /** Current watch count */
  get count(): number {
    return this.entries.size;
  }

  /** All watch entries */
  list(): WatchEntry[] {
    return Array.from(this.entries.values());
  }

  /**
   * Add a folder watch.
   * Emits 'file-detected' (FileEvent) when an eligible file appears.
   * Emits 'error' if the directory does not exist or the limit is reached.
   */
  add(entry: Omit<WatchEntry, "active" | "createdAt">): WatchEntry {
    if (this.entries.size >= MAX_WATCHES) {
      throw new Error(`Se ha alcanzado el límite de ${MAX_WATCHES} carpetas vigiladas`);
    }
    if (this.entries.has(entry.id)) {
      throw new Error(`Ya existe un vigilante con id '${entry.id}'`);
    }
    if (!fs.existsSync(entry.directory)) {
      throw new Error(`La carpeta '${entry.directory}' no existe`);
    }

    const watchEntry: WatchEntry = { ...entry, active: true, createdAt: new Date().toISOString() };
    this.entries.set(entry.id, watchEntry);

    const watcher = fs.watch(entry.directory, { persistent: false }, (event, filename) => {
      if (!filename || event !== "rename") return;
      const filePath = path.join(entry.directory, filename);

      // Debounce per file path to avoid duplicate events on rapid writes
      const key = `${entry.id}:${filePath}`;
      if (this.debounceTimers.has(key)) return;

      const timer = setTimeout(() => {
        this.debounceTimers.delete(key);

        // Must exist and be a file (not directory), not be a temp file
        if (!fs.existsSync(filePath)) return;
        const stat = fs.statSync(filePath);
        if (!stat.isFile()) return;

        // Apply recipe input filter
        const watchEntryNow = this.entries.get(entry.id);
        if (!watchEntryNow?.active) return;

        // We don't have the recipe object here; the caller handles filtering
        if (!isEligibleFile(filename, {})) return;

        const fileEvent: FileEvent = {
          watchId: entry.id,
          filePath,
          recipeId: entry.recipeId,
          detectedAt: new Date().toISOString(),
        };
        this.emit("file-detected", fileEvent);
      }, DEBOUNCE_MS);

      this.debounceTimers.set(key, timer);
    });

    watcher.on("error", (err) => this.emit("error", { watchId: entry.id, error: err }));
    this.watchers.set(entry.id, watcher);

    return watchEntry;
  }

  /** Pause a watch without removing it */
  pause(id: string): boolean {
    const entry = this.entries.get(id);
    if (!entry) return false;
    entry.active = false;
    return true;
  }

  /** Resume a paused watch */
  resume(id: string): boolean {
    const entry = this.entries.get(id);
    if (!entry) return false;
    entry.active = true;
    return true;
  }

  /** Remove and stop a watch */
  remove(id: string): boolean {
    const watcher = this.watchers.get(id);
    if (!watcher) return false;

    watcher.close();
    this.watchers.delete(id);
    this.entries.delete(id);

    // Clear pending debounce timers for this watch
    for (const key of this.debounceTimers.keys()) {
      if (key.startsWith(`${id}:`)) {
        clearTimeout(this.debounceTimers.get(key)!);
        this.debounceTimers.delete(key);
      }
    }

    return true;
  }

  /** Stop all watchers and clean up */
  stopAll(): void {
    for (const id of this.watchers.keys()) {
      this.remove(id);
    }
  }
}

export const folderWatcher = new FolderWatcher();
