# Threat Model — Anclora FileStudio Service

## Activos a proteger

1. Archivos de usuarios (contenido confidencial)
2. Artefactos generados
3. Claves JWT de clientes de servicio
4. Clave HMAC de webhooks
5. Credenciales PostgreSQL y Redis
6. Tokens de descarga
7. Datos de audit trail
8. Capacidades de dispositivos locales

## Amenazas

### A-01: Archivo malicioso

| Campo | Valor |
|---|---|
| Actor | Cliente malicioso o comprometido |
| Vector | Subida de archivo con payload malicioso (macro, exploit de parser) |
| Impacto | RCE en worker, exfiltración de datos |
| Mitigación | Magic bytes, MIME real, extensión lista blanca, sanitización nombre, workers aislados (no-root, seccomp, red restringida), timeout |
| Test | `tests/security/file-upload.test.ts` |
| Riesgo residual | Bajo — exploits 0-day en parsers externos no cubiertos |

### A-02: Zip bomb / expansión

| Campo | Valor |
|---|---|
| Actor | Atacante externo o cliente |
| Vector | Archive comprimido con ratio >1000x |
| Impacto | DoS por agotamiento de disco |
| Mitigación | Límite de ratio (50x), límite de entradas (1000), límite de disco por job |
| Test | `tests/security/zip-bomb.test.ts` |
| Riesgo residual | Bajo |

### A-03: Path traversal

| Campo | Valor |
|---|---|
| Actor | Cliente malicioso |
| Vector | Ruta de archivo con `../` o absoluta en input/output |
| Impacto | Lectura/escritura fuera del workspace |
| Mitigación | `ensurePathSafety()` en todos los paths; rechazo de symlinks; nombre sanitizado |
| Test | `tests/security/path-safety.test.ts` (existente) |
| Riesgo residual | Muy bajo |

### A-04: Command injection

| Campo | Valor |
|---|---|
| Actor | Cliente malicioso |
| Vector | Parámetros de conversión con metacaracteres de shell |
| Impacto | Ejecución de comandos arbitrarios |
| Mitigación | `shell: false` en todos los spawns; validación Zod de opciones; arglist explícita |
| Test | `tests/security/command-injection.test.ts` |
| Riesgo residual | Muy bajo |

### A-05: SSRF (webhooks)

| Campo | Valor |
|---|---|
| Actor | Atacante que controla una cuenta de servicio |
| Vector | Registrar webhook URL apuntando a servicio interno (e.g. `http://postgres/`) |
| Impacto | Acceso a servicios internos, metadata endpoints |
| Mitigación | Resolución DNS con bloqueo RFC 1918; solo HTTPS; no follow redirects; timeout 10s |
| Test | `tests/security/ssrf-webhook.test.ts` |
| Riesgo residual | Bajo |

### A-06: Replay de token JWT

| Campo | Valor |
|---|---|
| Actor | Atacante con token robado |
| Vector | Reuso de JWT después de su emisión |
| Impacto | Acceso no autorizado |
| Mitigación | `exp` máx. 1h; `jti` único; revocación por `client_id` en DB |
| Test | `tests/security/auth.test.ts` |
| Riesgo residual | Bajo — ventana de 1h si token robado antes de expirar |

### A-16: Reutilización de código de pairing

| Campo | Valor |
|---|---|
| Activo | Registro de dispositivos locales |
| Actor | Atacante con acceso al código temporal |
| Vector | Reusar código después de aprobación/rechazo |
| Impacto | Vinculación fraudulenta de dispositivo |
| Mitigación | Estado terminal `authorized/rejected/expired`, código hasheado, límite de intentos |
| Test | `apps/api/tests/agent.test.ts`, `apps/local-agent/tests/pairing.test.ts` |
| Riesgo residual | Bajo |

### A-17: Robo o reutilización de refresh token del Local Agent

| Campo | Valor |
|---|---|
| Activo | Credenciales del dispositivo |
| Actor | Malware local o atacante con copia de credenciales |
| Vector | Reutilizar refresh token ya rotado |
| Impacto | Sesión persistente no autorizada |
| Mitigación | Refresh rotatorio, hash server-side, detección de reutilización y revocación del dispositivo |
| Test | `apps/api/tests/agent.test.ts`, `apps/local-agent/tests/tokens.test.ts` |
| Riesgo residual | Medio hasta integrar keychain nativo |

### A-18: Comando arbitrario desde Service hacia Local Agent

