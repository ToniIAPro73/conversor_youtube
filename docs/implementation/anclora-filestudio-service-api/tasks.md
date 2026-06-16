# Tasks — Anclora FileStudio Service

## Subfase 5.0 — Auditoría, SDD y decisiones de arquitectura

- [x] Auditoría completa del repositorio
- [x] `baseline.md` — estado inicial verificado
- [x] `architecture.md` — visión y stack
- [x] `api-contract.md` — endpoints, formatos, errores
- [x] `event-contract.md` — SSE y webhooks
- [x] `security-model.md` — auth, scopes, SSRF, secretos
- [x] `data-model.md` — tablas PostgreSQL
- [x] `storage-model.md` — adaptadores y políticas
- [x] `deployment-vps.md` — Docker Compose VPS
- [x] `local-agent.md` — pairing, polling, consent
- [x] `nexus-integration.md` — flujo y SDK
- [x] `threat-model.md` — 15 amenazas documentadas
- [x] `test-matrix.md` — suites nuevas y existentes
- [x] `spec.md` — requisitos EARS
- [x] `adr/ADR-001` a `ADR-007`
- [x] `final-report.md` — placeholder inicial
- [x] Gate: lint, typecheck, test, build ✅
- [x] Commit: `docs: define FileStudio service architecture and API contracts`

## Subfase 5.1 — Extracción de FileStudio Core

- [ ] Actualizar `pnpm-workspace.yaml` con packages
- [ ] Crear `packages/core/` con package.json y tsconfig
- [ ] Mover interfaces de dominio a `packages/core/src/`
  - `domain/descriptors.ts` → `packages/core/src/descriptors.ts`
  - `domain/engines.ts` → `packages/core/src/engines.ts`
  - `domain/format-catalog.ts` → `packages/core/src/format-catalog.ts`
  - `domain/operations.ts` → `packages/core/src/operations.ts`
  - `domain/unified-analysis.ts` → `packages/core/src/unified-analysis.ts`
  - `errors/error-codes.ts` → `packages/core/src/errors.ts`
  - Interfaces de repositorio (nuevas)
  - Interfaces de almacenamiento (nuevas)
  - Interfaces de cola (nuevas)
  - Job state machine (nueva)
- [ ] Crear `packages/engines/` con adaptadores
- [ ] Actualizar imports en `src/lib/` para usar `@anclora/filestudio-core`
- [ ] Tests de regresión Desktop pasan sin cambios
- [ ] Gate: lint, typecheck, test, build ✅
- [ ] Commit: `refactor: extract reusable FileStudio core and engine adapters`

## Subfase 5.2 — API privada, contratos y SDK

- [ ] Crear `apps/api/` con Hono
- [ ] Instalar: hono, @hono/node-server, jose, pino, zod
- [ ] Middleware: auth JWT, rate limit (Redis), CORS privado, request logger
- [ ] Rutas: health, ready, capabilities, operations, uploads, jobs, batches, webhooks
- [ ] OpenAPI 3.1 generado desde tipos (`zod-to-openapi` o manual)
- [ ] Validación de request/response con Zod
- [ ] Idempotencia: middleware + tabla `idempotency_keys`
- [ ] Crear `packages/sdk/` con `AncloraFileStudioClient`
- [ ] Tests: api, contracts, sdk
- [ ] Gate ✅
- [ ] Commit: `feat: add private API asynchronous jobs and TypeScript SDK`

## Subfase 5.3 — Workers, cola, persistencia y almacenamiento

- [ ] Crear `apps/worker/` con BullMQ Worker
- [ ] Instalar: bullmq, ioredis, postgres, node-pg-migrate, ulid
- [ ] Migraciones PostgreSQL (todas las tablas del data-model.md)
- [ ] Implementar `PostgresJobRepository` y `PostgresUploadRepository`
- [ ] Implementar `BullMQConversionQueue`
- [ ] Implementar `SharedFilesystemStorage` y `LocalFilesystemStorage`
- [ ] Worker: adquirir lease → validar → ejecutar → validar output → persistir → webhook → limpiar
- [ ] Job de mantenimiento (limpieza/expiración)
- [ ] Tests: persistence, queue, storage, workers, concurrency, cleanup
- [ ] Gate ✅
- [ ] Commit: `feat: add secure workers persistence and temporary storage`

## Subfase 5.4 — Seguridad, auth, webhooks y Docker VPS

- [ ] Implementar `JwtAuthMiddleware` con `jose`
- [ ] Implementar `ScopeAuthorizationMiddleware`
- [ ] Implementar `RateLimitMiddleware` (Redis)
- [ ] Implementar `WebhookDeliveryService` con SSRF protection
- [ ] Implementar firma HMAC-SHA256 de webhooks
- [ ] Crear `deploy/vps/` completo
  - `compose.yml`, `compose.dev.yml`, `compose.prod.yml`
  - `Caddyfile`
  - `env.example`
  - `Dockerfile.api`, `Dockerfile.worker`
  - `backup.sh`, `restore.sh`, `healthcheck.sh`, `update.sh`
  - `systemd/anclora-filestudio.service`
- [ ] Validar secretos al arrancar (fail closed)
- [ ] Tests: auth, authorization, webhooks, ssrf, rate-limit, security
- [ ] Gate Docker (si disponible) ✅
- [ ] Commit: `feat: add VPS Docker deployment and operational hardening`

## Subfase 5.5 — Modo híbrido, Local Agent y contrato Nexus

- [ ] Crear `apps/local-agent/` con proceso Node.js standalone
- [ ] Pairing flow: solicitud → código → polling → credenciales
- [ ] Polling de jobs: long-poll 30s
- [ ] Consent UI (terminal o tray según plataforma)
- [ ] Ejecución local con motores existentes
- [ ] Upload de resultado con verificación de hash
- [ ] Limpieza de temporales
- [ ] Crear `packages/integrations/anclora-nexus/`
  - `mock-server/`
  - `fixtures/`
  - `example-integration.ts`
- [ ] Definir `ConversionRoutingPolicy`
- [ ] Tests: local-agent, pairing, routing, nexus-contract, privacy, security
- [ ] Gate ✅
- [ ] Commit: `feat: add hybrid local agent and Nexus integration contract`

## Subfase 5.6 — Observabilidad, E2E y validación final

- [ ] Integrar `pino` en API y worker
- [ ] Integrar `prom-client` con métricas definidas
- [ ] Endpoints `/metrics` (privado) y `/api/v1/health`, `/api/v1/ready`
- [ ] Healthcheck worker (heartbeat en `worker_heartbeats`)
- [ ] Tests E2E completos (20 escenarios del test-matrix)
- [ ] CI workflows: ci-core, ci-desktop, ci-service, ci-security, ci-docker
- [ ] `docs/api/openapi.yaml` validado
- [ ] Verificar Desktop portable sin Docker
- [ ] Gate global ✅
- [ ] Commit: `test: complete service integration security and deployment validation`
- [ ] `final-report.md` completado con resultados reales
