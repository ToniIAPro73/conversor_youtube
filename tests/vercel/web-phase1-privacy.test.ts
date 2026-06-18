import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const webToolDirs = [
  "src/lib/browser-tools",
  "src/components/web-tools",
];

describe("Web Phase 1 privacy and bundle boundaries", () => {
  it("does not import Desktop-only modules from Web Phase 1 code", () => {
    const forbidden = [
      /from ["']better-sqlite3["']/,
      /from ["']node:fs["']/,
      /from ["']fs["']/,
      /from ["']node:child_process["']/,
      /from ["']child_process["']/,
      /from ["']@\/lib\/engines\//,
      /from ["']@\/lib\/infrastructure\/db\//,
      /from ["']@\/server\/desktop-routes/,
      /from ["']@\/src\/server\/desktop-routes/,
    ];
    const sources = webToolDirs.flatMap((dir) => walk(path.join(root, dir)));
    for (const file of sources) {
      const source = fs.readFileSync(file, "utf8");
      for (const token of forbidden) {
        expect(source, `${path.relative(root, file)} imports ${token}`).not.toMatch(token);
      }
    }
  });

  it("keeps heavy libraries behind dynamic imports", () => {
    const sources = webToolDirs.flatMap((dir) => walk(path.join(root, dir)));
    for (const file of sources) {
      const source = fs.readFileSync(file, "utf8");
      expect(source, `${path.relative(root, file)} has static pdf-lib import`).not.toMatch(/from ["']pdf-lib["']/);
      expect(source, `${path.relative(root, file)} has static exifr import`).not.toMatch(/from ["']exifr["']/);
      expect(source, `${path.relative(root, file)} has static fflate import`).not.toMatch(/from ["']fflate["']/);
    }
  });

  it("does not call network upload APIs from browser tool code", () => {
    const sources = webToolDirs.flatMap((dir) => walk(path.join(root, dir)));
    for (const file of sources) {
      const source = fs.readFileSync(file, "utf8");
      expect(source, `${path.relative(root, file)} calls fetch`).not.toMatch(/\bfetch\s*\(/);
      expect(source, `${path.relative(root, file)} references XMLHttpRequest`).not.toContain("XMLHttpRequest");
      expect(source, `${path.relative(root, file)} references sendBeacon`).not.toContain("sendBeacon");
      expect(source, `${path.relative(root, file)} references WebSocket`).not.toContain("WebSocket");
    }
  });
});

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const abs = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(abs) : [abs];
  });
}
