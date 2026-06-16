# Resultado de Fase 5 — FileStudio Service

## Estado general

🔄 En progreso — Subfase 5.0 completada.

## Rama

- Base: `main` (no existe `development` en este repo — documentado en ADR-007)
- Feature: `feat/anclora-filestudio-service-api`
- Commit inicial: `fd234ca` — fix: resolve duplicate key warning in ToolStatusPanel
- Commit final: pendiente (se completa al finalizar subfase 5.6)

## Subfase 5.0

- Estado: ✅ COMPLETADA
- Commit: pendiente (este commit)
- Push: pendiente
- Gates: lint ✅ · typecheck ✅ · test 487/487 ✅ · build ✅

## Subfase 5.1

- Estado: ⏳ Pendiente
- Commit: —
- Push: —
- Gates: —

## Subfase 5.2

- Estado: ⏳ Pendiente
- Commit: —
- Push: —
- Gates: —

## Subfase 5.3

- Estado: ⏳ Pendiente
- Commit: —
- Push: —
- Gates: —

## Subfase 5.4

- Estado: ⏳ Pendiente
- Commit: —
- Push: —
- Gates Docker: —

## Subfase 5.5

- Estado: completada y publicada
- Commit: `feat: add hybrid local agent and Nexus integration contract`
- SHA local/remoto: `358a84d8cb41841084d3a772d24d8109a5b29a82`
- Push: OK
- Gates ejecutados:
  - `pnpm --filter @anclora/filestudio-local-agent typecheck` — OK
  - `pnpm --filter @anclora/filestudio-api typecheck` — OK
  - `pnpm --filter @anclora/filestudio-nexus typecheck` — OK
  - `pnpm test:local-agent` — OK, 6 archivos / 24 tests
  - `pnpm test:routing` — OK
  - `pnpm test:nexus-contract` — OK
  - `pnpm --filter @anclora/filestudio-api test -- tests/agent.test.ts tests/auth.test.ts` — OK
  - `pnpm test:security` — OK, 16 tests
  - `pnpm build` — OK
  - `pnpm build:local-agent` — OK
- Gate no aplicable a 5.5: `pnpm build:service` se ejecutó de forma anticipada y falló por configuración `rootDir` de `apps/api/tsconfig.build.json` al importar `packages/core`; se registra como corrección de subfase 5.6.
- Smoke test: incluido en `apps/local-agent/tests/smoke.test.ts`; ejecuta conversión real `data.json-to-yaml` contra servidor HTTP local de test.
- Limitaciones reales: keychain nativo Windows/Linux queda documentado como hardening posterior; fallback portable exige clave explícita y cifra con AES-256-GCM.

## Subfase 5.6

- Estado: en validación previa a commit
- Commit: pendiente
- Push: pendiente
- Gates ejecutados:
  - `pnpm install --frozen-lockfile` — OK
  - `pnpm typecheck` — OK
  - `pnpm test:api` — OK, 4 archivos / 34 tests
  - `pnpm test:contracts` — OK
  - `pnpm test:service:e2e` — OK (smoke Local Agent)
  - `pnpm test:security` — OK, 16 tests
  - `pnpm build:service` — OK
  - `pnpm --filter @anclora/filestudio-worker build` — OK
  - `pnpm build:local-agent` — OK
  - `pnpm audit --prod` — OK, sin vulnerabilidades conocidas tras override `postcss@8.5.10`
  - `pnpm audit:licenses` — OK, 0 errores / 6 warnings de redistribución documentales
  - `pnpm generate:sbom` — OK, 52 componentes
  - `docker compose -f deploy/vps/compose.yml config` — OK
- Docker: Dockerfiles corregidos para pnpm fijo, build real, Redis autenticado y runtime JS compilado. Smoke Docker local pendiente si Docker no está disponible.
- Docker build/smoke: NO EJECUTADO; Docker CLI existe pero el daemon no está disponible (`/var/run/docker.sock` ausente).
- Observabilidad: métricas Prometheus requeridas, logs estructurados redactados y endpoint `/api/v1/metrics`.
- CI: workflow consolidado `.github/workflows/ci.yml`.

## Arquitectura final

Ver `architecture.md`.

## Desktop sin Docker

