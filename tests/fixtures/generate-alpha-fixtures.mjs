/**
 * Generate PNG test fixtures for background removal and alpha channel tests.
 * Run: node tests/fixtures/generate-alpha-fixtures.mjs
 *
 * Produces:
 *   tests/fixtures/white-bg-logo.png       — 64×64 logo on white background
 *   tests/fixtures/black-bg-logo.png       — 64×64 logo on black background
 *   tests/fixtures/checker-8.png           — 64×64 checkerboard (8px squares)
 *   tests/fixtures/checker-16.png          — 64×64 checkerboard (16px squares)
 *   tests/fixtures/solid-red-bg.png        — 64×64 logo on solid red background
 *   tests/fixtures/logo-with-holes.png     — 64×64 logo with interior transparent holes
 *   tests/fixtures/shadow-logo.png         — 64×64 logo with soft shadow on white
 *   tests/fixtures/already-transparent.png — 64×64 PNG with real alpha channel
 */

import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

const __dirname = dirname(fileURLToPath(import.meta.url));

function crc32(buf) {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c;
  }
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const t = Buffer.from(type, "ascii");
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crcBuf]);
}

const PNG_SIG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

/**
 * Build PNG from a Uint8Array of RGBA pixels (width×height×4).
 * colorType: 2=RGB, 6=RGBA
 */
function buildPng(pixels, width, height, hasAlpha = true) {
  const channels = hasAlpha ? 4 : 3;
  const colorType = hasAlpha ? 6 : 2;

  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8;         // bit depth
  ihdrData[9] = colorType;
  // bytes 10-12: compression, filter, interlace = 0

  // Build raw scanlines: filter byte (0) + row data
  const rowSize = 1 + width * channels;
  const raw = Buffer.alloc(height * rowSize);
  for (let y = 0; y < height; y++) {
    raw[y * rowSize] = 0; // filter: None
    for (let x = 0; x < width; x++) {
      const src = (y * width + x) * 4;
      const dst = y * rowSize + 1 + x * channels;
      raw[dst] = pixels[src];
      raw[dst + 1] = pixels[src + 1];
      raw[dst + 2] = pixels[src + 2];
      if (hasAlpha) raw[dst + 3] = pixels[src + 3];
    }
  }

  return Buffer.concat([
    PNG_SIG,
    chunk("IHDR", ihdrData),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function rgba(r, g, b, a = 255) { return { r, g, b, a }; }

function fill(width, height, fillFn) {
  const px = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const c = fillFn(x, y);
      const i = (y * width + x) * 4;
      px[i] = c.r; px[i + 1] = c.g; px[i + 2] = c.b; px[i + 3] = c.a;
    }
  }
  return px;
}

const W = 64, H = 64;

// ── white-bg-logo.png ─────────────────────────────────────────────────────────
// 64×64 white background with a 20×20 teal square "logo" centered
{
  const pixels = fill(W, H, (x, y) => {
    const inLogo = x >= 22 && x < 42 && y >= 22 && y < 42;
    return inLogo ? rgba(20, 184, 166) : rgba(255, 255, 255);
  });
  writeFileSync(join(__dirname, "white-bg-logo.png"), buildPng(pixels, W, H, false));
  console.log("✓ white-bg-logo.png");
}

// ── black-bg-logo.png ─────────────────────────────────────────────────────────
{
  const pixels = fill(W, H, (x, y) => {
    const inLogo = x >= 22 && x < 42 && y >= 22 && y < 42;
    return inLogo ? rgba(20, 184, 166) : rgba(0, 0, 0);
  });
  writeFileSync(join(__dirname, "black-bg-logo.png"), buildPng(pixels, W, H, false));
  console.log("✓ black-bg-logo.png");
}

// ── checker-8.png — 8×8 checkerboard ────────────────────────────────────────
{
  const pixels = fill(W, H, (x, y) => {
    const white = ((Math.floor(x / 8) + Math.floor(y / 8)) % 2) === 0;
    return white ? rgba(255, 255, 255) : rgba(204, 204, 204);
  });
  writeFileSync(join(__dirname, "checker-8.png"), buildPng(pixels, W, H, false));
  console.log("✓ checker-8.png");
}

// ── checker-16.png — 16×16 checkerboard ──────────────────────────────────────
{
  const pixels = fill(W, H, (x, y) => {
    const white = ((Math.floor(x / 16) + Math.floor(y / 16)) % 2) === 0;
    return white ? rgba(255, 255, 255) : rgba(204, 204, 204);
  });
  writeFileSync(join(__dirname, "checker-16.png"), buildPng(pixels, W, H, false));
  console.log("✓ checker-16.png");
}

// ── solid-red-bg.png ──────────────────────────────────────────────────────────
{
  const pixels = fill(W, H, (x, y) => {
    const inLogo = x >= 22 && x < 42 && y >= 22 && y < 42;
    return inLogo ? rgba(20, 184, 166) : rgba(220, 38, 38);
  });
  writeFileSync(join(__dirname, "solid-red-bg.png"), buildPng(pixels, W, H, false));
  console.log("✓ solid-red-bg.png");
}

// ── logo-with-holes.png — logo with interior transparent pixels ───────────────
// Logo is white background + teal frame (4px border) + white interior "hole"
{
  const pixels = fill(W, H, (x, y) => {
    const outerLogo = x >= 20 && x < 44 && y >= 20 && y < 44;
    const innerHole = x >= 26 && x < 38 && y >= 26 && y < 38;
    if (!outerLogo) return rgba(255, 255, 255);     // white bg
    if (innerHole) return rgba(255, 255, 255);       // hole = same white as background
    return rgba(20, 184, 166);                       // teal frame
  });
  writeFileSync(join(__dirname, "logo-with-holes.png"), buildPng(pixels, W, H, false));
  console.log("✓ logo-with-holes.png");
}

// ── shadow-logo.png — logo with soft gradient shadow on white ─────────────────
// Simulate a drop shadow by using near-white grays around the logo
{
  const pixels = fill(W, H, (x, y) => {
    const inLogo = x >= 22 && x < 42 && y >= 22 && y < 42;
    if (inLogo) return rgba(20, 184, 166);
    // Shadow region (1-3 pixels outside the logo)
    const nearLogo = x >= 20 && x < 45 && y >= 20 && y < 45;
    if (nearLogo) return rgba(230, 230, 230); // light gray "shadow"
    return rgba(255, 255, 255);               // white
  });
  writeFileSync(join(__dirname, "shadow-logo.png"), buildPng(pixels, W, H, false));
  console.log("✓ shadow-logo.png");
}

// ── already-transparent.png — real alpha channel PNG ─────────────────────────
// Teal square on fully transparent background
{
  const pixels = fill(W, H, (x, y) => {
    const inLogo = x >= 22 && x < 42 && y >= 22 && y < 42;
    return inLogo ? rgba(20, 184, 166, 255) : rgba(0, 0, 0, 0);
  });
  writeFileSync(join(__dirname, "already-transparent.png"), buildPng(pixels, W, H, true));
  console.log("✓ already-transparent.png");
}

console.log("\n✅ All alpha channel test fixtures generated in tests/fixtures/");
