import { Hono } from "hono";

const VERSION = process.env.npm_package_version ?? "0.2.0";

export function createHealthRouter(): Hono {
  const app = new Hono();

  app.get("/health", (c) =>
    c.json({
      ok: true,
      app: "anclora-filestudio-service",
      version: VERSION,
      timestamp: new Date().toISOString(),
    })
  );

  // /ready performs dependency checks — injected via context
  app.get("/ready", async (c) => {
    const checks: Record<string, boolean> = {
      api: true,
    };

    // Postgres and Redis checks are injected by the server on startup
    const readinessChecker = c.get("readinessChecker") as (() => Promise<Record<string, boolean>>) | undefined;
    if (readinessChecker) {
      const depChecks = await readinessChecker().catch(() => ({ postgres: false, redis: false }));
      Object.assign(checks, depChecks);
    }

    const allReady = Object.values(checks).every(Boolean);
    const status = allReady ? 200 : 503;

    return c.json(
      { ok: allReady, checks, timestamp: new Date().toISOString() },
      status
    );
  });

  return app;
}
