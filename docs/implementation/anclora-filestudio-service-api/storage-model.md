# Storage Model — Anclora FileStudio Service

## Abstracción

```typescript
interface ArtifactStorage {
  put(input: PutArtifactInput): Promise<StoredArtifact>;
  open(key: string): Promise<Readable>;
  stat(key: string): Promise<ArtifactMetadata>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
  createDownloadToken(key: string, ttl: Duration): Promise<string>;
}

interface PutArtifactInput {
  stream: Readable;
  filename: string;
  mimeType: string;
  expectedSize?: number;
  expectedSha256?: string;
}

interface StoredArtifact {
  key: string;
  sha256: string;
  sizeBytes: number;
}
```

## Adaptadores

### `LocalFilesystemStorage` (Desktop)

- Base: `CONFIG.media.tempDir` (`.tmp/media` por defecto).
- Validación: `ensurePathSafety()` en todos los paths.
- Sin concurrencia de red.

### `SharedFilesystemStorage` (Service — VPS inicial)

- Base: volumen Docker montado en `/var/lib/anclora-filestudio/artifacts`.
- Accesible por `api` y `worker` a través del mismo volumen.
- Key format: `{jobId}/{filename}`.
- Permisos: `api` escribe uploads, `worker` escribe artefactos de salida.
- No requiere S3 — adecuado para VPS monónodo.

### `S3CompatibleStorage` (Service — escalado)

- Compatible con AWS S3, MinIO, Backblaze B2, Cloudflare R2.
- Presigned URLs para descarga directa (opcional, sin pasar por API).
- Interfaz idéntica — migración sin cambio de API pública.
- Configurado via `ANCLORA_FILESTUDIO_STORAGE_DRIVER=s3-compatible`.

## Directorios de trabajo

Cada job en Service tiene workspace aislado:

```
/var/lib/anclora-filestudio/work/{jobId}/
├── input/       — archivo de entrada (descargado del upload)
├── output/      — artefacto generado
├── tmp/         — archivos temporales del motor
└── logs/        — logs del motor
```

Permisos: creados por worker con `0700`. Eliminados al completar el job o en limpieza.

## Políticas de retención

Configurables por variable de entorno (Service) o `CONFIG` (Desktop):

| Elemento | TTL defecto | Configurable |
|---|---|---|
| Upload | 60 min | `ANCLORA_FILESTUDIO_UPLOAD_TTL_MINUTES` |
| Job (completado) | 60 min | `ANCLORA_FILESTUDIO_JOB_TTL_MINUTES` |
| Artefacto | 60 min | `ANCLORA_FILESTUDIO_ARTIFACT_TTL_MINUTES` |
| Job (fallido) | 7 días | `ANCLORA_FILESTUDIO_FAILED_JOB_RETENTION_DAYS` |
| Token de descarga | 15 min | `ANCLORA_FILESTUDIO_DOWNLOAD_TOKEN_TTL_MINUTES` |
| Audit events | 90 días | `ANCLORA_FILESTUDIO_AUDIT_RETENTION_DAYS` |
| Webhook history | 30 días | fijo |

## Limpieza

### Service

Job `maintenance` en BullMQ, ejecutado cada 15 minutos:

1. Listar jobs con `expires_at < NOW()` y `deleted_at IS NULL`.
2. Para cada job: eliminar artefactos del storage, marcar `deleted_at`.
3. Listar uploads huérfanos (sin job activo, `expires_at < NOW()`).
4. Listar tokens expirados en `job_artifacts`.
5. Limpiar `idempotency_keys` expirados.
6. Limpiar `usage_counters` con `window_start < NOW() - 7 days`.
7. Publicar métricas: `cleanup_deleted_total`.

Garantías:
- Idempotente (puede ejecutarse varias veces sin efectos).
- No elimina si el job tiene `status IN ('processing', 'leased')`.
- No falla si el archivo ya no existe en storage (error ignorado, `deleted_at` actualizado).

### Desktop

`cleanup.ts` existente — sin cambios. Ejecutado al arrancar y periódicamente.

## Hash y validación de integridad

1. El upload calcula SHA-256 del stream en tiempo real.
2. Hash almacenado en `uploads.sha256`.
3. Worker verifica hash del input antes de procesar.
4. Worker calcula hash del output y lo almacena en `job_artifacts.sha256`.
5. El cliente puede verificar el hash del artefacto descargado.

## Cuotas de disco

En Service:
- `ANCLORA_FILESTUDIO_MAX_UPLOAD_BYTES` por archivo (defecto 500 MB).
- `ANCLORA_FILESTUDIO_BYTES_PER_DAY_PER_CLIENT` (defecto 5 GB).
- Check previo al procesamiento: `disk-space-check.ts` portado a Service.
