import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { authMiddleware } from "./middleware/auth.js";
import { createHealthRouter } from "./routes/health.js";
import { createJobsRouter } from "./routes/jobs.js";
import { createUploadsRouter } from "./routes/uploads.js";

interface AppOptions {
  jwtPublicKeysPath: string;
  jwtAudience: string;
  jwtIssuer?: string;
}

export function createApp(options: AppOptions): Hono {
  const app = new Hono();

  // Global middleware
  app.use("*", logger());

  // No CORS for private API — only internal clients (Nexus, workers)
  // If needed for dev tools, restrict to known origins only
  if (process.env.ANCLORA_FILESTUDIO_ENV === "development") {
    app.use("/api/v1/*", cors({ origin: "http://localhost:3000" }));
  }

  // Public routes (no auth)
  app.route("/api/v1", createHealthRouter());

  // Protected routes
  const v1 = new Hono();
  v1.use("*", authMiddleware(options.jwtPublicKeysPath, options.jwtAudience));
  v1.route("/uploads", createUploadsRouter());
  v1.route("/jobs", createJobsRouter());

  app.route("/api/v1", v1);

  // 404 fallback
  app.notFound((c) =>
    c.json({ type: "about:blank", title: "Not Found", status: 404, code: "JOB_NOT_FOUND" }, 404)
  );

  // Error handler — never expose stack traces in production
  app.onError((err, c) => {
    const isProd = process.env.ANCLORA_FILESTUDIO_ENV === "production";
    console.error("[unhandled error]", isProd ? err.message : err);
    return c.json({
      type: "about:blank",
      title: "Internal Server Error",
      status: 500,
      code: "ENGINE_EXECUTE_FAILED",
      detail: isProd ? "An internal error occurred." : err.message,
    }, 500);
  });

  return app;
}
