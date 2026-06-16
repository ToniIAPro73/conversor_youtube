# Test Matrix — Anclora FileStudio Service

## Suites existentes (Desktop)

| Suite | Comando | Tests | Estado |
|---|---|---|---|
| Unit (domain) | `pnpm test` | 487 | ✅ Passing |
| Integration (engines) | `pnpm test:integration` | — | ✅ Passing |
| Engine probes | `pnpm test:engines` | — | ✅ Passing |
| Security (path-safety) | `pnpm test:security` | — | ✅ Passing |
| Operations catalog | `pnpm test:operations` | — | ✅ Passing |
| Automation (watcher/recipe) | `pnpm test:automation` | — | ✅ Passing |
| Background removal | `pnpm test:background-removal` | — | ✅ Passing |
| Alpha channel | `pnpm test:alpha-channel` | — | ✅ Passing |
| Vision pack | `pnpm test:vision-pack` | — | ✅ Passing |

## Nuevas suites (Service)

### Subfase 5.5 ejecutada

| Comando | Resultado |
|---|---|
| `pnpm --filter @anclora/filestudio-local-agent typecheck` | OK |
| `pnpm --filter @anclora/filestudio-api typecheck` | OK |
| `pnpm --filter @anclora/filestudio-nexus typecheck` | OK |
| `pnpm test:local-agent` | 6 files, 24 tests OK |
| `pnpm test:routing` | OK |
| `pnpm test:nexus-contract` | OK |
| `pnpm --filter @anclora/filestudio-api test -- tests/agent.test.ts tests/auth.test.ts` | OK |
| `pnpm build:local-agent` | OK |

### Subfase 5.6 ejecutada

| Comando | Resultado |
|---|---|
| `pnpm install --frozen-lockfile` | OK |
| `pnpm typecheck` | OK |
| `pnpm test:api` | OK, 34 tests |
| `pnpm test:contracts` | OK |
| `pnpm test:service:e2e` | OK, smoke Local Agent |
| `pnpm test:security` | OK, 16 tests |
| `pnpm build:service` | OK |
| `pnpm --filter @anclora/filestudio-worker build` | OK |
| `pnpm build:local-agent` | OK |
| `pnpm audit --prod` | OK |
| `pnpm audit:licenses` | OK, 0 errores / 6 warnings |
| `pnpm generate:sbom` | OK |
| `docker compose -f deploy/vps/compose.yml config` | OK |
| `docker compose -f deploy/vps/compose.yml build` | NO EJECUTADO: daemon Docker no disponible |

### `pnpm test:api`

| Test | Archivo |
|---|---|
| Health/ready endpoints | `apps/api/tests/health.test.ts` |
| Auth JWT válido/inválido/expirado | `apps/api/tests/auth.test.ts` |
| Upload multipart | `apps/api/tests/uploads.test.ts` |
| Job create/get/cancel | `apps/api/tests/jobs.test.ts` |
| Job events SSE | `apps/api/tests/job-events.test.ts` |
| Batch create/cancel | `apps/api/tests/batches.test.ts` |
| Webhook CRUD | `apps/api/tests/webhooks.test.ts` |
| Rate limiting | `apps/api/tests/rate-limit.test.ts` |
| Error format Problem Details | `apps/api/tests/errors.test.ts` |

### `pnpm test:contracts`

| Test | Archivo |
|---|---|
| OpenAPI schema válido | `tests/contracts/openapi-valid.test.ts` |
| Request/response shapes | `tests/contracts/api-shapes.test.ts` |
| Event contract shapes | `tests/contracts/event-shapes.test.ts` |
| SDK ↔ API compatibility | `tests/contracts/sdk-compat.test.ts` |

### `pnpm test:sdk`

| Test | Archivo |
|---|---|
| Client auth flow | `packages/sdk/tests/auth.test.ts` |
| Upload + job lifecycle | `packages/sdk/tests/lifecycle.test.ts` |
| Retry on 5xx | `packages/sdk/tests/retry.test.ts` |
| AbortSignal cancellation | `packages/sdk/tests/abort.test.ts` |
| Idempotency key sent | `packages/sdk/tests/idempotency.test.ts` |
| Stream download | `packages/sdk/tests/download.test.ts` |
| Hash verification | `packages/sdk/tests/hash.test.ts` |
| Typed errors | `packages/sdk/tests/errors.test.ts` |

### `pnpm test:persistence`

