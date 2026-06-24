// Unit tests for quality-contract.ts
// Covers: buildYtdlpFormatSelector, parseLegacyQualityString, VideoQualitySelectionSchema

import { describe, it, expect } from 'vitest';
import {
  buildYtdlpFormatSelector,
  parseLegacyQualityString,
  VideoQualitySelectionSchema,
} from '../../src/lib/quality/quality-contract';

// ---------------------------------------------------------------------------
// buildYtdlpFormatSelector
// ---------------------------------------------------------------------------

describe('buildYtdlpFormatSelector — source-max profile', () => {
  it('source-max + max → formatArg does NOT contain [ext=mp4], mergeFormat is mkv, willRecode is false', () => {
    const result = buildYtdlpFormatSelector({
      profile: 'source-max',
      resolutionLimit: 'max',
      fallbackPolicy: 'reject',
    });
    expect(result.formatArg).not.toContain('[ext=mp4]');
    expect(result.mergeFormat).toBe('mkv');
    expect(result.willRecode).toBe(false);
  });

  it('source-max + 2160 → formatArg contains height<=2160 but NOT [ext=mp4], mergeFormat is mkv', () => {
    const result = buildYtdlpFormatSelector({
      profile: 'source-max',
      resolutionLimit: 2160,
      fallbackPolicy: 'reject',
    });
    expect(result.formatArg).toContain('height<=2160');
    expect(result.formatArg).not.toContain('[ext=mp4]');
    expect(result.mergeFormat).toBe('mkv');
  });

  it('source-max + 1080 → formatArg does NOT contain [ext=mp4]', () => {
    const result = buildYtdlpFormatSelector({
      profile: 'source-max',
      resolutionLimit: 1080,
      fallbackPolicy: 'reject',
    });
    expect(result.formatArg).not.toContain('[ext=mp4]');
    expect(result.formatArg).toContain('height<=1080');
    expect(result.mergeFormat).toBe('mkv');
  });
});

describe('buildYtdlpFormatSelector — mp4-compatible profile', () => {
  it('mp4-compatible + 1080 → formatArg contains [ext=mp4], mergeFormat is mp4', () => {
    const result = buildYtdlpFormatSelector({
      profile: 'mp4-compatible',
      resolutionLimit: 1080,
      fallbackPolicy: 'reject',
    });
    expect(result.formatArg).toContain('[ext=mp4]');
    expect(result.mergeFormat).toBe('mp4');
  });

  it('mp4-compatible + max → formatArg contains [ext=mp4], mergeFormat is mp4', () => {
    const result = buildYtdlpFormatSelector({
      profile: 'mp4-compatible',
      resolutionLimit: 'max',
      fallbackPolicy: 'reject',
    });
    expect(result.formatArg).toContain('[ext=mp4]');
    expect(result.mergeFormat).toBe('mp4');
  });
});

// ---------------------------------------------------------------------------
// parseLegacyQualityString
// ---------------------------------------------------------------------------

describe('parseLegacyQualityString', () => {
  it("'1080' → profile mp4-compatible, resolutionLimit 1080", () => {
    const result = parseLegacyQualityString('1080', 'mp4');
    expect(result.profile).toBe('mp4-compatible');
    expect(result.resolutionLimit).toBe(1080);
  });

  it("'720' → profile mp4-compatible, resolutionLimit 720", () => {
    const result = parseLegacyQualityString('720', 'mp4');
    expect(result.profile).toBe('mp4-compatible');
    expect(result.resolutionLimit).toBe(720);
  });

  it("'best' → profile source-max, resolutionLimit 'max'", () => {
    const result = parseLegacyQualityString('best', 'mp4');
    expect(result.profile).toBe('source-max');
    expect(result.resolutionLimit).toBe('max');
  });

  it("'' (empty string) → profile source-max, resolutionLimit 'max'", () => {
    const result = parseLegacyQualityString('', 'mp4');
    expect(result.profile).toBe('source-max');
    expect(result.resolutionLimit).toBe('max');
  });

  it("regression: parseInt('best', 10) is NaN AND parseLegacyQualityString('best') does NOT throw or return a numeric height", () => {
    // Verify the root cause the fix addressed: parseInt('best') returns NaN
    expect(parseInt('best', 10)).toBeNaN();

    // Confirm the fixed code handles it gracefully
    let caughtError: unknown = null;
    let result: ReturnType<typeof parseLegacyQualityString> | null = null;
    try {
      result = parseLegacyQualityString('best', 'mp4');
    } catch (e) {
      caughtError = e;
    }
    expect(caughtError).toBeNull();
    expect(result).not.toBeNull();
    // resolutionLimit must NOT be a number (it would have been NaN from parseInt before the fix)
    expect(typeof result!.resolutionLimit).not.toBe('number');
    expect(result!.resolutionLimit).toBe('max');
  });
});

// ---------------------------------------------------------------------------
// VideoQualitySelectionSchema — Zod validation
// ---------------------------------------------------------------------------

describe('VideoQualitySelectionSchema — invalid inputs rejected', () => {
  it("rejects { profile: 'invalid', resolutionLimit: 'max' }", () => {
    const parseResult = VideoQualitySelectionSchema.safeParse({
      profile: 'invalid',
      resolutionLimit: 'max',
    });
    expect(parseResult.success).toBe(false);
  });

  it("rejects { profile: 'source-max', resolutionLimit: 999 } (non-allowed height)", () => {
    const parseResult = VideoQualitySelectionSchema.safeParse({
      profile: 'source-max',
      resolutionLimit: 999,
    });
    expect(parseResult.success).toBe(false);
  });
});
