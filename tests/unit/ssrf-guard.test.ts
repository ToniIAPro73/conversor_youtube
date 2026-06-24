// Unit tests for ssrf-guard.ts
// Uses vi.mock to avoid real DNS resolution in CI

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock dns/promises before importing the module under test
// ---------------------------------------------------------------------------

vi.mock('dns/promises', () => ({
  default: {
    lookup: vi.fn(),
  },
}));

import dns from 'dns/promises';
import { validateRemoteUrl, redactSensitiveQueryParams } from '../../src/lib/remote-media/ssrf-guard';

const mockLookup = dns.lookup as ReturnType<typeof vi.fn>;

beforeEach(() => {
  mockLookup.mockReset();
});

// ---------------------------------------------------------------------------
// Direct IP addresses — blocked without DNS
// ---------------------------------------------------------------------------

describe('validateRemoteUrl — direct IP addresses (blocked)', () => {
  it('http://127.0.0.1/path → safe: false', async () => {
    const result = await validateRemoteUrl('http://127.0.0.1/path');
    expect(result.safe).toBe(false);
  });

  it('http://::1/path → safe: false (IPv6 loopback)', async () => {
    const result = await validateRemoteUrl('http://[::1]/path');
    expect(result.safe).toBe(false);
  });

  it('http://10.0.0.1/resource → safe: false (RFC1918)', async () => {
    const result = await validateRemoteUrl('http://10.0.0.1/resource');
    expect(result.safe).toBe(false);
  });

  it('http://192.168.1.1/ → safe: false (RFC1918)', async () => {
    const result = await validateRemoteUrl('http://192.168.1.1/');
    expect(result.safe).toBe(false);
  });

  it('http://172.16.0.1/ → safe: false (RFC1918)', async () => {
    const result = await validateRemoteUrl('http://172.16.0.1/');
    expect(result.safe).toBe(false);
  });

  it('http://169.254.0.1/ → safe: false (link-local)', async () => {
    const result = await validateRemoteUrl('http://169.254.0.1/');
    expect(result.safe).toBe(false);
  });

  it('http://100.64.0.1/ → safe: false (carrier-grade NAT RFC 6598)', async () => {
    const result = await validateRemoteUrl('http://100.64.0.1/');
    expect(result.safe).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Blocked schemes
// ---------------------------------------------------------------------------

describe('validateRemoteUrl — blocked schemes', () => {
  it('file:///etc/passwd → safe: false', async () => {
    const result = await validateRemoteUrl('file:///etc/passwd');
    expect(result.safe).toBe(false);
  });

  it('ftp://example.com/file → safe: false', async () => {
    const result = await validateRemoteUrl('ftp://example.com/file');
    expect(result.safe).toBe(false);
  });

  it('data:text/html,<h1>x</h1> → safe: false', async () => {
    const result = await validateRemoteUrl('data:text/html,<h1>x</h1>');
    expect(result.safe).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// DNS-based blocking (hostname resolves to private IP)
// ---------------------------------------------------------------------------

describe('validateRemoteUrl — DNS resolution blocks private IPs', () => {
  it('localhost → mock DNS returns 127.0.0.1 → safe: false', async () => {
    mockLookup.mockResolvedValueOnce([{ address: '127.0.0.1', family: 4 }]);
    const result = await validateRemoteUrl('http://localhost/path');
    expect(result.safe).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Valid public URLs
// ---------------------------------------------------------------------------

describe('validateRemoteUrl — valid public URLs', () => {
  it('https://example.com/video.mp4 with public IP → safe: true', async () => {
    mockLookup.mockResolvedValueOnce([{ address: '93.184.216.34', family: 4 }]);
    const result = await validateRemoteUrl('https://example.com/video.mp4');
    expect(result.safe).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Invalid URL
// ---------------------------------------------------------------------------

describe('validateRemoteUrl — invalid URLs', () => {
  it('not-a-url → safe: false', async () => {
    const result = await validateRemoteUrl('not-a-url');
    expect(result.safe).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// redactSensitiveQueryParams
// ---------------------------------------------------------------------------

describe('redactSensitiveQueryParams', () => {
  it('redacts token param, preserves non-sensitive params', () => {
    const url = 'https://cdn.example.com/v.mp4?token=abc123&quality=hd';
    const result = redactSensitiveQueryParams(url);
    expect(result).toContain('token=%5BREDACTED%5D');
    expect(result).toContain('quality=hd');
  });

  it('URL without sensitive params → returned unchanged', () => {
    const url = 'https://cdn.example.com/v.mp4?quality=hd&format=mp4';
    const result = redactSensitiveQueryParams(url);
    expect(result).toContain('quality=hd');
    expect(result).toContain('format=mp4');
    expect(result).not.toContain('REDACTED');
  });

  it('redacts api_key param', () => {
    const url = 'https://api.example.com/media?api_key=supersecret&v=2';
    const result = redactSensitiveQueryParams(url);
    expect(result).not.toContain('supersecret');
    expect(result).toContain('v=2');
  });
});
