# API Contract — Anclora FileStudio Service v1

## Base URL

```
https://<host>/api/v1
```

Todas las rutas requieren autenticación salvo `/health` y `/ready`.

## Autenticación

```
Authorization: Bearer <JWT>
```

JWT firmado asimétricamente (EdDSA o RS256). Ver `security-model.md`.

## Cabeceras comunes

| Cabecera | Dirección | Descripción |
|---|---|---|
| `Authorization` | Request | Bearer JWT |
| `Idempotency-Key` | Request | UUID v4, scope por cliente |
| `X-Correlation-Id` | Request/Response | Trazabilidad |
| `Content-Type` | Request | `application/json` o `multipart/form-data` |
| `X-Anclora-Client-Id` | Response | Client ID del token validado |

## Endpoints

### Health

```
GET /api/v1/health
```
Sin autenticación. Responde `{ ok: true, app: "anclora-filestudio-service", version }`.

```
GET /api/v1/ready
```
Sin autenticación. Verifica PostgreSQL, Redis, migraciones, claves, almacenamiento.
Responde 200 si listo, 503 si no.

### Capacidades y operaciones

```
GET /api/v1/capabilities
GET /api/v1/operations
```

Scope requerido: `filestudio:operations:read`

### Subidas

```
POST /api/v1/uploads          — Subida directa multipart/form-data
GET  /api/v1/uploads/{id}     — Metadatos del upload
DELETE /api/v1/uploads/{id}   — Eliminar upload (si no tiene jobs activos)
```

Scope: `filestudio:uploads:create`

Respuesta POST:
```json
{
  "id": "upl_01jxx...",
  "filename": "documento.docx",
  "mimeType": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "sizeBytes": 245760,
  "sha256": "a1b2c3...",
  "expiresAt": "2026-06-16T12:00:00Z",
  "status": "ready"
}
```

### Jobs

```
POST   /api/v1/jobs              — Crear job
GET    /api/v1/jobs/{id}         — Estado del job
POST   /api/v1/jobs/{id}/cancel  — Solicitar cancelación
GET    /api/v1/jobs/{id}/events  — SSE stream de progreso
POST   /api/v1/jobs/{id}/result-token  — Token de descarga (one-use, 15 min)
GET    /api/v1/jobs/{id}/result  — Descargar artefacto (requiere token)
DELETE /api/v1/jobs/{id}         — Marcar para eliminación
```

Scopes: `filestudio:jobs:create`, `filestudio:jobs:read`, `filestudio:jobs:cancel`,
`filestudio:results:read`

Request POST /jobs:
```json
{
  "operation": "document.docx-to-pdf",
  "input": { "uploadId": "upl_01..." },
  "options": { "quality": "standard" },
  "callback": { "webhookEndpointId": "wh_01..." },
  "idempotencyKey": "nexus-doc-82731-v2",
  "metadata": {
    "sourceApplication": "anclora-nexus",
    "workspaceId": "ws_01...",
    "correlationId": "corr_01..."
  }
}
```

Respuesta:
```json
{
  "jobId": "job_01...",
  "status": "queued",
  "operation": "document.docx-to-pdf",
  "createdAt": "2026-06-16T10:30:00Z",
  "links": {
    "self": "/api/v1/jobs/job_01...",
    "events": "/api/v1/jobs/job_01.../events"
  }
}
```

### Estados de job

```
created → validating → queued → leased → processing
processing → completed | partial_failure | failed | cancelling → cancelled
created/queued/leased/processing → cancelling → cancelled
completed/failed/cancelled → expired → deleted
```

Transiciones inválidas son rechazadas con 409.

### Batches

```
POST /api/v1/batches              — Crear batch
GET  /api/v1/batches/{id}         — Estado del batch
POST /api/v1/batches/{id}/cancel  — Cancelar batch
```

### Webhooks

```
POST   /api/v1/webhook-endpoints          — Registrar endpoint
GET    /api/v1/webhook-endpoints          — Listar endpoints del cliente
DELETE /api/v1/webhook-endpoints/{id}     — Eliminar endpoint
```

Scope: `filestudio:webhooks:manage`

### Errores

Formato Problem Details (RFC 7807):

```json
{
  "type": "https://anclora.internal/problems/unsupported-operation",
  "title": "Operación no disponible",
  "status": 422,
  "code": "OPERATION_UNAVAILABLE",
  "detail": "La operación requiere LibreOffice (no disponible).",
  "correlationId": "corr_01..."
}
```

Códigos HTTP usados:

| Status | Uso |
|---|---|
| 200 | Éxito |
| 201 | Creado |
| 202 | Aceptado (job encolado) |
| 400 | Request inválido |
| 401 | Sin autenticación |
| 403 | Sin autorización o scope insuficiente |
| 404 | Recurso no encontrado |
| 409 | Conflicto (idempotencia con payload diferente, transición inválida) |
| 413 | Payload demasiado grande |
| 422 | Operación no procesable (dependencia ausente, formato inválido) |
| 429 | Rate limit |
| 500 | Error interno (sin stack trace en prod) |
| 503 | Servicio no listo |

## Rate limiting

Respuesta 429 incluye:
```
Retry-After: 30
X-RateLimit-Limit: 60
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1750073460
```
