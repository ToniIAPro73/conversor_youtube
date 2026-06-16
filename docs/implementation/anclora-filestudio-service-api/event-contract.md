# Event Contract — Anclora FileStudio Service

## Canales

### SSE (Server-Sent Events)

```
GET /api/v1/jobs/{jobId}/events
```

Requiere `filestudio:jobs:read`. El stream se cierra cuando el job llega a estado terminal.

Formato de evento:

```
event: job.progress
data: {"jobId":"job_01...","status":"processing","progress":45,"stage":"encoding","timestamp":"2026-06-16T10:30:05Z"}

event: job.completed
data: {"jobId":"job_01...","status":"completed","progress":100,"artifactId":"art_01...","timestamp":"2026-06-16T10:30:12Z"}
```

### Webhooks

Los webhooks se entregan a endpoints registrados con firma HMAC-SHA256.

## Eventos

### `job.queued`

```json
{
  "eventId": "evt_01...",
  "eventType": "job.queued",
  "jobId": "job_01...",
  "status": "queued",
  "operation": "document.docx-to-pdf",
  "createdAt": "2026-06-16T10:30:00Z",
  "timestamp": "2026-06-16T10:30:00Z"
}
```

### `job.started`

```json
{
  "eventId": "evt_01...",
  "eventType": "job.started",
  "jobId": "job_01...",
  "status": "processing",
  "workerId": "worker-01",
  "timestamp": "2026-06-16T10:30:01Z"
}
```

### `job.progress`

```json
{
  "eventId": "evt_01...",
  "eventType": "job.progress",
  "jobId": "job_01...",
  "status": "processing",
  "progress": 45,
  "stage": "converting",
  "timestamp": "2026-06-16T10:30:05Z"
}
```

### `job.completed`

```json
{
  "eventId": "evt_01...",
  "eventType": "job.completed",
  "jobId": "job_01...",
  "status": "completed",
  "artifactId": "art_01...",
  "outputFilename": "documento.pdf",
  "sizeBytes": 184320,
  "sha256": "a1b2c3...",
  "durationMs": 11200,
  "timestamp": "2026-06-16T10:30:12Z"
}
```

### `job.failed`

```json
{
  "eventId": "evt_01...",
  "eventType": "job.failed",
  "jobId": "job_01...",
  "status": "failed",
  "errorCode": "ENGINE_UNAVAILABLE",
  "errorTitle": "Motor no disponible",
  "retryable": false,
  "timestamp": "2026-06-16T10:30:02Z"
}
```

### `job.cancelled`

```json
{
  "eventId": "evt_01...",
  "eventType": "job.cancelled",
  "jobId": "job_01...",
  "status": "cancelled",
  "requestedBy": "api",
  "timestamp": "2026-06-16T10:32:00Z"
}
```

### `artifact.expiring`

Enviado 24h antes de que expire un artefacto.

```json
{
  "eventId": "evt_01...",
  "eventType": "artifact.expiring",
  "jobId": "job_01...",
  "artifactId": "art_01...",
  "expiresAt": "2026-06-17T10:30:12Z",
  "timestamp": "2026-06-16T10:30:12Z"
}
```

## Idempotencia de webhooks

- Cada evento tiene `eventId` único.
- El receptor debe deduplicar por `eventId`.
- En caso de fallo, FileStudio reintenta con backoff exponencial (1s, 2s, 4s, 8s, 16s).
- Dead-letter tras 5 intentos fallidos.
- Reentrega autorizada mediante endpoint admin.

## Verificación de firma

```
signature = HMAC-SHA256(secret, timestamp + "." + rawBody)
```

El receptor:
1. Extrae `X-Anclora-Timestamp` y `X-Anclora-Signature`.
2. Verifica que `|now - timestamp| < 300s`.
3. Calcula `expected = HMAC-SHA256(secret, timestamp + "." + rawBody)`.
4. Compara `expected === X-Anclora-Signature` con comparación de tiempo constante.
5. Responde 2xx si acepta, cualquier otra cosa dispara reintento.
