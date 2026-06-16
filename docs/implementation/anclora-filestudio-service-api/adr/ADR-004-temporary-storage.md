# ADR-004: Temporary Storage Strategy

## Estado: Aceptado

## Contexto

Los artefactos de conversión (inputs, outputs, temporales) necesitan ser accesibles tanto por
la API (para upload y descarga) como por el worker (para procesamiento). En Desktop, todo ocurre
en el mismo proceso con filesystem local. En Service con workers separados, se necesita storage
compartido.

## Decisión

Implementar tres adaptadores de `ArtifactStorage`:

1. **`LocalFilesystemStorage`** — Desktop. Base en `.tmp/media`. Sin cambios.

2. **`SharedFilesystemStorage`** — Service inicial en VPS. Volumen Docker compartido entre
   `api` y `worker` montado en `/var/lib/anclora-filestudio/artifacts`. Sin coste adicional,
   sin latencia de red, suficiente para VPS monónodo.

3. **`S3CompatibleStorage`** — Service escalado. Compatible con MinIO, AWS S3, R2.
   Interface idéntica — migración sin cambio de API.

La selección se hace vía `ANCLORA_FILESTUDIO_STORAGE_DRIVER`.

## Consecuencias

**Positivo:**
- Desktop continúa sin cambios.
- VPS inicial sin dependencia de S3 (volumen Docker suficiente).
- Migración a S3 es un cambio de configuración, no de código.

**Negativo:**
- `SharedFilesystemStorage` no es compatible con múltiples VPS — requiere migrar a S3.
- Volumen Docker necesita backups independientes.

## Alternativas descartadas

- **S3 desde el inicio:** Overhead de configuración y coste innecesario para MVP en VPS único.
- **PostgreSQL BYTEA:** No almacenar archivos binarios en la base de datos.
