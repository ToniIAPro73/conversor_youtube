# Nexus Integration — Anclora FileStudio

## Modelo de integración

Nexus actúa como gateway central: gestiona identidad, permisos y trazabilidad.
FileStudio Service no conoce a los usuarios finales — solo conoce clientes de servicio.

## Estado implementado en subfase 5.5

- Paquete `@anclora/filestudio-nexus` incluido en workspace.
- Política de routing configurable con rechazo de `restricted` sin aprobación humana.
- `confidential` no cae al VPS salvo habilitación explícita `allowConfidentialPrivateService`.
- Mock server de contrato aislado en `src/mock-server`, con comparación estricta de bearer token, IDs criptográficos e idempotencia por hash de payload.
- Fixtures y pruebas de contrato para uploads, jobs, result tokens, errores e idempotencia.
- Documentación pública en `docs/integrations/anclora-nexus/*`.

```
Usuario final → Nexus → FileStudio Service → Worker → FileStudio Service → Nexus → Usuario final
```

## Credenciales de Nexus

Nexus recibe un `service_client` en FileStudio con scopes:

```
filestudio:operations:read
filestudio:uploads:create
filestudio:jobs:create
filestudio:jobs:read
filestudio:jobs:cancel
filestudio:results:read
filestudio:webhooks:manage
```

Nexus genera JWTs firmados con su clave privada (Ed25519).
FileStudio valida con la clave pública de Nexus (registrada en `service_client_keys`).

## Flujo de conversión desde Nexus

```typescript
// 1. Nexus genera JWT de servicio
const token = await generateServiceToken({
  iss: "anclora-nexus",
  aud: "anclora-filestudio-service",
  sub: workspaceId,
  scopes: ["filestudio:uploads:create", "filestudio:jobs:create", "filestudio:results:read"],
  exp: Date.now() / 1000 + 3600,
});

// 2. Subir archivo
const upload = await fileStudioClient.uploads.create(fileBuffer, {
  filename: "documento.docx",
  mimeType: "application/vnd.openxmlformats-...",
});

// 3. Crear job
const job = await fileStudioClient.jobs.create({
  operation: "document.docx-to-pdf",
  input: { uploadId: upload.id },
  options: { quality: "standard" },
  callback: { webhookEndpointId: nexusWebhookId },
  idempotencyKey: `nexus-${documentId}-v${version}`,
  metadata: { sourceApplication: "anclora-nexus", workspaceId, correlationId },
});

// 4. Nexus registra jobId en su DB y responde al usuario

// 5. Cuando FileStudio complete, envía webhook a Nexus
// 6. Nexus procesa el resultado y notifica al usuario
```

## Política de routing (responsabilidad de Nexus)

FileStudio no decide dónde procesar — Nexus decide.

```typescript
const decision = await routingPolicy.decide({
  operation: "document.docx-to-pdf",
  fileSizeBytes: 245760,
  classification: "internal",
  workspaceId,
  userConsent: true,
  availableRoutes: ["private-service", "local-agent"],
});
// → { route: "private-service", reason: "default-for-documents" }
```

## Webhook de Nexus

FileStudio entrega eventos al endpoint HTTPS de Nexus:

```
POST https://nexus.anclora.internal/webhooks/filestudio
Content-Type: application/json
X-Anclora-Signature: sha256=...
X-Anclora-Timestamp: 1750073460
X-Anclora-Event-Id: evt_01...

{ "eventType": "job.completed", "jobId": "job_01...", ... }
```

Nexus registra el endpoint al iniciar la integración:

```
POST /api/v1/webhook-endpoints
{ "url": "https://nexus.anclora.internal/webhooks/filestudio", "events": ["job.*"] }
```

## SDK TypeScript para Nexus

```typescript
import { AncloraFileStudioClient } from "@anclora/filestudio-sdk";

const client = new AncloraFileStudioClient({
  baseUrl: "https://filestudio.anclora.internal",
  clientId: "anclora-nexus",
  tokenProvider: async () => generateServiceToken(),
});

// Upload
const upload = await client.uploads.create(stream, { filename, mimeType });

// Job
const job = await client.jobs.create({ operation, uploadId: upload.id, options });

// Polling (alternativa a webhook)
const result = await client.jobs.waitForCompletion(job.id, { timeoutMs: 120_000 });

// Descarga streaming
const artifact = await client.jobs.downloadResult(job.id);
artifact.stream.pipe(destinationStream);
// artifact.sha256 para verificación
```

## Mapeo de errores

| FileStudio error | HTTP | Nexus maneja como |
|---|---|---|
| `OPERATION_UNAVAILABLE` | 422 | Motor no disponible — notificar usuario |
| `UPLOAD_TOO_LARGE` | 413 | Archivo demasiado grande |
| `QUOTA_EXCEEDED` | 429 | Cuota diaria agotada |
| `JOB_CANCELLED` | — | Job cancelado por usuario |
| `ENGINE_TIMEOUT` | — | Retryable, 1 reintento automático |
| `ENGINE_FAILED` | — | Error de motor, notificar usuario |

## Contrato de Local Agent para Nexus

Nexus puede especificar `preferredRoute: "local-agent"` en metadatos del job.
FileStudio Service asigna el job a la cola del agente local.
El agente hace polling, descarga, convierte, sube.
El resultado es indistinguible de un job procesado en VPS.

## Fixtures y mock server

`packages/integrations/anclora-nexus/` incluye:

- `mock-server/` — servidor Hono que simula FileStudio Service para tests de Nexus
- `fixtures/` — requests y responses de ejemplo para cada endpoint
- `tests/` — tests de contrato bidireccionales
- `example-integration.ts` — integración completa de referencia
