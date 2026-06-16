// Anclora FileStudio — Local Agent entrypoint
// Outbound HTTPS only. No inbound ports. No Docker required.
import { z } from "zod";
import os from "node:os";
import type { AgentConfig, AgentCredentials, AgentCapabilities } from "./types.js";
import { PairingFlow, HttpPairingTransport } from "./pairing.js";
import { ConsentEngine, ConsoleConsentUI } from "./consent.js";
import { AgentJobPoller } from "./poll.js";
import { EncryptedFileCredentialStore } from "./credential-store.js";
import { HttpTokenTransport, RotatingTokenManager } from "./tokens.js";
import { LocalOperationRegistry } from "./operations.js";

// ── Config ────────────────────────────────────────────────────────────────────

const ConfigSchema = z.object({
  ANCLORA_AGENT_SERVER_URL: z.string().url(),
  ANCLORA_AGENT_DEVICE_NAME: z.string().default(os.hostname()),
  ANCLORA_AGENT_POLICY: z.enum(["ask-always", "allow-approved-operations", "disabled"]).default("ask-always"),
  ANCLORA_AGENT_MAX_FILE_BYTES: z.coerce.number().int().default(100 * 1024 * 1024), // 100 MB
  ANCLORA_AGENT_MAX_CONCURRENT: z.coerce.number().int().default(1),
  ANCLORA_AGENT_APPROVED_OPS: z.string().default(""),
  ANCLORA_AGENT_STORE_PATH: z.string().default(`${os.homedir()}/.anclora/filestudio-agent/credentials.json`),
  ANCLORA_AGENT_STORE_KEY: z.string().optional(),
});

function loadConfig() {
  const result = ConfigSchema.safeParse(process.env);
  if (!result.success) {
    console.error("[agent] Invalid configuration:", result.error.flatten());
    process.exit(1);
  }
  return result.data;
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────

async function main() {
  const env = loadConfig();
  const VERSION = "0.2.0";

  const agentConfig: AgentConfig = {
    deviceName: env.ANCLORA_AGENT_DEVICE_NAME,
    platform: process.platform,
    arch: process.arch,
    version: VERSION,
    policy: env.ANCLORA_AGENT_POLICY,
    approvedOperations: env.ANCLORA_AGENT_APPROVED_OPS
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean),
    maxFileSizeBytes: env.ANCLORA_AGENT_MAX_FILE_BYTES,
    maxConcurrent: env.ANCLORA_AGENT_MAX_CONCURRENT,
  };

  console.log(`[agent] Anclora FileStudio Local Agent v${VERSION}`);
  console.log(`[agent] Policy: ${agentConfig.policy}`);
  console.log(`[agent] Server: ${env.ANCLORA_AGENT_SERVER_URL}`);

  const storeKey = env.ANCLORA_AGENT_STORE_KEY;
  if (!storeKey) {
    console.error("[agent] Missing ANCLORA_AGENT_STORE_KEY. Portable fallback storage is encrypted and must be explicitly enabled with a strong key.");
    process.exit(1);
  }
  const credentialStore = new EncryptedFileCredentialStore(env.ANCLORA_AGENT_STORE_PATH, storeKey);

  const transport = new HttpPairingTransport(env.ANCLORA_AGENT_SERVER_URL);
  const pairingFlow = new PairingFlow(agentConfig, transport);

  let credentials: AgentCredentials;
  let stored = await credentialStore.load();
  if (stored) {
    credentials = stored.credentials;
    console.log(`[agent] Loaded stored device credentials for ${credentials.deviceId}`);
  } else {
    try {
      const result = await pairingFlow.run();
      credentials = {
        ...result.credentials,
        serverBaseUrl: env.ANCLORA_AGENT_SERVER_URL,
      };
      stored = { credentials, privateKeyPem: result.privateKeyPem };
      await credentialStore.save(stored);
      console.log(`[agent] Paired. DeviceId: ${credentials.deviceId}`);
    } catch (err) {
      console.error(`[agent] Pairing failed: ${err instanceof Error ? err.message : String(err)}`);
      process.exit(1);
    }
  }

  // ── Capabilities ────────────────────────────────────────────────────────────
  const operationRegistry = new LocalOperationRegistry();
  const capabilities: AgentCapabilities = await operationRegistry.capabilities(agentConfig, credentials.deviceId, "idle");

  // ── Start polling ────────────────────────────────────────────────────────────
  const consentEngine = new ConsentEngine(agentConfig, new ConsoleConsentUI());
  const tokenRefresher = new RotatingTokenManager(
    credentials,
    credentialStore,
    new HttpTokenTransport(env.ANCLORA_AGENT_SERVER_URL)
  );
  const poller = new AgentJobPoller(credentials, consentEngine, capabilities, tokenRefresher, operationRegistry);

  poller.start();
  console.log(`[agent] Polling for jobs…`);

  async function shutdown(signal: string) {
    console.log(`[agent] ${signal} — stopping…`);
    await poller.stop();
    process.exit(0);
  }

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

main().catch((err) => {
  console.error("[agent] Fatal:", err);
  process.exit(1);
});
