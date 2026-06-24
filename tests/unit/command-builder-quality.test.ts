// Unit tests for buildYtdlpArgs in command-builder.ts
// Covers: VideoQualitySelection typed input, legacy string adapter, audio formats

import { describe, it, expect } from 'vitest';
import { buildYtdlpArgs } from '../../src/lib/media/command-builder';

const DUMMY_URL = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
const DUMMY_OUTPUT = '/tmp/output.mp4';

// ---------------------------------------------------------------------------
// source-max profile
// ---------------------------------------------------------------------------

describe('buildYtdlpArgs — source-max profile', () => {
  it('source-max + max → does NOT contain --no-check-certificates in non-Windows mode', () => {
    delete process.env.ANCLORA_FILESTUDIO_PLATFORM;
    const args = buildYtdlpArgs({
      url: DUMMY_URL,
      format: 'mp4',
      quality: { profile: 'source-max', resolutionLimit: 'max', fallbackPolicy: 'reject' },
      outputPath: DUMMY_OUTPUT,
    });
    expect(args).not.toContain('--no-check-certificates');
  });

  it('source-max + max → contains --no-check-certificates in Windows portable mode', () => {
    process.env.ANCLORA_FILESTUDIO_PLATFORM = 'windows';
    const args = buildYtdlpArgs({
      url: DUMMY_URL,
      format: 'mp4',
      quality: { profile: 'source-max', resolutionLimit: 'max', fallbackPolicy: 'reject' },
      outputPath: DUMMY_OUTPUT,
    });
    expect(args).toContain('--no-check-certificates');
    delete process.env.ANCLORA_FILESTUDIO_PLATFORM;
  });

  it('source-max → result does NOT contain [ext=mp4] in any argument', () => {
    const args = buildYtdlpArgs({
      url: DUMMY_URL,
      format: 'mp4',
      quality: { profile: 'source-max', resolutionLimit: 'max', fallbackPolicy: 'reject' },
      outputPath: DUMMY_OUTPUT,
    });
    const hasExtMp4 = args.some((a) => a.includes('[ext=mp4]'));
    expect(hasExtMp4).toBe(false);
  });

  it('source-max + 2160 → result contains height<=2160 and does NOT contain [ext=mp4] before bestaudio', () => {
    const args = buildYtdlpArgs({
      url: DUMMY_URL,
      format: 'mp4',
      quality: { profile: 'source-max', resolutionLimit: 2160, fallbackPolicy: 'reject' },
      outputPath: DUMMY_OUTPUT,
    });
    const formatArg = args.find((a) => a.includes('height<=2160'));
    expect(formatArg).toBeDefined();
    // Should not constrain to mp4 extension on source-max
    expect(formatArg).not.toContain('[ext=mp4]');
  });
});

// ---------------------------------------------------------------------------
// mp4-compatible profile
// ---------------------------------------------------------------------------

describe('buildYtdlpArgs — mp4-compatible profile', () => {
  it('mp4-compatible + 1080 → result contains bestvideo[height<=1080][ext=mp4]', () => {
    const args = buildYtdlpArgs({
      url: DUMMY_URL,
      format: 'mp4',
      quality: { profile: 'mp4-compatible', resolutionLimit: 1080, fallbackPolicy: 'reject' },
      outputPath: DUMMY_OUTPUT,
    });
    const formatArg = args.find((a) => a.includes('bestvideo[height<=1080][ext=mp4]'));
    expect(formatArg).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Audio format
// ---------------------------------------------------------------------------

describe('buildYtdlpArgs — audio format (mp3)', () => {
  it('format mp3 + quality 320 → result contains --extract-audio and does NOT contain --no-check-certificates', () => {
    const args = buildYtdlpArgs({
      url: DUMMY_URL,
      format: 'mp3',
      quality: '320',
      outputPath: '/tmp/output.mp3',
    });
    expect(args).toContain('--extract-audio');
    expect(args).not.toContain('--no-check-certificates');
  });
});

// ---------------------------------------------------------------------------
// Legacy string adapter
// ---------------------------------------------------------------------------

describe('buildYtdlpArgs — legacy string quality adapter', () => {
  it("legacy string '1080' with format mp4 → does NOT throw, uses adapter", () => {
    expect(() =>
      buildYtdlpArgs({
        url: DUMMY_URL,
        format: 'mp4',
        quality: '1080',
        outputPath: DUMMY_OUTPUT,
      })
    ).not.toThrow();
  });

  it("legacy string 'best' with format mp4 → does NOT throw and does NOT produce [ext=mp4] args", () => {
    let args: string[] = [];
    expect(() => {
      args = buildYtdlpArgs({
        url: DUMMY_URL,
        format: 'mp4',
        quality: 'best',
        outputPath: DUMMY_OUTPUT,
      });
    }).not.toThrow();
    // 'best' maps to source-max so no [ext=mp4]
    expect(args.some((a) => a.includes('[ext=mp4]'))).toBe(false);
  });
});
