import type { Context, Next } from "hono";
import { createMiddleware } from "hono/factory";
import { importSPKI, jwtVerify, type JWTPayload } from "jose";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

export interface ServiceClaims extends JWTPayload {
  client_id: string;
  scopes: string[];
  sub: string; // workspace_id
}

export interface AuthContext {
  claims: ServiceClaims;
}

const _keyCache = new Map<string, Promise<CryptoKey>>();

async function resolveKey(kid: string | undefined, keysPath: string): Promise<CryptoKey> {
  const files = readdirSync(keysPath).filter((f) => f.endsWith(".pem"));
  const candidates = kid ? files.filter((f) => f.startsWith(kid)) : files;
  if (candidates.length === 0) {
    throw new Error(`No public key found for kid=${kid ?? "any"} in ${keysPath}`);
  }
  const pem = readFileSync(join(keysPath, candidates[0]!), "utf-8");
  const cacheKey = candidates[0]!;
  if (!_keyCache.has(cacheKey)) {
    _keyCache.set(cacheKey, importSPKI(pem, "EdDSA").catch(() => importSPKI(pem, "RS256")));
  }
  return _keyCache.get(cacheKey)!;
}

export const authMiddleware = (keysPath: string, audience: string) =>
  createMiddleware(async (c: Context, next: Next) => {
    const authHeader = c.req.header("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return c.json({ type: "about:blank", title: "Unauthorized", status: 401, code: "AUTH_INVALID_TOKEN" }, 401);
    }
    const token = authHeader.slice(7);

    try {
      // Peek at header to get kid
      const parts = token.split(".");
      if (parts.length !== 3) throw new Error("malformed");
      const header = JSON.parse(Buffer.from(parts[0]!, "base64url").toString()) as { kid?: string; alg?: string };
      const publicKey = await resolveKey(header.kid, keysPath);

      const { payload } = await jwtVerify(token, publicKey, {
        audience,
        clockTolerance: 30, // seconds tolerance for clock skew
      });

      const claims = payload as ServiceClaims;
      if (!claims.client_id || !Array.isArray(claims.scopes)) {
        throw new Error("missing required claims");
      }

      c.set("auth", { claims } satisfies AuthContext);
      await next();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "unknown";
      const code = msg.includes("expir") ? "AUTH_EXPIRED_TOKEN" : "AUTH_INVALID_TOKEN";
      return c.json({ type: "about:blank", title: "Unauthorized", status: 401, code }, 401);
    }
  });

export function requireScope(scope: string) {
  return createMiddleware(async (c: Context, next: Next) => {
    const auth = c.get("auth") as AuthContext | undefined;
    if (!auth) {
      return c.json({ type: "about:blank", title: "Unauthorized", status: 401, code: "AUTH_INVALID_TOKEN" }, 401);
    }
    if (!auth.claims.scopes.includes(scope) && !auth.claims.scopes.includes("filestudio:admin")) {
      return c.json({
        type: "about:blank",
        title: "Forbidden",
        status: 403,
        code: "AUTH_INSUFFICIENT_SCOPE",
        detail: `Required scope: ${scope}`,
      }, 403);
    }
    await next();
  });
}