- Estado: ✅ Verificado en baseline (487 tests, build OK, sin Docker)
- Validación: `pnpm test && pnpm build` — sin Docker, sin PostgreSQL, sin Redis

## Service en VPS

- Estado: ⏳ Pendiente implementación
- Servicios: reverse-proxy (Caddy), api (Hono), worker (BullMQ), postgres, redis
- Puertos: 80, 443 (públicos); 8080, 5432, 6379 (internos)
- Volúmenes: artifacts, work, postgres-data, redis-data
- Health: `/api/v1/health`, `/api/v1/ready`

## API

- Endpoints: 18 (ver `api-contract.md`)
- OpenAPI: ⏳ Pendiente
- Autenticación: JWT asimétrico EdDSA (ver ADR-005)
- Idempotencia: ⏳ Pendiente
- Webhooks: HMAC-SHA256 firmados (ver `event-contract.md`)

## Workers

- Colas: filestudio:documents, images, media, ocr, ebooks, data, maintenance
- Concurrencia: configurable, defecto 2 por worker process
- Cancelación: ⏳ Pendiente
- Reintentos: 3 intentos, backoff exponencial, dead-letter

## Almacenamiento y retención

Ver `storage-model.md`. TTL defecto: uploads 60 min, artefactos 60 min.

## Local Agent

- Plataformas: Windows x64, Linux x64
- Pairing: código 6 dígitos, TTL 10 min
- Operaciones: lista blanca por dispositivo
- Privacidad: consentimiento explícito, ask-always por defecto

## Integración Nexus

- SDK: ⏳ Pendiente (`packages/sdk`)
- Contratos: documentados en `nexus-integration.md`
- Ejemplo: ⏳ Pendiente (`example-integration.ts`)
- Pendientes externos: endpoint webhook en Nexus (fuera de scope de este repo)

## Seguridad

- Threat model: 15 amenazas en `threat-model.md`
- SSRF: bloqueo RFC 1918, re-resolución DNS, timeout 10s
- Path traversal: `ensurePathSafety()` en todos los paths
- Rate limits: configurables por cliente, Redis-backed
- Secretos: variables de entorno, Docker secrets, fail-closed en arranque
- Supply chain: SBOM por imagen, `pnpm audit`, lockfile frozen

## Pruebas

- Unitarias: 487 passing (Desktop) — objetivo 600+ total
- Integración: ⏳ Pendiente (Service)
- E2E: ⏳ Pendiente (20 escenarios)
- Docker: ⏳ Pendiente
- Desktop: ✅ Passing
- Local Agent: ⏳ Pendiente

## Artefactos

- Imágenes: ⏳ Pendiente (`Dockerfile.api`, `Dockerfile.worker`)
- SBOM: `SBOM.cdx.json` (Desktop) — Service pendiente
- Documentación: `docs/implementation/anclora-filestudio-service-api/` ✅

## Commits y SHAs

| Subfase | Commit | SHA |
|---|---|---|
| 5.0 | docs: define FileStudio service architecture and API contracts | pendiente |
| 5.1 | refactor: extract reusable FileStudio core and engine adapters | — |
| 5.2 | feat: add private API asynchronous jobs and TypeScript SDK | — |
| 5.3 | feat: add secure workers persistence and temporary storage | — |
| 5.4 | feat: add VPS Docker deployment and operational hardening | — |
| 5.5 | feat: add hybrid local agent and Nexus integration contract | — |
| 5.6 | test: complete service integration security and deployment validation | — |

## Gates pendientes reales

- [ ] Docker no verificado (no disponible en este entorno) — pendiente subfase 5.4
- [ ] PostgreSQL no disponible en entorno local — tests de persistencia con mock/test-container
- [ ] Redis disponible (se instalará para BullMQ tests)

## Limitaciones

- Docker no disponible en el entorno de desarrollo actual — los tests E2E de Docker quedan
  marcados como pending y se documentan con el comando exacto para ejecutarlos en VPS.
- PostgreSQL no instalado localmente — tests de repositorio PG usan testcontainers o
  adaptador mock para CI local; se ejecutan completos en CI con Docker.

## Siguiente acción recomendada

Ejecutar Subfase 5.1: restructurar pnpm workspaces y extraer `packages/core`.
