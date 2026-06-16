# ADR-002: API and Worker Separation

## Estado: Aceptado

## Contexto

En Desktop, las conversiones se ejecutan en el proceso de Next.js (via API routes + JobManager
singleton). Esto es aceptable para uso local. En Service, múltiples workers independientes deben
poder escalar horizontalmente sin acoplar la API a la ejecución.

## Decisión

**Desktop:** API routes Next.js + worker en proceso (patrón actual conservado).
**Service:** Servidor Hono independiente (`apps/api`) + worker proceso separado (`apps/worker`).
El worker consume la cola BullMQ/Redis y ejecuta conversiones.

**Framework API Service:** Hono
- MIT license
- TypeScript-first
- Sin overhead de Next.js en un servidor puro de API
- Compatible con Node.js adapter
- Ultra-ligero

## Consecuencias

**Positivo:**
- Worker puede escalar independientemente de la API.
- API responde siempre aunque los workers estén saturados.
- Separación clara de responsabilidades.

**Negativo:**
- Dos procesos en Service (vs. uno en Desktop) requieren coordinación.
- Los logs del worker y la API son independientes — necesita correlación por `correlationId`.

## Alternativas descartadas

- **Next.js para Service también:** Overhead de SSR/RSC innecesario para API pura.
- **Fastify:** También válido, pero Hono es más ligero y sin dependencias opcionales.
- **Worker en hilo (worker_threads):** No aísla correctamente fallos de motores.
