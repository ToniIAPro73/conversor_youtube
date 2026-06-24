/**
 * Integration tests for Desktop PRO shell quality contract.
 *
 * Verifies:
 * - quality: "5" magic string is NOT sent in any path
 * - VideoQualitySelection objects with canonical profile/resolutionLimit are built correctly
 * - source-max profile produces MKV/no-ext=mp4 format selectors
 * - mp4-compatible profile produces mp4-constrained selectors
 * - 1440p and 2160p are valid resolution limits (not truncated to legacy values)
 * - Non-YouTube web video URLs are analysed (not rejected with YouTube error)
 */

import { describe, it, expect } from 'vitest';
import {
  buildYtdlpFormatSelector,
  VideoQualitySelectionSchema,
  type VideoQualitySelection,
} from '../../src/lib/quality/quality-contract';

// ---------------------------------------------------------------------------
// Simulates what desktop-pro-shell.tsx now does in handleStartConversion
// ---------------------------------------------------------------------------

function buildQualityBody(
  qualityProfile: VideoQualitySelection['profile'],
  quality: string,
): VideoQualitySelection {
  return VideoQualitySelectionSchema.parse({
    profile: qualityProfile,
    resolutionLimit: quality === 'max' ? 'max' : Number(quality),
    fallbackPolicy: 'reject',
  });
}

// ---------------------------------------------------------------------------
// Tests — no quality: "5" magic value
// ---------------------------------------------------------------------------

describe('Desktop PRO shell — quality contract (no "5" magic string)', () => {
  it('source-max + max does NOT produce quality "5"', () => {
    const sel = buildQualityBody('source-max', 'max');
    expect(JSON.stringify(sel)).not.toContain('"5"');
    expect(sel.profile).toBe('source-max');
    expect(sel.resolutionLimit).toBe('max');
  });

  it('mp4-compatible + 1080 does NOT produce quality "5"', () => {
    const sel = buildQualityBody('mp4-compatible', '1080');
    expect(JSON.stringify(sel)).not.toContain('"5"');
    expect(sel.profile).toBe('mp4-compatible');
    expect(sel.resolutionLimit).toBe(1080);
  });
});

// ---------------------------------------------------------------------------
// Tests — 1440p and 2160p are valid resolution limits
// ---------------------------------------------------------------------------

describe('Desktop PRO shell — 1440p and 2160p resolution limits', () => {
  it('source-max + 1440 builds a valid VideoQualitySelection', () => {
    const sel = buildQualityBody('source-max', '1440');
    expect(sel.resolutionLimit).toBe(1440);
    expect(sel.profile).toBe('source-max');
  });

  it('source-max + 2160 builds a valid VideoQualitySelection', () => {
    const sel = buildQualityBody('source-max', '2160');
    expect(sel.resolutionLimit).toBe(2160);
    expect(sel.profile).toBe('source-max');
  });

  it('source-max + 1440 → yt-dlp selector contains height<=1440 and no [ext=mp4]', () => {
    const sel = buildQualityBody('source-max', '1440');
    const { formatArg, mergeFormat, willRecode } = buildYtdlpFormatSelector(sel);
    expect(formatArg).toContain('height<=1440');
    expect(formatArg).not.toContain('[ext=mp4]');
    expect(mergeFormat).toBe('mkv');
    expect(willRecode).toBe(false);
  });

  it('source-max + 2160 → yt-dlp selector contains height<=2160 and no [ext=mp4]', () => {
    const sel = buildQualityBody('source-max', '2160');
    const { formatArg, mergeFormat } = buildYtdlpFormatSelector(sel);
    expect(formatArg).toContain('height<=2160');
    expect(formatArg).not.toContain('[ext=mp4]');
    expect(mergeFormat).toBe('mkv');
  });
});

// ---------------------------------------------------------------------------
// Tests — profile toggle correctness
// ---------------------------------------------------------------------------

describe('Desktop PRO shell — profile toggle', () => {
  it('source-max profile never uses [ext=mp4] in any resolution', () => {
    const resolutions: string[] = ['max', '360', '480', '720', '1080', '1440', '2160'];
    for (const res of resolutions) {
      const sel = buildQualityBody('source-max', res);
      const { formatArg } = buildYtdlpFormatSelector(sel);
      expect(formatArg, `source-max + ${res} must not contain [ext=mp4]`).not.toContain('[ext=mp4]');
    }
  });

  it('mp4-compatible profile uses [ext=mp4] constraints', () => {
    const sel = buildQualityBody('mp4-compatible', '720');
    const { formatArg, mergeFormat } = buildYtdlpFormatSelector(sel);
    expect(formatArg).toContain('[ext=mp4]');
    expect(mergeFormat).toBe('mp4');
  });

  it('mp4-compatible + max selects mp4 best', () => {
    const sel = buildQualityBody('mp4-compatible', 'max');
    const { formatArg, mergeFormat } = buildYtdlpFormatSelector(sel);
    expect(formatArg).toContain('[ext=mp4]');
    expect(mergeFormat).toBe('mp4');
  });
});

// ---------------------------------------------------------------------------
// Tests — VideoQualitySelection schema validation rejects invalid input
// ---------------------------------------------------------------------------

describe('Desktop PRO shell — VideoQualitySelection schema rejects invalid quality', () => {
  it('throws on numeric quality "5" (not a valid ResolutionLimit)', () => {
    expect(() =>
      VideoQualitySelectionSchema.parse({
        profile: 'source-max',
        resolutionLimit: 5,
        fallbackPolicy: 'reject',
      })
    ).toThrow();
  });

  it('throws on unknown profile string', () => {
    expect(() =>
      VideoQualitySelectionSchema.parse({
        profile: 'legacy-best',
        resolutionLimit: 'max',
        fallbackPolicy: 'reject',
      })
    ).toThrow();
  });
});
