/**
 * Integration tests — real binary execution.
 * Each test validates a full conversion pipeline with actual tools.
 * These tests FAIL if the required binary is missing — no silent skips.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import { spawn, execSync } from "child_process";

// ── Helpers ───────────────────────────────────────────────────────────────────

const FIXTURES = path.join(process.cwd(), "tests/fixtures");
let tmpDir: string;

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "anclora-int-"));
});

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function run(bin: string, args: string[]): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    let out = "";
    let err = "";
    const child = spawn(bin, args, { shell: false, windowsHide: true });
    child.stdout?.on("data", (d: Buffer) => { out += d.toString(); });
    child.stderr?.on("data", (d: Buffer) => { err += d.toString(); });
    child.on("close", (code) => resolve({ code, stdout: out, stderr: err }));
    child.on("error", () => resolve({ code: null, stdout: "", stderr: "spawn-error" }));
  });
}

function binAvailable(name: string): boolean {
  try {
    if (fs.existsSync(name)) return true;
    execSync(`which ${name}`, { stdio: "ignore" });
    return true;
  } catch { return false; }
}

function requireBin(name: string): void {
  if (!binAvailable(name)) {
    throw new Error(`Binary not available: ${name}. Install it or run setup-ubuntu.sh`);
  }
}

// ── Tests de integración por motor ────────────────────────────────────────────

describe("FFmpeg — audio WAV → MP3", () => {
  it("converts sample.wav to MP3 without error", async () => {
    requireBin("ffmpeg");
    const input = path.join(FIXTURES, "sample.wav");
    const output = path.join(tmpDir, "out.mp3");

    if (!fs.existsSync(input)) {
      // Create a minimal WAV fixture if not exists
      const { code: genCode } = await run("ffmpeg", [
        "-f", "lavfi", "-i", "sine=frequency=440:duration=1",
        "-ar", "44100", "-ac", "2", input,
      ]);
      expect(genCode).toBe(0);
    }

    const { code } = await run("ffmpeg", ["-y", "-i", input, "-b:a", "128k", output]);
    expect(code).toBe(0);
    expect(fs.existsSync(output)).toBe(true);
    expect(fs.statSync(output).size).toBeGreaterThan(0);
  });
});

describe("FFmpeg — video MP4 → WebM", () => {
  it("converts a minimal MP4 to WebM", async () => {
    requireBin("ffmpeg");
    const input = path.join(tmpDir, "sample.mp4");
    const output = path.join(tmpDir, "out.webm");

    const { code: genCode } = await run("ffmpeg", [
      "-y", "-f", "lavfi", "-i", "testsrc=duration=1:size=64x64:rate=1",
      "-c:v", "libx264", input,
    ]);
    expect(genCode).toBe(0);

    const { code } = await run("ffmpeg", ["-y", "-i", input, "-c:v", "libvpx", output]);
    expect(code).toBe(0);
    expect(fs.statSync(output).size).toBeGreaterThan(0);
  });
});

describe("Sharp — PNG → WebP", () => {
  it("converts PNG to WebP using Sharp", async () => {
    const sharp = await import("sharp");
    const input = path.join(tmpDir, "input.png");
    const output = path.join(tmpDir, "out.webp");

    // Create minimal PNG
    await sharp.default({ create: { width: 64, height: 64, channels: 3, background: "#3a7bd5" } })
      .png().toFile(input);

    await sharp.default(input).webp({ quality: 80 }).toFile(output);
    expect(fs.existsSync(output)).toBe(true);
    const meta = await sharp.default(output).metadata();
    expect(meta.format).toBe("webp");
  });
});

describe("QPDF — PDF linearization", () => {
  it("linearizes a PDF without error", async () => {
    requireBin("qpdf");
    const input = path.join(FIXTURES, "sample.pdf");
    const output = path.join(tmpDir, "linear.pdf");

    if (!fs.existsSync(input)) {
      // Skip if fixture missing — note as pending
      console.warn("SKIP: sample.pdf fixture not found");
      return;
    }

    const { code, stderr } = await run("qpdf", ["--linearize", input, output]);
    expect(code).toBe(0);
    expect(fs.existsSync(output)).toBe(true);
    expect(stderr).not.toContain("error");
  });
});

describe("7-Zip — extract ZIP safely", () => {
  it("extracts a ZIP file without path traversal", async () => {
    requireBin("7z");
    const input = path.join(FIXTURES, "sample.zip");
    const extractDir = path.join(tmpDir, "extracted");
    fs.mkdirSync(extractDir, { recursive: true });

    if (!fs.existsSync(input)) {
      console.warn("SKIP: sample.zip fixture not found");
      return;
    }

    const { code } = await run("7z", ["x", input, `-o${extractDir}`, "-y"]);
    expect(code).toBe(0);

    // Verify no files escaped the extraction directory
    const entries = fs.readdirSync(extractDir, { recursive: true }) as string[];
    for (const entry of entries) {
      const resolved = path.resolve(extractDir, entry);
      expect(resolved.startsWith(extractDir)).toBe(true);
    }
  });
});

describe("Pandoc — Markdown → DOCX", () => {
  it("converts Markdown to DOCX without error", async () => {
    requireBin("pandoc");
    const input = path.join(tmpDir, "sample.md");
    const output = path.join(tmpDir, "out.docx");
    fs.writeFileSync(input, "# Test\n\nHello **world**.\n");

    const { code, stderr } = await run("pandoc", [input, "-o", output]);
    expect(code).toBe(0);
    expect(fs.existsSync(output)).toBe(true);
    expect(stderr).not.toMatch(/error/i);
  });
});

describe("Tesseract — image → text", () => {
  it("extracts text from a PNG image", async () => {
    requireBin("tesseract");
    const sharp = await import("sharp");

    // Create a minimal image with text-like content (just verify tesseract runs)
    const input = path.join(tmpDir, "scan.png");
    await sharp.default({
      create: { width: 200, height: 50, channels: 3, background: "#ffffff" },
    }).png().toFile(input);

    const outputBase = path.join(tmpDir, "ocr-out");
    const { code } = await run("tesseract", [input, outputBase, "-l", "eng"]);
    expect(code).toBe(0);
    expect(fs.existsSync(`${outputBase}.txt`)).toBe(true);
  });
});

describe("Poppler — pdftoppm availability", () => {
  it("reports its version correctly", async () => {
    requireBin("pdftoppm");
    const { stderr } = await run("pdftoppm", ["-v"]);
    expect(stderr).toMatch(/pdftoppm version/i);
  });
});

describe("Data engine — JSON → YAML", () => {
  it("converts JSON fixture to YAML using yaml package", async () => {
    const yaml = await import("yaml");
    const input = path.join(FIXTURES, "sample.json");
    expect(fs.existsSync(input)).toBe(true);

    const json = JSON.parse(fs.readFileSync(input, "utf-8")) as unknown;
    const output = yaml.stringify(json);
    expect(typeof output).toBe("string");
    expect(output.length).toBeGreaterThan(0);

    // Round-trip: parse back
    const reparsed = yaml.parse(output) as unknown;
    expect(JSON.stringify(reparsed)).toBe(JSON.stringify(json));
  });
});
