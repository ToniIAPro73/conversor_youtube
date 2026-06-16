import type { AuthContext } from "./middleware/auth.js";

declare module "hono" {
  interface ContextVariableMap {
    auth: AuthContext;
    agentDevice: unknown;
    readinessChecker: () => Promise<Record<string, boolean>>;
    jobService: unknown;
    uploadService: unknown;
    eventBus: unknown;
  }
}
