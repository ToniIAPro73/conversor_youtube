import { serve } from "@hono/node-server";
import { CONFIG } from "./config.js";
import { createApp } from "./app.js";

const app = createApp({
  jwtPublicKeysPath: CONFIG.jwtPublicKeysPath,
  jwtAudience: CONFIG.jwtAudience,
  jwtIssuer: CONFIG.jwtIssuer,
});

serve(
  {
    fetch: app.fetch,
    hostname: CONFIG.bindHost,
    port: CONFIG.port,
  },
  (info) => {
    console.log(`[anclora-filestudio-api] listening on ${info.address}:${info.port}`);
  }
);
