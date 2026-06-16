# ADR-003: Queue and Persistence Strategy

## Estado: Aceptado

## Contexto

Desktop usa SQLite + in-process queue (JobManager singleton). Service necesita:
- Cola durable que sobreviva reinicios del worker.
- Múltiples workers consumiendo la misma cola.
- Heartbeat y recuperación de leases expirados.
- Dead-letter queue.
- Retrocompatibilidad con Desktop (sin PostgreSQL/Redis locales).

## Decisión

**Cola Service:** BullMQ sobre Redis 7.
- Licencia MIT.
- La más madura del ecosistema Node.js para colas sobre Redis.
- Leases (job locks), heartbeat, backoff configurable, dead-letter, prioridades, concurrencia.
- Maintainer activo (2024-2026).

**Persistencia Service:** PostgreSQL 16 con driver `postgres` (porsager/postgres).
- Licencia MIT para el driver.
- Sin ORM — queries tipadas directamente.
- Migraciones con `node-pg-migrate`.

**Abstracción:** Interfaces `JobRepository` y `ConversionQueue` en `packages/core`.
- Desktop implementa con SQLite + array en memoria.
- Service implementa con PostgreSQL + BullMQ.
- Los motores y el Core no conocen la implementación.

## Justificación de dependencias

| Dep | Versión | License | Tamaño | Madurez |
|---|---|---|---|---|
| bullmq | ^5 | MIT | ~200KB | Alta (2020-) |
| redis | ^4 | MIT | ~130KB | Estándar |
| postgres | ^3 | MIT | ~50KB | Alta (2019-) |
| node-pg-migrate | ^7 | MIT | ~100KB | Alta (2016-) |

## Consecuencias

**Positivo:**
- Desktop no necesita Redis ni PostgreSQL.
- Service tiene cola durable con recuperación automática.
- Dos workers pueden operar simultáneamente sin colisión.

**Negativo:**
- Service requiere Redis y PostgreSQL (infraestructura adicional en VPS).
- BullMQ añade ~200KB al bundle del worker.

## Alternativas descartadas

- **pg-boss:** Cola en PostgreSQL, evita Redis. Descartado porque ya necesitamos Redis para
  rate limiting y la separación añade complejidad sin beneficio en VPS.
- **Prisma:** ORM con código generado. Descartado por overhead y complejidad en migraciones.
