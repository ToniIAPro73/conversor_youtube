# Security Model — Anclora FileStudio Service

## Principios

1. **Fail closed** — ante duda, denegar.
2. **Zero trust interno** — cada componente valida su entrada independientemente.
3. **Secretos nunca en código** — variables de entorno o archivos montados.
4. **Superficie mínima** — puertos públicos solo 80 y 443; todo lo demás en red interna.
5. **Principio de menor privilegio** — workers sin root, capacidades Linux eliminadas.

## Autenticación servicio a servicio

### Modelo JWT asimétrico

```
Nexus (o app autorizada)
  │  genera JWT firmado con su clave privada
  ▼
FileStudio Service
  │  valida firma con clave pública registrada
  │  valida: iss, aud, exp, iat, jti, scopes, client_id
  ▼
Request autorizado
```

### Claims obligatorios

| Claim | Valor esperado |
|---|---|
| `iss` | ID del cliente registrado (e.g. `anclora-nexus`) |
| `aud` | `anclora-filestudio-service` |
| `sub` | workspace o tenant ID |
| `exp` | máx. 1 hora desde emisión |
| `iat` | timestamp UTC |
| `jti` | UUID único por token (para revocación) |
| `scopes` | array de scopes concedidos |
| `client_id` | ID del cliente de servicio |

### Algoritmos soportados

- **EdDSA (Ed25519)** — recomendado
- **RS256** — compatible con proveedores legacy

### Rotación de claves

- Cada cliente tiene hasta 2 claves activas simultáneas (para rotación sin downtime).
- Clave identificada por `kid` en cabecera JWT.
- Revocación: marcar cliente como `suspended` en DB; validación falla con 403.

### Tolerancia temporal

- `exp` se verifica estrictamente.
- `iat` tolerancia de ±30 segundos para desfase de reloj.
- `nbf` soportado si presente.

## Scopes

| Scope | Operaciones permitidas |
|---|---|
| `filestudio:operations:read` | GET /capabilities, GET /operations |
| `filestudio:uploads:create` | POST /uploads |
| `filestudio:jobs:create` | POST /jobs |
| `filestudio:jobs:read` | GET /jobs/*, GET /jobs/*/events |
| `filestudio:jobs:cancel` | POST /jobs/*/cancel |
| `filestudio:results:read` | POST /jobs/*/result-token, GET /jobs/*/result |
| `filestudio:webhooks:manage` | CRUD /webhook-endpoints |
| `filestudio:admin` | Todos los anteriores + admin endpoints |

## Seguridad de archivos

### Validaciones en subida

1. Magic bytes contra tipo declarado.
2. MIME real via `file-type`.
3. Extensión contra lista blanca de formatos permitidos.
4. Doble extensión rechazada (e.g. `doc.pdf.exe`).
5. Tamaño contra límite del cliente.
6. Hash SHA-256 calculado y almacenado.

### Validaciones en conversión

1. Path safety: `path.resolve + path.relative` en todos los paths.
2. No symlinks en directorios de trabajo.
3. Nombre de archivo sanitizado: solo alfanumérico, guiones, puntos.
4. Archives: ratio de expansión limitado (máx. 50x), conteo de entradas limitado.
5. Path traversal en archives: rechazado si entrada contiene `..` o path absoluto.

### Sandbox de workers

- Usuario sin root (`uid=1000`).
- `no-new-privileges: true`.
- Capabilities Linux eliminadas (solo `CAP_CHOWN` si necesario).
- Seccomp: perfil por defecto Docker.
- Red restringida: workers sin acceso a Internet general.
- Filesystem: solo `/work` y `/artifacts` montados, resto read-only.
- CPU y memoria limitados por cgroup (Docker).
- Timeout por job (configurable, defecto 1200s).

## Webhooks — protección SSRF

1. Solo URLs HTTPS.
2. Lista blanca de protocolos.
3. DNS resuelto con bloqueo de IP privadas (RFC 1918 + loopback + link-local + metadata).
4. Re-resolución DNS en cada entrega (protección DNS rebinding).
5. Timeout de conexión: 10 segundos.
6. Timeout de respuesta: 30 segundos.
7. Sin redirecciones (follow_redirects=false).

### Firma de webhooks

```
X-Anclora-Signature: sha256=<HMAC-SHA256(secret, rawBody)>
X-Anclora-Timestamp: <unix_timestamp>
X-Anclora-Event-Id: <uuid>
```

El receptor verifica: `HMAC-SHA256(secret, timestamp + "." + rawBody)`.
Rechaza si timestamp tiene más de 5 minutos de antigüedad.

## Secretos y configuración

### Prohibido

- `.env` versionado con valores reales.
- Tokens o claves en logs.
- Claves privadas en imágenes Docker.
- Credenciales por defecto en producción.
- Contraseñas "changeme", "secret", "password", "default".

### Valores inseguros detectados al arrancar

Si `ANCLORA_FILESTUDIO_MODE=service` y algún secreto contiene valor inseguro,
el proceso termina con `exit(1)` antes de aceptar conexiones.

### Almacenamiento de secretos

- Variables de entorno (desarrollo/CI).
- Docker secrets montados como archivos (producción VPS).
- Adaptador para gestor externo (Vault, AWS Secrets Manager) — interfaz definida.

## Token de descarga

El token de descarga de artefactos sigue el mismo patrón que el Desktop:
- Token raw generado con `crypto.randomBytes(32)`.
- Solo el hash SHA-256 se almacena en PostgreSQL.
- Token válido 15 minutos, single-use (invalidado al usarse).
- Scope por job y por cliente.

## Rate limiting

Implementado en Hono middleware, persistido en Redis.

Límites por defecto (configurables por cliente):

| Dimensión | Límite defecto |
|---|---|
| Peticiones totales/minuto | 60 |
| Jobs creados/minuto | 10 |
| Jobs simultáneos activos | 5 |
| Bytes subidos/día | 5 GB |
| Tamaño máximo por archivo | 500 MB |
| Duración máxima de job | 1200s |

## Audit trail

Tabla `audit_events` en PostgreSQL:
- Todo acceso autenticado.
- Creación/transición de jobs.
- Errores de autenticación/autorización.
- Operaciones admin.

Campos: `id, client_id, workspace_id, event_type, resource_id, ip_hash, user_agent_hash,
timestamp, metadata`.

IP y user-agent se almacenan como hash SHA-256 (pseudonimización).
