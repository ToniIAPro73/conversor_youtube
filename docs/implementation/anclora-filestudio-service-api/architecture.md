# Architecture — Anclora FileStudio Service

## Visión general

Anclora FileStudio es una plataforma **local-first** de conversión y procesamiento de archivos
que puede ejecutarse en el equipo del usuario o como servicio privado dentro de infraestructura
controlada.

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Anclora Ecosystem                            │
│                                                                     │
│  Anclora Nexus  ─────────────────────────────────┐                  │
│  (gateway, identidad, permisos, trazabilidad)    │                  │
│                                                  ▼                  │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │              Anclora FileStudio Service (VPS)                  │ │
│  │                                                                │ │
│  │  ┌─────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐   │ │
│  │  │  API v1 │  │ Worker   │  │PostgreSQL│  │    Redis     │   │ │
│  │  │  (Hono) │  │(BullMQ)  │  │          │  │  (BullMQ Q.) │   │ │
│  │  └────┬────┘  └────┬─────┘  └──────────┘  └──────────────┘   │ │
│  │       │            │                                           │ │
│  │       └────────────┴──── packages/core ◄── packages/engines   │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │            Anclora FileStudio Desktop (local)                │   │
│  │                                                              │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌─────────────────┐   │   │
│  │  │  Next.js UI  │  │ API routes   │  │  SQLite + local  │   │   │
│  │  │  (React 19)  │  │ (Next.js)    │  │  worker/queue   │   │   │
│  │  └──────────────┘  └──────────────┘  └─────────────────┘   │   │
│  │                                                              │   │
│  │       └──────────────── packages/core ◄── packages/engines  │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │          Anclora FileStudio Local Agent (optional)           │   │
│  │  Solo HTTPS saliente · Sin puertos entrantes                 │   │
│  │  Polling → descarga input → convierte localmente → sube      │   │
│  └──────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

## Módulos

### `packages/core`
Lógica de dominio pura — sin framework, sin DB, sin binarios externos.

**Contiene:**
- Catálogo de formatos (`format-catalog.ts`)
- Catálogo de operaciones (`operations.ts`)
- Descriptores de archivo (`descriptors.ts`)
- Perfiles de pérdida (`LossProfile`)
- Estados de job y transiciones válidas
- Interfaces de repositorio (`JobRepository`, `UploadRepository`, etc.)
- Interfaces de cola (`ConversionQueue`)
- Interfaces de almacenamiento (`ArtifactStorage`)
- Interfaces de motor (`ConversionEngine`)
- Tipos de resultado y error
- Validación de opciones con Zod
- Códigos de error tipados

**No importa:** React, Next.js, SQLite, PostgreSQL, Redis, Docker, APIs de navegador.

### `packages/engines`
Adaptadores de motores — implementan `ConversionEngine` del core.

**Motores:** ffmpeg-media, sharp-image, qpdf, sevenzip, pandoc, libreoffice, calibre,
tesseract, background-removal, data-ts.

**Registro:** `EngineRegistry` — singleton por proceso, probe cacheado 5 min.

### `packages/sdk`
Cliente TypeScript para consumidores externos (Nexus, otras apps).

**Ofrece:** `AncloraFileStudioClient` con uploads, jobs, batches, webhooks, events.

### `apps/api` (Service mode)
Servidor HTTP privado — Hono framework.

**Stack:** Hono + Node.js adapter + PostgreSQL (`postgres` driver) + Redis (BullMQ).

### `apps/worker` (Service mode)
Proceso separado que consume la cola BullMQ y ejecuta conversiones.

### `apps/local-agent` (opcional)
Agente local ligero — polling HTTPS, sin puertos entrantes.

### Desktop (raíz `/src`)
Aplicación Next.js existente, importa `packages/core` y `packages/engines`.
Mantiene SQLite, worker en proceso, portable Windows/Linux.

## Flujo de routing híbrido

```
Nexus recibe petición de conversión
  │
  ▼
ConversionRoutingPolicy.decide()
  │
  ├─► local-agent    → fichero sensible en equipo autorizado
  ├─► private-service → automatización inter-aplicaciones
  ├─► reject          → operación no permitida para ese cliente
  └─► require-human-approval → clasificación requiere consentimiento
```

## Infraestructura Service (VPS)

```
Caddy (80/443) → API (8080) → PostgreSQL (5432, red interna)
                            → Redis (6379, red interna)
                            → Shared volume /artifacts
               → Worker    → Shared volume /artifacts
                            → Shared volume /work
```

Puertos públicos: 80, 443.
Todo lo demás en red Docker interna.

## Stack de tecnologías

| Componente | Tecnología | Licencia | Justificación |
|---|---|---|---|
| API Service | Hono | MIT | TypeScript-first, ultraligero, sin overhead, Node.js + edge |
| Queue | BullMQ | MIT | Madura, Redis-nativa, leases, heartbeat, dead-letter |
| Persistencia Service | PostgreSQL | PostgreSQL License | Robusta, transacciones, MVCC |
| Query layer | `postgres` (porsager) | MIT | Mínimo, TypeScript, sin ORM bloat |
| Migraciones | `node-pg-migrate` | MIT | Versionadas, up/down, CLI |
| Auth JWT | `jose` | MIT | Standard W3C, sin dependencias, EdDSA/RS256 |
| Reverse proxy | Caddy | Apache 2.0 | HTTPS automático, config mínima |
| Contenedores | Docker Compose | Apache 2.0 | Solo para Service/VPS |
| Validación | Zod | MIT | Ya en proyecto, type inference |
| Logs | `pino` | MIT | JSON estructurado, zero overhead |
| Métricas | `prom-client` | Apache 2.0 | Prometheus-compatible |
