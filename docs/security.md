# Seguridad — Anclora FileStudio

## Modelo de seguridad

Anclora FileStudio procesa archivos localmente. Los principios de seguridad son:

1. **Local-first**: Ningún archivo se envía a servicios externos.
2. **Shell: false**: Todos los procesos externos se ejecutan sin shell para prevenir inyección.
3. **Path safety**: Todas las rutas se validan con `path.resolve` + `path.relative`.
4. **Listas blancas**: Los formatos de salida se validan contra listas blancas explícitas.
5. **Tokens rotativos**: Los enlaces de descarga expiran y son de un solo uso.
6. **Sandboxed temp**: Los archivos temporales se escriben solo en directorios aprobados.

## Ejecución de procesos externos

La versión Web en Vercel no ejecuta procesos externos. Las herramientas de
imágenes, PDF y datos estructurados se ejecutan en el navegador y no importan
motores nativos ni rutas Desktop.

Todos los `spawn()` en el codebase usan:

```typescript
spawn(binaryPath, args, {
  shell: false,
  windowsHide: true,
  timeout: timeoutMs,
})
```

Nunca se concatenan argumentos del usuario como strings. Los valores de usuario (formatos,
duraciones, páginas) se validan contra enumeraciones antes de pasarlos como array de args.

## Path safety

La función `ensurePathSafety()` en `src/lib/security/path-safety.ts`:

```typescript
const resolved = path.resolve(allowedDir, requestedPath);
const relative = path.relative(allowedDir, resolved);
if (relative.startsWith("..") || path.isAbsolute(relative)) {
  throw new Error("Path traversal detected");
}
```

No se usa `startsWith()` directamente sobre rutas sin normalizar, que es inseguro
con paths Unicode o normalizaciones inconsistentes.

## Límites de recursos

| Recurso | Límite | Configurable |
|---|---|---|
| Tamaño de archivo ebook | 50 MB | No |
| Páginas para OCR | 50 páginas | No |
| Ratio de expansión de archivo | 100x | No |
| Número de entradas en archivo | 10 000 | No |
| Timeout de conversión | Ver `.env` | Sí via `CONVERSION_TIMEOUT_SECONDS` |
| Jobs concurrentes | Ver `.env` | Sí via `MAX_CONCURRENT_JOBS` |

## Tokens de descarga

Los tokens de descarga de archivos procesados:

- Son generados como bytes aleatorios criptográficamente seguros
- Solo el hash SHA-256 se almacena en la base de datos
- Expiran tras 15 minutos (configurable via `DOWNLOAD_TOKEN_TTL_MINUTES`)
- Son de un solo uso: invalidados al primer acceso
- Nunca aparecen en logs del servidor

## Validación de archivos de entrada

Antes de procesar cualquier archivo, el sistema verifica:

1. **Magic bytes**: El tipo real del archivo coincide con su extensión declarada
2. **Tamaño**: El archivo no supera el límite para su categoría
3. **Extensión**: La extensión está en la lista de formatos admitidos
4. **MIME**: El MIME declarado coincide con el detectado

## Rutas temporales

Los archivos temporales se escriben en:

- `ANCLORA_FILESTUDIO_TEMP_DIR` (portable): directorio configurado en el paquete
- `data/tmp/` (desarrollo): directorio dentro del proyecto

Los archivos temporales se limpian:

- Al completarse un job
- Al cancelarse un job
- Al expirar el TTL del job
- En el arranque de la aplicación (archivos huérfanos del inicio anterior)

## Disclosure

Para reportar vulnerabilidades de seguridad, contacta al equipo de Anclora
a través del repositorio oficial antes de hacer pública la información.
