import https from 'https';
import http from 'http';
import { validateRemoteUrl } from './ssrf-guard';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SourceKind =
  | 'youtube'
  | 'direct-media'
  | 'hls'
  | 'dash'
  | 'web-page'
  | 'unsupported-or-protected';

export interface RemoteUrlClassification {
  kind: SourceKind;
  sourceProvider: string | null;
  isPubliclyAccessible: boolean;
  requiresAuthentication: boolean;
  drmDetected: boolean;
  extractorAvailable: boolean;
  analysisStatus: 'resolved' | 'partial' | 'failed';
  reason: string | null;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DIRECT_MEDIA_EXTS = new Set([
  '.mp4', '.webm', '.mkv', '.mov', '.avi',
  '.mp3', '.m4a', '.ogg', '.flac', '.wav',
]);

const YOUTUBE_HOSTS = new Set([
  'youtube.com', 'www.youtube.com', 'youtu.be', 'm.youtube.com',
]);

const HEAD_TIMEOUT_MS = 8_000;
const MAX_REDIRECTS = 3;

// ---------------------------------------------------------------------------
// HEAD request helper
// ---------------------------------------------------------------------------

function doHead(
  urlStr: string,
  redirectsLeft: number,
): Promise<{ contentType: string | null; statusCode: number }> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(urlStr);
    const lib = parsed.protocol === 'https:' ? https : http;

    const req = lib.request(
      urlStr,
      {
        method: 'HEAD',
        timeout: HEAD_TIMEOUT_MS,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; AncloraFileStudio/1.0)',
        },
      },
      (res) => {
        const statusCode = res.statusCode ?? 0;

        // Handle redirects
        if (
          redirectsLeft > 0 &&
          statusCode >= 300 &&
          statusCode < 400 &&
          res.headers.location
        ) {
          try {
            // Resolve relative redirect locations
            const redirectUrl = new URL(res.headers.location, urlStr).toString();
            resolve(doHead(redirectUrl, redirectsLeft - 1));
          } catch {
            reject(new Error('Invalid redirect location'));
          }
          return;
        }

        const contentType = res.headers['content-type'] ?? null;
        resolve({ contentType, statusCode });
      },
    );

    req.on('timeout', () => {
      req.destroy(new Error('HEAD request timed out'));
    });

    req.on('error', (err) => reject(err));
    req.end();
  });
}

// ---------------------------------------------------------------------------
// Extension-based classification
// ---------------------------------------------------------------------------

function classifyByExtension(pathname: string): SourceKind | null {
  const lower = pathname.toLowerCase().split('?')[0];
  const ext = lower.match(/(\.[a-z0-9]+)$/)?.[1] ?? '';

  if (DIRECT_MEDIA_EXTS.has(ext)) return 'direct-media';
  if (ext === '.m3u8') return 'hls';
  if (ext === '.mpd') return 'dash';
  return null;
}

// ---------------------------------------------------------------------------
// Content-Type classification
// ---------------------------------------------------------------------------

function classifyByContentType(contentType: string | null): SourceKind | null {
  if (!contentType) return null;
  const ct = contentType.toLowerCase().split(';')[0].trim();

  if (ct === 'application/x-mpegurl' || ct === 'application/vnd.apple.mpegurl') return 'hls';
  if (ct === 'application/dash+xml') return 'dash';
  if (ct.startsWith('video/') || ct.startsWith('audio/') || ct === 'application/mp4') {
    return 'direct-media';
  }
  if (ct === 'text/html' || ct === 'application/xhtml+xml') return 'web-page';
  return null;
}

// ---------------------------------------------------------------------------
// Main classifier
// ---------------------------------------------------------------------------

export async function classifyRemoteUrl(urlStr: string): Promise<RemoteUrlClassification> {
  // 1. Parse URL
  let parsed: URL;
  try {
    parsed = new URL(urlStr);
  } catch {
    return {
      kind: 'unsupported-or-protected',
      sourceProvider: null,
      isPubliclyAccessible: false,
      requiresAuthentication: false,
      drmDetected: false,
      extractorAvailable: false,
      analysisStatus: 'failed',
      reason: 'URL inválida',
    };
  }

  const host = parsed.hostname.toLowerCase();

  // 2. YouTube shortcut — no HEAD needed
  if (YOUTUBE_HOSTS.has(host)) {
    return {
      kind: 'youtube',
      sourceProvider: 'YouTube',
      isPubliclyAccessible: true,
      requiresAuthentication: false,
      drmDetected: false,
      extractorAvailable: true,
      analysisStatus: 'resolved',
      reason: null,
    };
  }

  // 3. Extension-based classification (fast path, no network)
  const extKind = classifyByExtension(parsed.pathname);

  // 4. SSRF guard before any network call
  const guard = await validateRemoteUrl(urlStr);
  if (!guard.safe) {
    return {
      kind: 'unsupported-or-protected',
      sourceProvider: null,
      isPubliclyAccessible: false,
      requiresAuthentication: false,
      drmDetected: false,
      extractorAvailable: false,
      analysisStatus: 'failed',
      reason: guard.reason ?? 'URL bloqueada por seguridad',
    };
  }

  // 5. HEAD request to confirm Content-Type
  let headKind: SourceKind | null = null;
  try {
    const { contentType } = await doHead(urlStr, MAX_REDIRECTS);
    headKind = classifyByContentType(contentType);
  } catch {
    // Network error — fall back to extension-based or default
  }

  const resolvedKind: SourceKind = headKind ?? extKind ?? 'web-page';

  const isStreamKind = resolvedKind === 'hls' || resolvedKind === 'dash';

  return {
    kind: resolvedKind,
    sourceProvider: null,
    isPubliclyAccessible: true,
    requiresAuthentication: false,
    drmDetected: false,
    extractorAvailable: isStreamKind,
    analysisStatus: headKind ? 'resolved' : (extKind ? 'partial' : 'partial'),
    reason: null,
  };
}
