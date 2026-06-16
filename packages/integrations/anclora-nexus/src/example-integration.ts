// Example: Nexus integrating with Anclora FileStudio Service
// Shows the complete flow: upload → job → wait → download
// This is a reference implementation — not production Nexus code.

import { AncloraFileStudioClient } from "@anclora/filestudio-sdk";
import { NexusRoutingPolicy } from "./routing-policy.js";
import type { RoutingRequest } from "@anclora/filestudio-core";

// ── Setup ─────────────────────────────────────────────────────────────────────

const client = new AncloraFileStudioClient({
  baseUrl: process.env.FILESTUDIO_BASE_URL ?? "https://filestudio.anclora.internal",
  clientId: "anclora-nexus",
  tokenProvider: async () => {
    // In production, Nexus generates a JWT signed with its Ed25519 private key
    const token = process.env.FILESTUDIO_SERVICE_TOKEN;
    if (!token) throw new Error("FILESTUDIO_SERVICE_TOKEN is required");
    return token;
  },
});

const routingPolicy = new NexusRoutingPolicy();

// ── Example: Convert document ─────────────────────────────────────────────────

export async function convertDocument(
  fileBuffer: Buffer,
  filename: string,
  mimeType: string,
  classification: RoutingRequest["classification"],
  workspaceId: string,
  documentId: string,
  version: number
): Promise<{ pdfBuffer: Buffer; sha256: string }> {

  // 1. Routing decision
  const decision = await routingPolicy.decide({
    operation: "document.docx-to-pdf",
    fileSizeBytes: fileBuffer.byteLength,
    mimeType,
    classification,
    workspaceId,
    clientId: "anclora-nexus",
    userConsent: true,
    availableRoutes: ["private-service", "local-agent"],
    metadata: {},
  });

  if (decision.target === "reject" || decision.target === "require-human-approval") {
    throw new Error(`Routing rejected: ${decision.reason}`);
  }

  console.log(`[nexus] Routing → ${decision.target}: ${decision.reason}`);

  // 2. Upload file
  const upload = await client.uploads.create(new Blob([new Uint8Array(fileBuffer)], { type: mimeType }), { filename, mimeType });
  console.log(`[nexus] Upload created: ${upload.id}`);

  // 3. Create conversion job
  const job = await client.jobs.create({
    operation: "document.docx-to-pdf",
    uploadId: upload.id,
    options: { quality: "standard" },
    idempotencyKey: `nexus-${documentId}-v${version}`,
    metadata: {
      sourceApplication: "anclora-nexus",
      workspaceId,
      correlationId: `doc-${documentId}`,
    },
  });
  console.log(`[nexus] Job created: ${job.jobId} (${job.status})`);

  // 4. Wait for completion (polling fallback if no webhook)
  const result = await client.jobs.waitForCompletion(job.jobId, { timeoutMs: 120_000, pollIntervalMs: 2_000 });
  console.log(`[nexus] Job completed: ${result.jobId}`);

  // 5. Download result
  const artifact = await client.jobs.downloadResult(result.jobId);
  const chunks: Uint8Array[] = [];
  const reader = artifact.stream.getReader();
  let done = false;
  while (!done) {
    const { value, done: d } = await reader.read();
    if (value) chunks.push(value);
    done = d;
  }
  const pdfBuffer = Buffer.concat(chunks);

  console.log(`[nexus] Downloaded ${pdfBuffer.length} bytes, sha256=${artifact.sha256}`);

  return { pdfBuffer, sha256: artifact.sha256 };
}

// ── Example: Register webhook endpoint ───────────────────────────────────────

export async function registerWebhookEndpoint(nexusBaseUrl: string): Promise<string> {
  const res = await fetch(`${process.env.FILESTUDIO_BASE_URL}/api/v1/webhook-endpoints`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.FILESTUDIO_SERVICE_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      url: `${nexusBaseUrl}/webhooks/filestudio`,
      events: ["job.*", "artifact.*"],
    }),
  });
  const data = await res.json() as { id: string };
  console.log(`[nexus] Webhook endpoint registered: ${data.id}`);
  return data.id;
}
