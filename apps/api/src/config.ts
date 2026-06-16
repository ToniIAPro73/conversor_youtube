import { z } from "zod";

const INSECURE_VALUES = new Set(["changeme", "default", "secret", "password", "example", ""]);

function assertSecure(name: string, value: string): void {
  if (INSECURE_VALUES.has(value.toLowerCase()) || value.length < 8) {
    throw new Error(
      `[STARTUP FATAL] Environment variable ${name} has an insecure or missing value. ` +
      `Set a strong secret before starting in service mode.`
    );
  }
}

const ServiceConfigSchema = z.object({
  mode: z.literal("service"),
  env: z.enum(["development", "production", "test"]).default("production"),
  publicBaseUrl: z.string().url(),
  bindHost: z.string().default("0.0.0.0"),
  port: z.coerce.number().int().min(1).max(65535).default(8080),
  databaseUrl: z.string().min(10),
  redisUrl: z.string().min(10),
  storageDriver: z.enum(["shared-filesystem", "s3-compatible"]).default("shared-filesystem"),
  storageRoot: z.string().default("/var/lib/anclora-filestudio/artifacts"),
  workRoot: z.string().default("/var/lib/anclora-filestudio/work"),
  jwtIssuer: z.string().min(1),
  jwtAudience: z.string().min(1).default("anclora-filestudio-service"),
  jwtPublicKeysPath: z.string().min(1),
  webhookSigningKeyFile: z.string().optional(),
  uploadMaxBytes: z.coerce.number().int().default(524_288_000),
  jobTtlMinutes: z.coerce.number().int().default(60),
  artifactTtlMinutes: z.coerce.number().int().default(60),
  maxConcurrentJobs: z.coerce.number().int().default(10),
  logLevel: z.enum(["trace", "debug", "info", "warn", "error"]).default("info"),
});

function loadServiceConfig() {
  const parsed = ServiceConfigSchema.safeParse({
    mode: process.env.ANCLORA_FILESTUDIO_MODE,
    env: process.env.ANCLORA_FILESTUDIO_ENV,
    publicBaseUrl: process.env.ANCLORA_FILESTUDIO_PUBLIC_BASE_URL,
    bindHost: process.env.ANCLORA_FILESTUDIO_BIND_HOST,
    port: process.env.ANCLORA_FILESTUDIO_PORT,
    databaseUrl: process.env.ANCLORA_FILESTUDIO_DATABASE_URL,
    redisUrl: process.env.ANCLORA_FILESTUDIO_REDIS_URL,
    storageDriver: process.env.ANCLORA_FILESTUDIO_STORAGE_DRIVER,
    storageRoot: process.env.ANCLORA_FILESTUDIO_STORAGE_ROOT,
    workRoot: process.env.ANCLORA_FILESTUDIO_WORK_ROOT,
    jwtIssuer: process.env.ANCLORA_FILESTUDIO_JWT_ISSUER,
    jwtAudience: process.env.ANCLORA_FILESTUDIO_JWT_AUDIENCE,
    jwtPublicKeysPath: process.env.ANCLORA_FILESTUDIO_JWT_PUBLIC_KEYS_PATH,
    webhookSigningKeyFile: process.env.ANCLORA_FILESTUDIO_WEBHOOK_SIGNING_KEY_FILE,
    uploadMaxBytes: process.env.ANCLORA_FILESTUDIO_UPLOAD_MAX_BYTES,
    jobTtlMinutes: process.env.ANCLORA_FILESTUDIO_JOB_TTL_MINUTES,
    artifactTtlMinutes: process.env.ANCLORA_FILESTUDIO_ARTIFACT_TTL_MINUTES,
    maxConcurrentJobs: process.env.ANCLORA_FILESTUDIO_MAX_CONCURRENT_JOBS,
    logLevel: process.env.ANCLORA_FILESTUDIO_LOG_LEVEL,
  });

  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`[STARTUP FATAL] Invalid service configuration:\n${issues}`);
  }

  const cfg = parsed.data;

  // Fail closed on insecure values in production
  if (cfg.env === "production") {
    assertSecure("ANCLORA_FILESTUDIO_DATABASE_URL", cfg.databaseUrl);
    assertSecure("ANCLORA_FILESTUDIO_REDIS_URL", cfg.redisUrl);
    assertSecure("ANCLORA_FILESTUDIO_JWT_ISSUER", cfg.jwtIssuer);
  }

  return cfg;
}

export type ServiceConfig = z.infer<typeof ServiceConfigSchema>;
export const CONFIG: ServiceConfig = loadServiceConfig();
