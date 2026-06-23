import https from 'https';
import http from 'http';
import { validateRemoteUrl } from './ssrf-guard';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MediaSource {
  url: string;
  kind: 'direct' | 'hls' | 'dash';
  mimeType: string | null;
  quality: string | null;
}

export interface WebPageMediaResult {
  found: boolean;
  sources: MediaSource[];
  drmDetected: boolean;
  requiresAuth: boolean;
  limitationMessage: string | null;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_MAX_BYTES = 1_048_576; // 1 MB
const DEFAULT_TIMEOUT_MS = 15_000;

const DRM_TERMS = ['encrypted-media', 'widevine', 'playready', 'fairplay', ' eme '];
const AUTH_TERMS = ['login', 'signin', 'sign-in', 'suscri'];

// ---------------------------------------------------------------------------
// HTTP fetch helper (Node.js built-ins only, no npm fetch)
// ---------------------------------------------------------------------------

function fetchHtml(
  urlStr: string,
  maxBytes: number,
  timeoutMs: number,
): Promise<{ html: string; truncated: boolean }> {
  return new Promise((resolve, reject) => {
    const parsed = new URL(urlStr);
    const lib = parsed.protocol === 'https:' ? https : http;

    const req = lib.get(
      urlStr,
      {
        timeout: timeoutMs,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; AncloraFileStudio/1.0)',
          Accept: 'text/html,application/xhtml+xml',
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        let totalBytes = 0;
        let truncated = false;

        res.on('data', (chunk: Buffer) => {
          totalBytes += chunk.length;
          if (totalBytes > maxBytes) {
            truncated = true;
            chunks.push(chunk.subarray(0, maxBytes - (totalBytes - chunk.length)));
            req.destroy();
            return;
          }
          chunks.push(chunk);
        });

        res.on('end', () => {
          const html = Buffer.concat(chunks).toString('utf-8');
          resolve({ html, truncated });
        });

        res.on('error', reject);
      },
    );

    req.on('timeout', () => {
      req.destroy(new Error('Fetch timed out'));
    });

    req.on('error', (err) => {
      // ECONNRESET is expected when we destroy mid-stream for size limit
      if ((err as NodeJS.ErrnoException).code === 'ECONNRESET') {
        // partial content already buffered — handled in 'end'
        return;
      }
      reject(err);
    });
  });
}

// ---------------------------------------------------------------------------
// URL resolution helper
// ---------------------------------------------------------------------------

