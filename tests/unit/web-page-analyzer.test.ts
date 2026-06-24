// Unit tests for web-page-analyzer.ts
// Mocks: ssrf-guard (always allow) + https/http modules (return fixture HTML)

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock ssrf-guard so every URL is "safe" (we test the analyzer logic, not SSRF)
// ---------------------------------------------------------------------------

vi.mock('../../src/lib/remote-media/ssrf-guard', () => ({
  validateRemoteUrl: vi.fn().mockResolvedValue({ safe: true }),
  redactSensitiveQueryParams: (url: string) => url,
  BLOCKED_SCHEMES: new Set(),
}));

// ---------------------------------------------------------------------------
// Mock https / http so no real network calls are made.
// We simulate a successful response by returning the fixture HTML.
// ---------------------------------------------------------------------------

import { EventEmitter } from 'events';

function makeHttpsMock(html: string, truncated = false) {
  return {
    get: (_url: string, _opts: unknown, callback: (res: EventEmitter & { statusCode?: number }) => void) => {
      const req = new EventEmitter() as EventEmitter & { destroy: (err?: Error) => void };
      req.destroy = () => {};

      setImmediate(() => {
        const res = new EventEmitter() as EventEmitter & { statusCode?: number };
        res.statusCode = 200;
        callback(res);
        setImmediate(() => {
          const bytes = Buffer.from(html, 'utf-8');
          res.emit('data', bytes);
          if (!truncated) {
            res.emit('end');
          }
        });
      });

      return req;
    },
  };
}

// We need to reset the mock for each test
let _currentHtml = '';

vi.mock('https', () => ({
  default: {
    get: (url: string, opts: unknown, callback: (res: EventEmitter & { statusCode?: number }) => void) => {
      return makeHttpsMock(_currentHtml).get(url, opts, callback);
    },
  },
}));

vi.mock('http', () => ({
  default: {
    get: (url: string, opts: unknown, callback: (res: EventEmitter & { statusCode?: number }) => void) => {
      return makeHttpsMock(_currentHtml).get(url, opts, callback);
    },
  },
}));

// Import after mocks are registered
import { analyzeWebPage } from '../../src/lib/remote-media/web-page-analyzer';

const BASE_URL = 'https://example.com/page';

beforeEach(() => {
  _currentHtml = '';
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// <video src> detection
// ---------------------------------------------------------------------------

describe('analyzeWebPage — <video src>', () => {
  it('HTML with <video src="/video.mp4"> → found: true, sources.length > 0, kind === direct', async () => {
    _currentHtml = '<html><body><video src="/video.mp4" controls></video></body></html>';
    const result = await analyzeWebPage(BASE_URL);
    expect(result.found).toBe(true);
    expect(result.sources.length).toBeGreaterThan(0);
    expect(result.sources[0].kind).toBe('direct');
  });
});

// ---------------------------------------------------------------------------
// <source type="application/x-mpegURL"> → HLS
// ---------------------------------------------------------------------------

describe('analyzeWebPage — HLS <source>', () => {
  it('HTML with <source src="/stream.m3u8" type="application/x-mpegURL"> → found: true, kind === hls', async () => {
    _currentHtml = `<html><body>
      <video>
        <source src="/stream.m3u8" type="application/x-mpegURL">
      </video>
    </body></html>`;
    const result = await analyzeWebPage(BASE_URL);
    expect(result.found).toBe(true);
    expect(result.sources.length).toBeGreaterThan(0);
    expect(result.sources[0].kind).toBe('hls');
  });
});

// ---------------------------------------------------------------------------
// og:video meta tag
// ---------------------------------------------------------------------------

describe('analyzeWebPage — og:video meta', () => {
  it('HTML with og:video meta → found: true', async () => {
    _currentHtml = `<html><head>
      <meta property="og:video" content="https://cdn.example.com/video.mp4">
    </head><body></body></html>`;
    const result = await analyzeWebPage(BASE_URL);
    expect(result.found).toBe(true);
    expect(result.sources.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// JSON-LD VideoObject
// ---------------------------------------------------------------------------

describe('analyzeWebPage — JSON-LD VideoObject', () => {
  it('HTML with JSON-LD VideoObject contentUrl → found: true', async () => {
    _currentHtml = `<html><head>
      <script type="application/ld+json">
        {"@type":"VideoObject","contentUrl":"https://cdn.example.com/v.mp4","name":"Test"}
      </script>
    </head><body></body></html>`;
    const result = await analyzeWebPage(BASE_URL);
    expect(result.found).toBe(true);
    expect(result.sources.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// No video → found: false
// ---------------------------------------------------------------------------

describe('analyzeWebPage — no video content', () => {
  it('HTML without any video → found: false, sources: []', async () => {
    _currentHtml = `<html><body><p>Just some text, no video here.</p></body></html>`;
    const result = await analyzeWebPage(BASE_URL);
    expect(result.found).toBe(false);
    expect(result.sources).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// iframes not added to sources
// ---------------------------------------------------------------------------

describe('analyzeWebPage — iframes not treated as sources', () => {
  it('HTML with YouTube iframe → iframes not in sources, limitationMessage may be present', async () => {
    _currentHtml = `<html><body>
      <iframe src="https://www.youtube.com/embed/abc" allowfullscreen></iframe>
    </body></html>`;
    const result = await analyzeWebPage(BASE_URL);
    // iframes should NOT be treated as direct media sources
    const hasIframeSrc = result.sources.some((s) => s.url.includes('youtube.com/embed'));
    expect(hasIframeSrc).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// DRM detection
// ---------------------------------------------------------------------------

describe('analyzeWebPage — DRM detection', () => {
  it('HTML with "encrypted-media" keyword → drmDetected: true', async () => {
    _currentHtml = `<html><body>
      <script>
        navigator.requestMediaKeySystemAccess('com.widevine.alpha', [{
          initDataTypes: ['cenc'],
          videoCapabilities: [{ contentType: 'video/mp4; codecs="avc1"' }],
          sessionTypes: ['temporary'],
          robustness: 'encrypted-media'
        }]);
      </script>
      <video src="/video.mp4"></video>
    </body></html>`;
    const result = await analyzeWebPage(BASE_URL);
    expect(result.drmDetected).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Large HTML (> 1 MB) — should not crash
// ---------------------------------------------------------------------------

describe('analyzeWebPage — large HTML', () => {
  it('HTML larger than 1 MB → analysis completes without crash', async () => {
    // Generate > 1 MB of HTML (1_048_576 bytes + overhead)
    const padding = 'x'.repeat(1_100_000);
    _currentHtml = `<html><body><p>${padding}</p><video src="/video.mp4"></video></body></html>`;
    // Should not throw, even if truncated
    await expect(analyzeWebPage(BASE_URL)).resolves.toBeDefined();
  });
});
