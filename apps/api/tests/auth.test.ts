// JWT auth middleware tests — uses generated EdDSA key pair (no fixtures needed)
import { describe, it, expect, beforeAll } from "vitest";
import { generateKeyPair, exportSPKI, exportPKCS8, SignJWT } from "jose";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Hono } from "hono";
import { authMiddleware, requireScope } from "../src/middleware/auth.js";

interface KeyPairFixture {
  keysDir: string;
  signKey: CryptoKey;
  audience: string;
}

let fixture: KeyPairFixture;

beforeAll(async () => {
  const { privateKey, publicKey } = await generateKeyPair("EdDSA");
  const spki = await exportSPKI(publicKey);

  const dir = mkdtempSync(`${tmpdir()}/anci-auth-test-`);
  writeFileSync(join(dir, "key-1.pem"), spki);

  fixture = { keysDir: dir, signKey: privateKey, audience: "anclora-filestudio-service" };
});

async function makeToken(
  claims: Record<string, unknown>,
  opts?: { kid?: string; audience?: string; expiresIn?: string }
): Promise<string> {
  return new SignJWT({ ...claims })
    .setProtectedHeader({ alg: "EdDSA", kid: opts?.kid ?? "key-1" })
    .setIssuedAt()
    .setAudience(opts?.audience ?? fixture.audience)
    .setExpirationTime(opts?.expiresIn ?? "1h")
    .sign(fixture.signKey);
}

function buildApp(): Hono {
  const app = new Hono();
  app.use("*", authMiddleware(fixture.keysDir, fixture.audience));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  app.get("/me", (c) => c.json((c.get("auth") as any).claims));
  return app;
}

describe("authMiddleware", () => {
  it("rejects request with no Authorization header", async () => {
    const res = await buildApp().request("/me");
    expect(res.status).toBe(401);
    const body = await res.json() as { code: string };
    expect(body.code).toBe("AUTH_INVALID_TOKEN");
  });

  it("rejects malformed token (not 3 parts)", async () => {
    const res = await buildApp().request("/me", {
      headers: { Authorization: "Bearer notavalidjwt" },
    });
    expect(res.status).toBe(401);
  });

  it("accepts valid EdDSA token and exposes claims", async () => {
    const token = await makeToken({ client_id: "cli_01", scopes: ["filestudio:jobs:read"] });
    const res = await buildApp().request("/me", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    const body = await res.json() as { client_id: string; scopes: string[] };
    expect(body.client_id).toBe("cli_01");
    expect(body.scopes).toContain("filestudio:jobs:read");
  });

  it("rejects wrong audience", async () => {
    const token = await makeToken(
      { client_id: "cli_01", scopes: [] },
      { audience: "wrong-service" }
    );
    const res = await buildApp().request("/me", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(401);
    const body = await res.json() as { code: string };
    expect(body.code).toBe("AUTH_INVALID_TOKEN");
  });

  it("returns AUTH_EXPIRED_TOKEN for expired token", async () => {
    // Build the token manually so we can set an absolute past expiry
    const expiredAt = Math.floor(Date.now() / 1000) - 120; // 2 min ago, outside 30s tolerance
    const token = await new (await import("jose")).SignJWT({ client_id: "cli_01", scopes: [] })
      .setProtectedHeader({ alg: "EdDSA", kid: "key-1" })
      .setIssuedAt(expiredAt - 10)
      .setExpirationTime(expiredAt)
      .setAudience(fixture.audience)
      .sign(fixture.signKey);
    const res = await buildApp().request("/me", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(401);
    const body = await res.json() as { code: string };
    expect(body.code).toBe("AUTH_EXPIRED_TOKEN");
  });

  it("rejects token signed with unknown kid", async () => {
    const token = await makeToken(
      { client_id: "cli_01", scopes: [] },
      { kid: "unknown-key-id" }
    );
    const res = await buildApp().request("/me", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(401);
  });

  it("rejects token missing required claims (client_id)", async () => {
    const token = await makeToken({ scopes: ["filestudio:jobs:read"] });
    const res = await buildApp().request("/me", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(401);
  });
});

describe("requireScope", () => {
  function buildScopedApp(scope: string): Hono {
    const app = new Hono();
    app.use("*", authMiddleware(fixture.keysDir, fixture.audience));
    app.get("/protected", requireScope(scope), (c) => c.json({ ok: true }));
    return app;
  }

  it("allows request with exact matching scope", async () => {
    const token = await makeToken({ client_id: "cli_01", scopes: ["filestudio:jobs:create"] });
    const res = await buildScopedApp("filestudio:jobs:create").request("/protected", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
  });

  it("allows request with admin scope regardless of specific scope", async () => {
    const token = await makeToken({ client_id: "cli_01", scopes: ["filestudio:admin"] });
    const res = await buildScopedApp("filestudio:jobs:create").request("/protected", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
  });

  it("rejects request with insufficient scope", async () => {
    const token = await makeToken({ client_id: "cli_01", scopes: ["filestudio:jobs:read"] });
    const res = await buildScopedApp("filestudio:jobs:create").request("/protected", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(403);
    const body = await res.json() as { code: string };
    expect(body.code).toBe("AUTH_INSUFFICIENT_SCOPE");
  });

  it("rejects unauthenticated request", async () => {
    const res = await buildScopedApp("filestudio:jobs:create").request("/protected");
    expect(res.status).toBe(401);
  });
});
