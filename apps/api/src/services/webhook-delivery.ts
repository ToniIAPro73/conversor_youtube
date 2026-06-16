// WebhookDeliveryService — signs and delivers webhook payloads with SSRF protection.
// Security: DNS re-resolution before each delivery, RFC 1918 blocklist, no redirect follow,
// 10s timeout, HMAC-SHA256 signature with timestamp anti-replay.
import { createHmac, randomBytes } from "node:crypto";
import { lookup } from "node:dns/promises";

// ── SSRF Protection ───────────────────────────────────────────────────────────

const PRIVATE_CIDR_PATTERNS: RegExp[] = [
  /^127\./,             // 127.0.0.0/8  loopback
  /^10\./,              // 10.0.0.0/8
  /^192\.168\./,        // 192.168.0.0/16
  /^172\.(1[6-9]|2\d|3[01])\./,  // 172.16.0.0/12
  /^169\.254\./,        // 169.254.0.0/16 link-local
  /^::1$/,              // IPv6 loopback
  /^fc00:/,             // IPv6 ULA
  /^fe80:/,             // IPv6 link-local
  /^0\./,               // 0.0.0.0/8
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./,  // 100.64.0.0/10 CGNAT
  /^::ffff:(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.)/,  // IPv4-mapped IPv6
];

function isPrivateIp(ip: string): boolean {
  return PRIVATE_CIDR_PATTERNS.some((r) => r.test(ip));
}

export type LookupFn = (hostname: string, options: { all: boolean }) => Promise<Array<{ address: string }>>;

async function resolveAndValidateUrl(rawUrl: string, lookupFn: LookupFn): Promise<string> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new SsrfError(`Invalid webhook URL: ${rawUrl}`);
  }

  if (parsed.protocol !== "https:") {
    throw new SsrfError(`Webhook URL must use HTTPS, got: ${parsed.protocol}`);
  }

  const hostname = parsed.hostname;

  // Reject numeric IPs directly (both v4 and v6 bracket notation)
  const ipv4Literal = /^\d+\.\d+\.\d+\.\d+$/.test(hostname);
  const ipv6Literal = hostname.startsWith("[");
  if (ipv4Literal || ipv6Literal) {
    const ip = ipv6Literal ? hostname.slice(1, -1) : hostname;
    if (isPrivateIp(ip)) {
      throw new SsrfError(`Webhook URL resolves to private/reserved IP: ${ip}`);
    }
  }

  // DNS resolution — check every resolved address
  const addrs = await lookupFn(hostname, { all: true }).catch(() => {
    throw new SsrfError(`Webhook DNS resolution failed for: ${hostname}`);
  });

  for (const addr of addrs) {
    if (isPrivateIp(addr.address)) {
      throw new SsrfError(
        `Webhook URL "${hostname}" resolves to private/reserved IP: ${addr.address}`
      );
    }
  }

  return rawUrl;
}

export class SsrfError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SsrfError";
  }
}

// ── HMAC-SHA256 Webhook Signature ─────────────────────────────────────────────

export function signWebhookPayload(
  secret: string,
  timestamp: number,
  body: string
): string {
  const signingInput = `${timestamp}.${body}`;
  return createHmac("sha256", secret).update(signingInput).digest("hex");
}

export function buildWebhookHeaders(
  secret: string,
  body: string
): Record<string, string> {
  const timestamp = Math.floor(Date.now() / 1000);
  const sig = signWebhookPayload(secret, timestamp, body);
  return {
    "Content-Type": "application/json",
    "X-Anclora-Signature": `t=${timestamp},v1=${sig}`,
    "X-Anclora-Event-Id": randomBytes(16).toString("hex"),
  };
}

export function verifyWebhookSignature(
  secret: string,
  signature: string,
  body: string,
  toleranceSec = 300
): boolean {
  const parts = Object.fromEntries(
    signature.split(",").map((part) => {
      const eq = part.indexOf("=");
      return [part.slice(0, eq), part.slice(eq + 1)];
    })
  );

  const t = Number(parts["t"]);
  const v1 = parts["v1"];

  if (!t || !v1) return false;

  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - t) > toleranceSec) return false;

  const expected = signWebhookPayload(secret, t, body);

  // Constant-time compare to prevent timing attacks
  if (expected.length !== v1.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ v1.charCodeAt(i);
  }
  return diff === 0;
}

// ── Delivery ──────────────────────────────────────────────────────────────────

export interface WebhookDeliveryResult {
  ok: boolean;
  statusCode?: number;
  latencyMs: number;
  error?: string;
}

const TIMEOUT_MS = 10_000;

export async function deliverWebhook(
  url: string,
  secret: string,
  event: { type: string; payload: Record<string, unknown> },
  lookupFn?: LookupFn
): Promise<WebhookDeliveryResult> {
  const t0 = Date.now();
  const resolveFn = lookupFn ?? (await import("node:dns/promises").then((m) => m.lookup as unknown as LookupFn));

  // SSRF check — re-resolves DNS before each delivery
  let validatedUrl: string;
  try {
    validatedUrl = await resolveAndValidateUrl(url, resolveFn);
  } catch (err) {
    return {
      ok: false,
      latencyMs: Date.now() - t0,
      error: err instanceof Error ? err.message : String(err),
    };
  }

  const body = JSON.stringify({ ...event.payload, type: event.type });
  const headers = buildWebhookHeaders(secret, body);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(validatedUrl, {
      method: "POST",
      headers,
      body,
      signal: controller.signal,
      redirect: "error",  // SSRF: never follow redirects
    });

    return {
      ok: res.ok,
      statusCode: res.status,
      latencyMs: Date.now() - t0,
    };
  } catch (err) {
    return {
      ok: false,
      latencyMs: Date.now() - t0,
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    clearTimeout(timer);
  }
}