| Test | Archivo |
|---|---|
| Job state machine | `packages/core/tests/job-state.test.ts` |
| Invalid transitions rejected | `packages/core/tests/job-transitions.test.ts` |
| Idempotency same key+payload | `tests/persistence/idempotency-same.test.ts` |
| Idempotency same key+diff payload → 409 | `tests/persistence/idempotency-conflict.test.ts` |
| Concurrent idempotency race | `tests/persistence/idempotency-race.test.ts` |
| Repository interface (SQLite impl) | `tests/persistence/sqlite-repo.test.ts` |
| Repository interface (PG impl) | `tests/persistence/pg-repo.test.ts` |

### `pnpm test:queue`

| Test | Archivo |
|---|---|
| Job enqueue/dequeue | `tests/queue/enqueue.test.ts` |
| Worker lease + heartbeat | `tests/queue/lease.test.ts` |
| Expired lease recovery | `tests/queue/lease-recovery.test.ts` |
| Dead worker recovery | `tests/queue/dead-worker.test.ts` |
| Retry + backoff | `tests/queue/retry.test.ts` |
| Dead-letter queue | `tests/queue/dead-letter.test.ts` |
| Cancellation mid-processing | `tests/queue/cancel.test.ts` |
| Two concurrent workers | `tests/queue/concurrency.test.ts` |
| Priority ordering | `tests/queue/priority.test.ts` |

### `pnpm test:storage`

| Test | Archivo |
|---|---|
| Put + open + stat | `tests/storage/basic.test.ts` |
| Delete existing | `tests/storage/delete.test.ts` |
| Hash validation | `tests/storage/hash.test.ts` |
| Download token lifecycle | `tests/storage/token.test.ts` |
| Path traversal rejected | `tests/storage/path-safety.test.ts` |

### `pnpm test:workers`

| Test | Archivo |
|---|---|
| Full job lifecycle | `tests/workers/lifecycle.test.ts` |
| Engine unavailable → rejected before queue | `tests/workers/engine-unavailable.test.ts` |
| Output validation failure | `tests/workers/output-invalid.test.ts` |
| Disk full simulation | `tests/workers/disk-full.test.ts` |
| Timeout enforcement | `tests/workers/timeout.test.ts` |

### `pnpm test:auth`

| Test | Archivo |
|---|---|
| Valid JWT accepted | `tests/auth/valid-jwt.test.ts` |
| Expired JWT rejected | `tests/auth/expired.test.ts` |
| Wrong audience rejected | `tests/auth/wrong-aud.test.ts` |
| Invalid signature rejected | `tests/auth/invalid-sig.test.ts` |
| Missing scope rejected | `tests/auth/missing-scope.test.ts` |
| Revoked client rejected | `tests/auth/revoked-client.test.ts` |
| Key rotation (2 active keys) | `tests/auth/key-rotation.test.ts` |

### `pnpm test:webhooks`

| Test | Archivo |
|---|---|
| Webhook delivered + verified | `tests/webhooks/delivery.test.ts` |
| SSRF URL rejected | `tests/webhooks/ssrf.test.ts` |
| DNS rebinding blocked | `tests/webhooks/dns-rebinding.test.ts` |
| Retry on 5xx | `tests/webhooks/retry.test.ts` |
| Dead-letter after 5 fails | `tests/webhooks/dead-letter.test.ts` |
| Signature verified | `tests/webhooks/signature.test.ts` |
| Old timestamp rejected | `tests/webhooks/timestamp.test.ts` |

### `pnpm test:local-agent`

| Test | Archivo |
|---|---|
| Pairing flow | `apps/local-agent/tests/pairing.test.ts` |
| Job polling | `apps/local-agent/tests/polling.test.ts` |
| Job execution | `apps/local-agent/tests/execution.test.ts` |
| Consent policy ask-always | `apps/local-agent/tests/consent.test.ts` |
| Revoked device rejected | `apps/local-agent/tests/revoked.test.ts` |
| Invalid operation rejected | `apps/local-agent/tests/invalid-op.test.ts` |
| Cleanup after job | `apps/local-agent/tests/cleanup.test.ts` |
| No inbound ports | `apps/local-agent/tests/no-inbound.test.ts` |

### `pnpm test:service:e2e`

E2E completo contra servicio real (PostgreSQL + Redis en Docker):

| Escenario | |
|---|---|
| Auth + upload + job + webhook | DOCX → PDF |
| Idempotency: misma key, mismo resultado | |
| Batch de 5 jobs | PNG → WebP x5 |
| Job cancellation mid-queue | |
| Rate limit triggered + 429 | |
| Client A no accede a jobs de Client B | |
| Expired artifact → 404 en descarga | |
| Local Agent: job asignado + procesado | |
| OCR: PDF escaneado → TXT | |
| Audio: WAV → MP3 | |
