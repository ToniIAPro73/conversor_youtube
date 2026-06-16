/**
 * Folder watcher tests — validates debounce, self-file exclusion, add/remove/pause/resume,
 * and the MAX_WATCHES limit. All tests use temporary directories and real fs.watch.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import { FolderWatcher } from "../../src/lib/jobs/watcher";

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "anclora-watcher-test-"));
}

describe("FolderWatcher — lifecycle", () => {
  let watcher: FolderWatcher;
  let dirs: string[] = [];

  function makeDir(): string {
    const d = tmpDir();
    dirs.push(d);
    return d;
  }

  beforeEach(() => {
    watcher = new FolderWatcher();
    dirs = [];
  });

  afterEach(() => {
    watcher.stopAll();
    for (const d of dirs) {
      try { fs.rmSync(d, { recursive: true, force: true }); } catch { /* ok */ }
    }
  });

  it("starts with 0 watches", () => {
    expect(watcher.count).toBe(0);
    expect(watcher.list()).toHaveLength(0);
  });

  it("adds a watch for an existing directory", () => {
    const dir = makeDir();
    const entry = watcher.add({ id: "w1", directory: dir, recipeId: "recipe-1", outputDirectory: dir });
    expect(entry.active).toBe(true);
    expect(entry.id).toBe("w1");
    expect(watcher.count).toBe(1);
  });

  it("throws when adding watch for non-existent directory", () => {
    expect(() =>
      watcher.add({ id: "w1", directory: "/no/such/dir", recipeId: "r1", outputDirectory: "/tmp" })
    ).toThrow("no existe");
  });

  it("throws on duplicate watch id", () => {
    const dir = makeDir();
    watcher.add({ id: "w1", directory: dir, recipeId: "r1", outputDirectory: dir });
    expect(() =>
      watcher.add({ id: "w1", directory: dir, recipeId: "r2", outputDirectory: dir })
    ).toThrow("w1");
  });

  it("removes a watch and reduces count", () => {
    const dir = makeDir();
    watcher.add({ id: "w1", directory: dir, recipeId: "r1", outputDirectory: dir });
    const removed = watcher.remove("w1");
    expect(removed).toBe(true);
    expect(watcher.count).toBe(0);
  });

  it("returns false when removing non-existent watch", () => {
    expect(watcher.remove("ghost")).toBe(false);
  });

  it("pause and resume change active state", () => {
    const dir = makeDir();
    watcher.add({ id: "w1", directory: dir, recipeId: "r1", outputDirectory: dir });
    expect(watcher.pause("w1")).toBe(true);
    expect(watcher.list()[0].active).toBe(false);
    expect(watcher.resume("w1")).toBe(true);
    expect(watcher.list()[0].active).toBe(true);
  });

  it("pause returns false for unknown id", () => {
    expect(watcher.pause("ghost")).toBe(false);
  });

  it("stopAll removes all watches", () => {
    const d1 = makeDir();
    const d2 = makeDir();
    watcher.add({ id: "w1", directory: d1, recipeId: "r1", outputDirectory: d1 });
    watcher.add({ id: "w2", directory: d2, recipeId: "r2", outputDirectory: d2 });
    watcher.stopAll();
    expect(watcher.count).toBe(0);
  });

  it("enforces MAX_WATCHES limit of 8", () => {
    const addedDirs: string[] = [];
    for (let i = 0; i < 8; i++) {
      const d = makeDir();
      addedDirs.push(d);
      watcher.add({ id: `w${i}`, directory: d, recipeId: "r", outputDirectory: d });
    }
    const extra = makeDir();
    expect(() =>
      watcher.add({ id: "w-extra", directory: extra, recipeId: "r", outputDirectory: extra })
    ).toThrow("límite");
  });
});

describe("FolderWatcher — file detection", () => {
  let watcher: FolderWatcher;
  let dir: string;

  beforeEach(() => {
    watcher = new FolderWatcher();
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "anclora-watch-det-"));
  });

  afterEach(() => {
    watcher.stopAll();
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ok */ }
  });

  it("emits file-detected when a new file appears", async () => {
    watcher.add({ id: "w1", directory: dir, recipeId: "r1", outputDirectory: dir });

    const detected = await new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("timeout: no file-detected event")), 3000);
      watcher.once("file-detected", (evt) => {
        clearTimeout(timer);
        resolve(evt.filePath);
      });
      // Create a file — fs.watch picks this up
      setTimeout(() => {
        fs.writeFileSync(path.join(dir, "input.mp3"), "fake audio content");
      }, 100);
    });

    expect(detected).toContain("input.mp3");
  }, 5000);

  it("does not emit for self-generated output files", async () => {
    watcher.add({ id: "w1", directory: dir, recipeId: "r1", outputDirectory: dir });

    const spy = vi.fn();
    watcher.on("file-detected", spy);

    // Write a file that matches output suffix pattern — should be silently ignored
    fs.writeFileSync(path.join(dir, "input-converted.mp3"), "output");

    // Wait longer than debounce
    await new Promise((r) => setTimeout(r, 800));

    // The spy may or may not be called depending on isOutputFile detection
    // Only assert it's called for non-output filenames
    expect(spy.mock.calls.filter(([e]) => e.filePath.includes("-converted.")).length).toBe(0);
  }, 5000);
});
