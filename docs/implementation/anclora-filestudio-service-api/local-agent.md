# Local Agent — Anclora FileStudio

## Objetivo

Permitir que Nexus asigne trabajos de conversión a un equipo local autorizado, sin que ese
equipo abra puertos entrantes ni dependa de Docker.

## Estado implementado en subfase 5.5

- Pairing Ed25519 con código de un solo uso, expiración y aprobación/rechazo administrativa.
- Access token de vida corta y refresh token rotatorio.
- Detección de reutilización de refresh token con revocación del dispositivo.
- `CredentialStore` en memoria para tests y fallback portable cifrado AES-256-GCM con permisos `0600`.
- Capabilities calculadas a partir de probes reales del catálogo local del agente.
- Ejecución real para `data.json-to-yaml`, `data.yaml-to-json` y operación Sharp opcional `image.png-to-webp`.
- Descarga de input con cabecera `X-Agent-Input-Token`, validación de `Content-Length` y SHA-256.
- Upload de resultado con `X-Content-Sha256` y confirmación de hash.
- Limpieza de directorio temporal tras éxito o error.
- Smoke test HTTP local que cubre capabilities, job, descarga, conversión real, upload y confirmación.

## Modelo de seguridad

- Solo conexiones HTTPS **salientes**.
- Sin puertos entrantes.
- Registro y emparejamiento explícito con intervención del usuario.
- Consentimiento requerido por defecto en cada job.
- Revocación inmediata desde Nexus.

## Flujo de emparejamiento (pairing)

```
1. Usuario abre Local Agent UI y pulsa "Conectar con Nexus"
2. Agent genera par de claves efímeras (Ed25519)
3. Agent solicita código de emparejamiento a Nexus:
   POST /api/v1/agent-pairing-requests
   { publicKey, deviceName, platform, arch, version }
4. Nexus devuelve código de 6 dígitos (TTL: 10 min)
5. Administrador introduce el código en Nexus UI para autorizar
6. Agent hace polling cada 2s durante 10 min:
   GET /api/v1/agent-pairing-requests/{requestId}/status
7. Al autorizar: Nexus devuelve credenciales limitadas (JWT de 1h, refresh token)
8. Agent almacena credenciales cifradas localmente
9. Pairing completado — Agent comienza polling de trabajos
```

## Polling de trabajos

```
Agent → GET /api/v1/agent/jobs/available (long-poll, timeout 30s)
  Si hay trabajo:
    1. Mostrar al usuario (si policy=ask-always)
    2. Usuario aprueba/rechaza
    3. Agent acepta lease: POST /api/v1/agent/jobs/{id}/accept
    4. Descargar input: GET /api/v1/agent/jobs/{id}/input?token=...
    5. Ejecutar conversión localmente (engines existentes)
    6. Subir resultado: PUT /api/v1/agent/jobs/{id}/result
    7. Confirmar hash: POST /api/v1/agent/jobs/{id}/confirm
    8. Eliminar temporales locales
  Si no hay trabajo:
    Long-poll timeout → reintentar
```

## Políticas de ejecución

| Política | Comportamiento |
|---|---|
| `ask-always` | Muestra diálogo para cada job; usuario aprueba/rechaza |
| `allow-approved-operations` | Auto-aprueba operaciones en lista blanca; pide para nuevas |
| `disabled` | No acepta ningún job (modo pausa) |

Defecto: `ask-always`. No existe ejecución silenciosa por defecto.

## Información mostrada al usuario antes de aprobar

- Organización solicitante
- Aplicación solicitante
- Operación a ejecutar
- Nombre del archivo y tamaño
- Política de retención del resultado
- Opción de rechazar este job
- Opción de pausar el agente
- Opción de desvincular

## Capacidades publicadas al Service

```json
{
  "deviceId": "dev_01...",
  "platform": "win32",
  "arch": "x64",
  "version": "0.2.0",
  "operations": ["image.png-to-webp", "image.remove-background"],
  "engineVersions": { "ffmpeg": "7.1", "sharp": "0.35.1" },
  "limits": { "maxFileSizeBytes": 104857600, "maxConcurrent": 1 },
  "load": 0.12,
  "freeDiskBytes": 21474836480,
  "status": "idle",
  "lastSeen": "2026-06-16T10:30:00Z"
}
```

**No publicado:** rutas de archivos locales, nombres de usuario del SO, otros procesos.

## Operaciones permitidas

El servidor solo puede enviar al agente:

- `operation`: ID de operación registrada en `OPERATION_CATALOG`.
- `options`: opciones validadas contra `optionsSchema` de la operación.
- `input`: referencia de archivo (token temporal, no URL arbitraria).
- `limits`: CPU, memoria, tiempo máximo.

El agente **rechaza** cualquier job con:
- Operación no en su lista de capacidades.
- Opciones que no pasan validación Zod.
- Token de input expirado.
- Tamaño de archivo sobre su límite.

## Seguridad del agente

- Credenciales almacenadas cifradas en keychain del SO (Windows Credential Manager / Linux Secret Service).
- Refresh token rotado en cada uso.
- Token de acceso con TTL de 1h.
- Revocación: marcar device como `revoked` en Nexus → próxima solicitud devuelve 401 → agente muestra estado "desvinculado".
- Sin acceso remoto a comandos arbitrarios.
- Limpieza de temporales garantizada al completar o cancelar cada job.

## Plataformas

- Windows x64 (portable .exe o instalador)
- Linux x64 (AppImage o binario portable)
- Sin Docker, sin Node.js requerido por el usuario (bundled runtime)

## UI del agente

Ventana de bandeja del sistema (tray) con:
- Estado: conectado / desconectado / procesando
- Último job procesado
- Historial local (últimas 24h)
- Opciones: pausar, desconectar, configuración
- Log de actividad en tiempo real
