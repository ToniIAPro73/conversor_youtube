// Redis-backed sliding window rate limiter.
// Uses a sorted set per client+endpoint; score = timestamp in ms.
import { createMiddleware } from "hono/factory";
import { randomBytes } from "node:crypto";
import type { Redis } from "ioredis";

interface RateLimitOptions {
  windowMs: number;   // window size in milliseconds
  max: number;        // max requests per window
  keyPrefix?: string; // namespace for Redis keys
}

const DEFAULT_PREFIX = "ratelimit";

export function rateLimitMiddleware(redis: Redis, opts: RateLimitOptions) {
  return createMiddleware(async (c, next) => {
    // Key: clientId from JWT claims, or IP as fallback
    const auth = c.get("auth") as { claims?: { client_id?: string } } | undefined;
    const clientId = auth?.claims?.client_id ?? c.req.header("X-Forwarded-For") ?? "anon";
    const key = `${opts.keyPrefix ?? DEFAULT_PREFIX}:${clientId}`;

    const now = Date.now();
    const windowStart = now - opts.windowMs;

    const pipe = redis.pipeline();
    // Remove expired entries
    pipe.zremrangebyscore(key, "-inf", windowStart);
    // Add current request
    pipe.zadd(key, now, `${now}-${randomBytes(4).toString("hex")}`);
    // Count requests in window
    pipe.zcard(key);
    // Set key expiry
    pipe.pexpire(key, opts.windowMs * 2);

    const results = await pipe.exec();
    const count = (results?.[2]?.[1] as number) ?? 0;

    c.res.headers.set("X-RateLimit-Limit", String(opts.max));
    c.res.headers.set("X-RateLimit-Remaining", String(Math.max(0, opts.max - count)));
    c.res.headers.set("X-RateLimit-Reset", String(Math.ceil((now + opts.windowMs) / 1000)));

    if (count > opts.max) {
      return c.json({
        type: "about:blank",
        title: "Too Many Requests",
        status: 429,
        code: "QUOTA_EXCEEDED",
        detail: `Rate limit exceeded. Retry after ${Math.ceil(opts.windowMs / 1000)}s.`,
      }, 429);
    }

    await next();
  });
}