| Campo | Valor |
|---|---|
| Activo | Equipo corporativo donde corre el agente |
| Actor | Service comprometido o job malicioso |
| Vector | Enviar binario, argumentos o ruta local arbitraria |
| Impacto | Ejecución remota o exfiltración |
| Mitigación | El agente acepta solo `operationId` registrado, opciones JSON validadas y referencias temporales; no acepta rutas ni nombres de binario |
| Test | `apps/local-agent/tests/operations.test.ts`, `apps/local-agent/tests/consent.test.ts` |
| Riesgo residual | Bajo |

### A-07: Escape de tenant / workspace

| Campo | Valor |
|---|---|
| Actor | Cliente A accede a recursos de cliente B |
| Vector | Adivinar/manipular jobId de otro cliente |
| Impacto | Acceso no autorizado a datos |
| Mitigación | Toda query filtra por `client_id` del JWT; IDs son ULIDs (no predecibles) |
| Test | `tests/security/tenant-isolation.test.ts` |
| Riesgo residual | Muy bajo |

### A-08: Descarga no autorizada

| Campo | Valor |
|---|---|
| Actor | Tercero con jobId |
| Vector | GET /jobs/{id}/result sin token de descarga |
| Impacto | Acceso a artefacto |
| Mitigación | Token de descarga one-use, 15 min TTL, solo hash en DB; requiere JWT válido para obtenerlo |
| Test | `tests/security/download-token.test.ts` |
| Riesgo residual | Muy bajo |

### A-09: Worker comprometido

| Campo | Valor |
|---|---|
| Actor | Atacante con acceso al worker |
| Vector | Worker modificado que exfiltra archivos |
| Impacto | Exposición de archivos de usuarios |
| Mitigación | Worker sin acceso a Internet (red Docker interna); archivos eliminados después de procesamiento; SBOM de imagen |
| Test | Validación de red en CI |
| Riesgo residual | Medio — si el host Docker está comprometido, los volúmenes son accesibles |

### A-10: Secretos filtrados en logs

| Campo | Valor |
|---|---|
| Actor | Desarrollador descuidado |
| Vector | Log de cabeceras HTTP o variables de entorno |
| Impacto | Exposición de JWT, HMAC secrets |
| Mitigación | `pino` con redact: `['req.headers.authorization', '*.secret*', '*.key*', '*.token*']`; tests de log |
| Test | `tests/security/log-redaction.test.ts` |
| Riesgo residual | Bajo |

### A-11: Pairing fraudulento (Local Agent)

| Campo | Valor |
|---|---|
| Actor | Atacante con acceso físico o a la sesión de usuario |
| Vector | Iniciar pairing y convencer al admin de autorizar |
| Impacto | Control de conversiones en equipo víctima |
| Mitigación | Código de pairing 6 dígitos con TTL 10 min; autorización explícita en Nexus UI; muestra dispositivo claramente |
| Test | `tests/security/agent-pairing.test.ts` |
| Riesgo residual | Medio — depende de procedimientos operativos |

### A-12: DoS por jobs infinitos

| Campo | Valor |
|---|---|
| Actor | Cliente que abusa de la API |
| Vector | Enviar jobs que nunca terminan |
| Impacto | Saturación de workers |
| Mitigación | Timeout por job (configurable, defecto 1200s); límite de jobs simultáneos por cliente; dead-letter tras 3 intentos |
| Test | `tests/security/rate-limit.test.ts` |
| Riesgo residual | Bajo |

### A-13: Supply chain

| Campo | Valor |
|---|---|
| Actor | Dependencia NPM maliciosa |
| Vector | Paquete comprometido en node_modules |
| Impacto | RCE, exfiltración |
| Mitigación | `pnpm audit`; `--frozen-lockfile`; SBOM por imagen; imagen base fijada con digest; sin devDependencies en runtime |
| Test | `pnpm audit:licenses` en CI |
| Riesgo residual | Medio — inherente al ecosistema NPM |

### A-14: DNS rebinding (webhooks)

| Campo | Valor |
|---|---|
| Actor | Atacante que controla DNS de un dominio |
| Vector | Registro A legítimo → cambia a IP interna |
| Impacto | SSRF vía webhook |
| Mitigación | Re-resolver DNS en cada entrega; verificar IP contra blocklist en cada intento |
| Test | `tests/security/ssrf-webhook.test.ts` |
| Riesgo residual | Bajo |

### A-15: Colisión de idempotency key

| Campo | Valor |
|---|---|
| Actor | Atacante con acceso al mismo cliente |
| Vector | Misma key con payload diferente |
| Impacto | Respuesta diferente o confusión de estado |
| Mitigación | Hash del payload almacenado; si key existe y hash difiere → 409; si hash igual → respuesta previa |
| Test | `tests/security/idempotency.test.ts` |
| Riesgo residual | Muy bajo |