function resolveUrl(base: string, relative: string): string | null {
  try {
    return new URL(relative, base).toString();
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Kind classification by extension or mime
// ---------------------------------------------------------------------------

function kindFromMime(mimeType: string | null): MediaSource['kind'] {
  if (!mimeType) return 'direct';
  const m = mimeType.toLowerCase();
  if (m.includes('mpegurl') || m.includes('x-mpegurl')) return 'hls';
  if (m.includes('dash+xml')) return 'dash';
  return 'direct';
}

function kindFromUrl(url: string): MediaSource['kind'] {
  const lower = url.toLowerCase().split('?')[0];
  if (lower.endsWith('.m3u8')) return 'hls';
  if (lower.endsWith('.mpd')) return 'dash';
  return 'direct';
}

// ---------------------------------------------------------------------------
// HTML parsers (RegExp only — no npm parsing dependencies)
// ---------------------------------------------------------------------------

function extractVideoSrcElements(html: string, baseUrl: string): MediaSource[] {
  const sources: MediaSource[] = [];

  // <source src="..." type="...">
  const sourceRe = /<source[^>]+>/gi;
  let m: RegExpExecArray | null;
  while ((m = sourceRe.exec(html)) !== null) {
    const tag = m[0];
    const srcMatch = /\bsrc\s*=\s*["']([^"']+)["']/i.exec(tag);
    const typeMatch = /\btype\s*=\s*["']([^"']+)["']/i.exec(tag);
    if (!srcMatch) continue;
    const resolved = resolveUrl(baseUrl, srcMatch[1]);
    if (!resolved) continue;
    const mimeType = typeMatch ? typeMatch[1] : null;
    sources.push({
      url: resolved,
      kind: mimeType ? kindFromMime(mimeType) : kindFromUrl(resolved),
      mimeType,
      quality: null,
    });
  }

  // <video src="...">
  const videoRe = /<video[^>]+>/gi;
  while ((m = videoRe.exec(html)) !== null) {
    const tag = m[0];
    const srcMatch = /\bsrc\s*=\s*["']([^"']+)["']/i.exec(tag);
    if (!srcMatch) continue;
    const resolved = resolveUrl(baseUrl, srcMatch[1]);
    if (!resolved) continue;
    sources.push({ url: resolved, kind: kindFromUrl(resolved), mimeType: null, quality: null });
  }

  return sources;
}

function extractOgVideo(html: string, baseUrl: string): MediaSource[] {
  const sources: MediaSource[] = [];
  const patterns = [
    /<meta[^>]+property\s*=\s*["']og:video:secure_url["'][^>]+content\s*=\s*["']([^"']+)["']/gi,
    /<meta[^>]+content\s*=\s*["']([^"']+)["'][^>]+property\s*=\s*["']og:video:secure_url["']/gi,
    /<meta[^>]+property\s*=\s*["']og:video["'][^>]+content\s*=\s*["']([^"']+)["']/gi,
    /<meta[^>]+content\s*=\s*["']([^"']+)["'][^>]+property\s*=\s*["']og:video["']/gi,
  ];

  for (const re of patterns) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(html)) !== null) {
      const resolved = resolveUrl(baseUrl, m[1]);
      if (resolved) {
        sources.push({ url: resolved, kind: kindFromUrl(resolved), mimeType: null, quality: null });
      }
    }
  }

  return sources;
}

function extractJsonLdVideoObjects(html: string, baseUrl: string): MediaSource[] {
  const sources: MediaSource[] = [];
  const scriptRe = /<script[^>]+type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;

  while ((m = scriptRe.exec(html)) !== null) {
    try {
      const raw = m[1].trim();
      const data: unknown = JSON.parse(raw);

      const nodes: unknown[] = Array.isArray(data) ? data : [data];
      for (const node of nodes) {
        if (
          node !== null &&
          typeof node === 'object' &&
          '@type' in node &&
          (node as Record<string, unknown>)['@type'] === 'VideoObject'
        ) {
          const obj = node as Record<string, unknown>;
          const contentUrl = obj['contentUrl'];
          if (typeof contentUrl === 'string') {
            const resolved = resolveUrl(baseUrl, contentUrl);
            if (resolved) {
              sources.push({
                url: resolved,
                kind: kindFromUrl(resolved),
                mimeType: null,
                quality: null,
              });
            }
          }
        }
      }
    } catch {
      // JSON parse error — skip this block
    }
  }

  return sources;
}

// ---------------------------------------------------------------------------
// DRM / Auth detection
// ---------------------------------------------------------------------------

function detectDrm(html: string): boolean {
  const lower = html.toLowerCase();
  return DRM_TERMS.some((t) => lower.includes(t));
}

function detectAuth(urlStr: string, html: string): boolean {
  const lowerUrl = urlStr.toLowerCase();
  const lowerHtml = html.toLowerCase();

  if (AUTH_TERMS.some((t) => lowerUrl.includes(t))) return true;

  // Check form actions
  const formRe = /<form[^>]+action\s*=\s*["']([^"']+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = formRe.exec(html)) !== null) {
    const action = m[1].toLowerCase();
    if (AUTH_TERMS.some((t) => action.includes(t))) return true;
  }

  // Look for auth hints in meta / title
  if (AUTH_TERMS.some((t) => lowerHtml.includes(t))) return true;

  return false;
}

// ---------------------------------------------------------------------------
// De-duplication
// ---------------------------------------------------------------------------

function deduplicateSources(sources: MediaSource[]): MediaSource[] {
  const seen = new Set<string>();
  return sources.filter((s) => {
    if (seen.has(s.url)) return false;
    seen.add(s.url);
    return true;
  });
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export async function analyzeWebPage(
  pageUrl: string,
  options?: { maxBytes?: number; timeoutMs?: number },
): Promise<WebPageMediaResult> {
  const maxBytes = options?.maxBytes ?? DEFAULT_MAX_BYTES;
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  // SSRF guard first
  const guard = await validateRemoteUrl(pageUrl);
  if (!guard.safe) {
    return {
      found: false,
      sources: [],
      drmDetected: false,
      requiresAuth: false,
      limitationMessage: `No se puede analizar la página: ${guard.reason}`,
    };
  }

  let html: string;
  let truncated = false;

  try {
    const result = await fetchHtml(pageUrl, maxBytes, timeoutMs);
    html = result.html;
    truncated = result.truncated;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      found: false,
      sources: [],
      drmDetected: false,
      requiresAuth: false,
      limitationMessage: `Error al descargar la página: ${msg}`,
    };
  }

  // Extract sources from various HTML patterns
  const rawSources = [
    ...extractVideoSrcElements(html, pageUrl),
    ...extractOgVideo(html, pageUrl),
    ...extractJsonLdVideoObjects(html, pageUrl),
  ];

  // Validate each discovered source URL with SSRF guard
  const safeSources: MediaSource[] = [];
  for (const src of deduplicateSources(rawSources)) {
    const check = await validateRemoteUrl(src.url);
    if (check.safe) {
      safeSources.push(src);
    }
  }

  const drmDetected = detectDrm(html);
  const requiresAuth = detectAuth(pageUrl, html);

  return {
    found: safeSources.length > 0,
    sources: safeSources,
    drmDetected,
    requiresAuth,
    limitationMessage: truncated
      ? 'El HTML de la página superó 1 MB; el análisis puede estar incompleto.'
      : null,
  };
}
