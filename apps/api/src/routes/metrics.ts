import { Hono } from "hono";
import { metrics } from "../observability.js";

export function createMetricsRouter(): Hono {
  const app = new Hono();
  app.get("/metrics", (c) => c.text(metrics.renderPrometheus(), 200, { "Content-Type": "text/plain; version=0.0.4" }));
  return app;
}
