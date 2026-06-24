import dns from 'dns/promises';

// ---------------------------------------------------------------------------
// IPv4 CIDR range helpers
// ---------------------------------------------------------------------------

function ipToLong(ip: string): number {
  return ip.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0) >>> 0;
}

const BLOCKED_CIDRS_V4: Array<{ start: number; end: number }> = [
  // loopback
  { start: ipToLong('127.0.0.0'), end: ipToLong('127.255.255.255') },
  // RFC 1918
  { start: ipToLong('10.0.0.0'), end: ipToLong('10.255.255.255') },
  { start: ipToLong('172.16.0.0'), end: ipToLong('172.31.255.255') },
  { start: ipToLong('192.168.0.0'), end: ipToLong('192.168.255.255') },
  // link-local
  { start: ipToLong('169.254.0.0'), end: ipToLong('169.254.255.255') },
  // carrier-grade NAT (RFC 6598)
  { start: ipToLong('100.64.0.0'), end: ipToLong('100.127.255.255') },
];

function isBlockedIPv4(ip: string): boolean {
  const long = ipToLong(ip);
  return BLOCKED_CIDRS_V4.some(({ start, end }) => long >= start && long <= end);
}

function isBlockedIPv6(ip: string): boolean {
  // Strip IPv4-mapped prefix (::ffff:a.b.c.d or ::ffff:0102:0304)
  const lower = ip.toLowerCase().replace(/^\[/, '').replace(/\]$/, '').replace(/^::ffff:/, '');

  // Loopback
  if (lower === '::1' || lower === '0:0:0:0:0:0:0:1') return true;

  // ULA (fc00::/7 — fc and fd prefixes)
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true;

  // Link-local (fe80::/10 — fe8x, fe9x, feax, febx)
  if (
    lower.startsWith('fe8') ||
    lower.startsWith('fe9') ||
    lower.startsWith('fea') ||
    lower.startsWith('feb')
  ) return true;

  return false;
}

// ---------------------------------------------------------------------------
// Blocked URL schemes
// ---------------------------------------------------------------------------

export const BLOCKED_SCHEMES = new Set([
  'file:', 'ftp:', 'data:', 'blob:', 'javascript:', 'chrome:', 'about:',
]);

// ---------------------------------------------------------------------------
// Main SSRF guard
// ---------------------------------------------------------------------------

export async function validateRemoteUrl(
  urlStr: string,
): Promise<{ safe: boolean; reason?: string }> {
  let parsed: URL;
  try {
    parsed = new URL(urlStr);
  } catch {
    return { safe: false, reason: 'URL inválida' };
  }

  if (BLOCKED_SCHEMES.has(parsed.protocol)) {
    return { safe: false, reason: `Esquema no permitido: ${parsed.protocol}` };
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return { safe: false, reason: `Esquema no soportado: ${parsed.protocol}` };
  }

  const hostname = parsed.hostname;

  // Direct IP address checks before DNS resolution
  if (/^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
    if (isBlockedIPv4(hostname)) {
      return { safe: false, reason: `IP privada/reservada bloqueada: ${hostname}` };
    }
  } else if (hostname.includes(':') || /^\[.*\]$/.test(hostname)) {
    // IPv6 literal (possibly wrapped in brackets)
    const bare = hostname.replace(/^\[/, '').replace(/\]$/, '');
    if (isBlockedIPv6(bare)) {
      return { safe: false, reason: `IPv6 local/privada bloqueada: ${hostname}` };
    }
  }

  // DNS resolution check — guard against DNS rebinding
  try {
    const results = await dns.lookup(hostname, { all: true });
    for (const r of results) {
      if (r.family === 4 && isBlockedIPv4(r.address)) {
        return { safe: false, reason: `DNS resuelve a IP privada: ${r.address}` };
      }
      if (r.family === 6 && isBlockedIPv6(r.address)) {
        return { safe: false, reason: `DNS resuelve a IPv6 local: ${r.address}` };
      }
    }
  } catch {
    return { safe: false, reason: `No se puede resolver el hostname: ${hostname}` };
  }

  return { safe: true };
}

// ---------------------------------------------------------------------------
// Query param redaction helper
// ---------------------------------------------------------------------------

const SENSITIVE_KEYS = [
  'token', 'key', 'secret', 'password', 'passwd',
  'api_key', 'auth', 'sig', 'signature',
];

export function redactSensitiveQueryParams(urlStr: string): string {
  try {
    const u = new URL(urlStr);
    for (const key of [...u.searchParams.keys()]) {
      if (SENSITIVE_KEYS.some((s) => key.toLowerCase().includes(s))) {
        u.searchParams.set(key, '[REDACTED]');
      }
    }
    return u.toString();
  } catch {
    return '[URL_REDACTED]';
  }
}
