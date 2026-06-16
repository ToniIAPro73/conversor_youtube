# Spec — Anclora FileStudio Service (EARS)

## Core

**CORE-01** WHEN una operación de conversión se ejecuta en modo Desktop,
THE SYSTEM SHALL funcionar sin Redis, PostgreSQL ni Docker.

**CORE-02** WHEN una operación de conversión se ejecuta en modo Service,
THE SYSTEM SHALL usar la misma lógica de dominio (packages/core) que el Desktop.

**CORE-03** IF el catálogo de formatos o de operaciones cambia,
THE SYSTEM SHALL reflejar ese cambio en ambos modos sin modificación adicional.

## API

**API-01** WHEN una aplicación autorizada crea un job válido,
THE SYSTEM SHALL devolver un jobId sin bloquear hasta finalizar la conversión.

**API-02** WHILE un job está en ejecución,
THE SYSTEM SHALL permitir consultar su estado y solicitar cancelación.

**API-03** IF una dependencia de motor no está disponible,
THE SYSTEM SHALL rechazar el job antes de colocarlo en cola (422, no 5xx).

**API-04** WHEN se recibe una petición con Idempotency-Key ya procesada con el mismo payload,
THE SYSTEM SHALL devolver la misma respuesta que la primera vez.

**API-05** WHEN se recibe una petición con Idempotency-Key ya procesada con payload diferente,
THE SYSTEM SHALL responder 409 Conflict.

**API-06** WHERE el modo Service esté activo y los secretos sean inseguros o ausentes,
THE SYSTEM SHALL fallar con exit(1) antes de aceptar conexiones.

## Jobs

**JOB-01** WHEN un job completa exitosamente,
THE SYSTEM SHALL marcar estado `completed` SOLO después de validar el artefacto de salida.

**JOB-02** IF el resultado de una conversión no pasa validación de magic bytes y hash,
THE SYSTEM SHALL marcar el job como `failed` (no `completed`).

**JOB-03** WHEN se solicita cancelación de un job en estado `processing`,
THE SYSTEM SHALL intentar cancelación y marcar `cancelling` → `cancelled`.

**JOB-04** WHILE un job existe y no ha expirado,
THE SYSTEM SHALL emitir eventos de progreso vía SSE a los suscriptores.

## Queue

**QUEUE-01** WHEN un worker muere con un job en lease,
THE SYSTEM SHALL reasignar el job a otro worker tras expirar el lease.

**QUEUE-02** WHEN un job falla 3 veces consecutivas,
THE SYSTEM SHALL moverlo a dead-letter queue y no reintentarlo automáticamente.

**QUEUE-03** WHERE múltiples workers consuman la misma cola,
THE SYSTEM SHALL garantizar que cada job es procesado por exactamente un worker a la vez.

## Worker

**WORKER-01** WHEN un worker adquiere un job,
THE SYSTEM SHALL preparar un directorio de trabajo aislado antes de ejecutar el motor.

**WORKER-02** AFTER un job completa (éxito o fallo),
THE SYSTEM SHALL eliminar el directorio de trabajo temporal.

**WORKER-03** IF el tiempo de procesamiento supera el timeout configurado,
THE SYSTEM SHALL terminar el proceso del motor y marcar el job como `failed`.

## Storage

**STORE-01** WHEN se sube un archivo,
THE SYSTEM SHALL calcular y almacenar su hash SHA-256.

**STORE-02** WHEN un cliente solicita descargar un artefacto,
THE SYSTEM SHALL requerir un token de descarga one-use con TTL de 15 minutos.

**STORE-03** WHEN expira el TTL de un artefacto,
THE SYSTEM SHALL eliminarlo del storage y marcarlo como `deleted` en DB.

## Auth

**AUTH-01** WHEN se recibe una petición sin JWT válido,
THE SYSTEM SHALL responder 401 (no revelar si el recurso existe).

**AUTH-02** WHEN un JWT tiene scope insuficiente para la operación solicitada,
THE SYSTEM SHALL responder 403.

**AUTH-03** WHEN el cliente tiene estado `suspended` o `revoked`,
THE SYSTEM SHALL rechazar todos sus tokens con 403.

**AUTH-04** WHERE un cliente A intenta acceder a un recurso del cliente B,
THE SYSTEM SHALL responder 404 (no revelar existencia).

## Webhooks

**HOOK-01** WHEN FileStudio entrega un webhook,
THE SYSTEM SHALL firmar el payload con HMAC-SHA256 y timestamp.

**HOOK-02** IF la URL de webhook resuelve a una IP privada, loopback o metadata endpoint,
THE SYSTEM SHALL rechazar la entrega con error SSRF.

**HOOK-03** WHEN un webhook falla 5 veces consecutivas,
THE SYSTEM SHALL moverlo a dead-letter y notificar al cliente.

## SDK

**SDK-01** WHEN un desarrollador instala el SDK y configura credenciales,
THE SYSTEM SHALL permitir crear uploads y jobs con menos de 10 líneas de código.

**SDK-02** WHEN una petición falla con 5xx retryable,
THE SYSTEM SHALL reintentar automáticamente con backoff exponencial.

**SDK-03** WHEN se pasa un AbortSignal,
THE SYSTEM SHALL cancelar la petición en curso y rechazar la promise.

## Nexus

**NEXUS-01** WHEN Nexus crea un job en FileStudio Service,
THE SYSTEM SHALL entregar el resultado al endpoint webhook registrado por Nexus.

**NEXUS-02** WHEN Nexus especifica `idempotencyKey` para un job,
THE SYSTEM SHALL garantizar que el mismo key produce el mismo jobId.

## Agent

**AGENT-01** WHERE el Local Agent está activo,
THE SYSTEM SHALL funcionar sin abrir ningún puerto entrante.

**AGENT-02** WHEN el agente recibe un job asignado,
THE SYSTEM SHALL mostrar al usuario la información completa antes de ejecutar (policy=ask-always).

**AGENT-03** IF el agente recibe una operación no en su lista de capacidades,
THE SYSTEM SHALL rechazar el job sin ejecutarlo.

**AGENT-04** AFTER el agente completa o falla un job,
THE SYSTEM SHALL eliminar todos los archivos temporales locales.

## VPS

**VPS-01** WHEN el Service arranca en producción,
THE SYSTEM SHALL verificar conexión a PostgreSQL, Redis, migraciones y claves antes de declararse listo.

**VPS-02** WHERE puertos de red están en Docker Compose,
THE SYSTEM SHALL exponer solo 80 y 443 al exterior; el resto en red interna.

## Observabilidad

**OBS-01** WHEN se procesa cualquier job,
THE SYSTEM SHALL registrar: duration, operation, status, client_id (pseudonimizado), sin contenido de archivo.

**OBS-02** WHERE hay errores de auth o rate limit,
THE SYSTEM SHALL incrementar contadores Prometheus correspondientes.

## Seguridad

**SEC-01** IF un archivo subido no pasa validación de magic bytes,
THE SYSTEM SHALL rechazarlo con 422 y no procesarlo.

**SEC-02** WHERE los workers ejecutan motores externos,
THE SYSTEM SHALL usar shell: false en todos los spawns.

**SEC-03** IF una URL de webhook apunta a IP privada o loopback,
THE SYSTEM SHALL rechazarla con error explícito (no silencioso).

## Desktop

**DESK-01** WHERE el modo Desktop esté activo,
THE SYSTEM SHALL funcionar sin Redis, PostgreSQL ni Docker.

**DESK-02** AFTER cualquier cambio en packages/core,
THE SYSTEM SHALL pasar todos los tests existentes del Desktop sin modificación.
