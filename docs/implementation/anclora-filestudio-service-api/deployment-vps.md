# Deployment VPS — Anclora FileStudio Service

## Prerequisitos del VPS

- OS: Ubuntu 22.04 LTS o Debian 12
- Docker Engine 24+ y Docker Compose v2
- Mínimo: 2 vCPU, 4 GB RAM, 50 GB disco SSD
- Puerto 80 y 443 abiertos
- Dominio con registro DNS A apuntando al VPS

## Estructura de archivos en VPS

```
/opt/anclora-filestudio/
├── compose.yml           — configuración de producción
├── .env                  — secretos (NO versionado)
├── Caddyfile             — configuración reverse proxy
├── keys/                 — claves JWT públicas (montadas read-only)
├── backup.sh             — backup PostgreSQL + configuración
├── restore.sh            — restauración
├── healthcheck.sh        — verificación de salud completa
└── update.sh             — actualización controlada

/var/lib/anclora-filestudio/
├── artifacts/            — artefactos de conversión (volumen Docker)
└── work/                 — workspaces de jobs (volumen Docker)

/var/lib/postgresql/      — datos PostgreSQL (volumen Docker)
/var/lib/redis/           — datos Redis (volumen Docker)
```

## Servicios Docker Compose

### Producción

| Servicio | Imagen | Puertos internos | Propósito |
|---|---|---|---|
| `reverse-proxy` | `caddy:2-alpine` | 80, 443 (públicos) | TLS automático, proxy |
| `api` | `ghcr.io/toniia/filestudio-api:latest` | 8080 (interno) | API HTTP |
| `worker` | `ghcr.io/toniia/filestudio-worker:latest` | — | Procesamiento BullMQ |
| `postgres` | `postgres:16-alpine` | 5432 (interno) | Base de datos |
| `redis` | `redis:7-alpine` | 6379 (interno) | Cola BullMQ + rate limit |

Puertos externos: solo 80 y 443 vía Caddy.

### Opcionales (activar con profile)

| Servicio | Profile | Propósito |
|---|---|---|
| `minio` | `storage-s3` | Almacenamiento S3-compatible local |
| `prometheus` | `observability` | Scraping métricas |
| `grafana` | `observability` | Dashboards |
| `otel-collector` | `tracing` | OpenTelemetry |

## Variables de entorno (Service mode)

```bash
# Identidad
ANCLORA_FILESTUDIO_MODE=service
ANCLORA_FILESTUDIO_ENV=production
ANCLORA_FILESTUDIO_PUBLIC_BASE_URL=https://filestudio.anclora.internal

# Red
ANCLORA_FILESTUDIO_BIND_HOST=0.0.0.0
ANCLORA_FILESTUDIO_PORT=8080

# Base de datos
ANCLORA_FILESTUDIO_DATABASE_URL=postgresql://fs_user:STRONG_PASS@postgres:5432/filestudio

# Cola
ANCLORA_FILESTUDIO_REDIS_URL=redis://redis:6379

# Almacenamiento
ANCLORA_FILESTUDIO_STORAGE_DRIVER=shared-filesystem
ANCLORA_FILESTUDIO_STORAGE_ROOT=/var/lib/anclora-filestudio/artifacts
ANCLORA_FILESTUDIO_WORK_ROOT=/var/lib/anclora-filestudio/work

# Autenticación
ANCLORA_FILESTUDIO_JWT_ISSUER=anclora-nexus
ANCLORA_FILESTUDIO_JWT_AUDIENCE=anclora-filestudio-service
ANCLORA_FILESTUDIO_JWT_PUBLIC_KEYS_PATH=/run/secrets/jwt-public-keys

# Webhooks
ANCLORA_FILESTUDIO_WEBHOOK_SIGNING_KEY_FILE=/run/secrets/webhook-signing-key

# Límites
ANCLORA_FILESTUDIO_UPLOAD_MAX_BYTES=524288000
ANCLORA_FILESTUDIO_JOB_TTL_MINUTES=60
ANCLORA_FILESTUDIO_ARTIFACT_TTL_MINUTES=60
ANCLORA_FILESTUDIO_MAX_CONCURRENT_JOBS=10

# Logging
ANCLORA_FILESTUDIO_LOG_LEVEL=info
```

Valores inseguros (`changeme`, `default`, `secret`, `password`) causan `exit(1)` al arrancar.

## Imágenes Docker

### Multi-stage build API

```dockerfile
# Stage 1: deps
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile --prod

# Stage 2: builder
FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm build:api

# Stage 3: runtime
FROM node:22-alpine AS runtime
RUN addgroup -S filestudio && adduser -S filestudio -G filestudio
WORKDIR /app
COPY --from=builder /app/dist/api ./
USER filestudio
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://localhost:8080/api/v1/health || exit 1
CMD ["node", "server.js"]
```

Características:
- Usuario no root (`filestudio:filestudio`)
- Sin compiladores en runtime
- Imagen base fijada con digest en producción
- Labels OCI: `org.opencontainers.image.*`

## Operaciones

### Primer despliegue

```bash
cd /opt/anclora-filestudio
cp .env.example .env
# Editar .env con valores reales
docker compose pull
docker compose up -d postgres redis
docker compose run --rm api node migrate.js up
docker compose up -d
./healthcheck.sh
```

### Actualización

```bash
./update.sh  # pull + recreate con zero-downtime (rolling)
```

### Backup

```bash
./backup.sh  # pg_dump + compresión + rotación (7 días)
```

### Restauración

```bash
./restore.sh backup-2026-06-16.sql.gz
```

## Restricciones de red Docker

```yaml
networks:
  public:         # solo reverse-proxy
  internal:       # api, worker, postgres, redis, storage
    internal: true
```

Workers sin acceso a red pública — solo interna.
PostgreSQL y Redis no accesibles desde outside.

## Systemd (opcional para autostart)

```ini
[Unit]
Description=Anclora FileStudio Service
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/opt/anclora-filestudio
ExecStart=/usr/bin/docker compose up -d
ExecStop=/usr/bin/docker compose down

[Install]
WantedBy=multi-user.target
```
