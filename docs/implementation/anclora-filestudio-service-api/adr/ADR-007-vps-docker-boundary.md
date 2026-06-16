# ADR-007: VPS Docker Boundary

## Estado: Aceptado

## Contexto

Docker es una herramienta poderosa de aislamiento y despliegue, pero introduce complejidad
y dependencias que son inaceptables para Desktop y Local Agent (equipos corporativos con
restricciones de instalación, usuarios no técnicos).

## Decisión

**Docker es obligatorio únicamente para Anclora FileStudio Service en VPS.**

| Componente | Docker | Justificación |
|---|---|---|
| Service (VPS) | ✅ Obligatorio | Aislamiento, reproducibilidad, escalado |
| Desktop (Windows/Linux) | ❌ Prohibido | Usuarios no técnicos, restricciones corporativas |
| Local Agent | ❌ Prohibido | Mismo motivo, además requiere binarios locales |
| CI (GitHub Actions) | ✅ Para E2E | Solo para tests de integración con PostgreSQL/Redis |

## Consecuencia para la rama base

No existe rama `development` en este repositorio. La rama de feature parte de `main`.
Esta decisión se toma por inexistencia del branch convencional, y se documenta aquí para
que futuros agentes no asuman una política diferente sin verificarlo.

## Restricciones Docker para Service

1. Imágenes multi-stage — sin compiladores en runtime.
2. Usuario no root en todos los contenedores.
3. `no-new-privileges: true`.
4. Red interna para PostgreSQL, Redis, Worker.
5. Puertos públicos solo: 80, 443 (via Caddy).
6. Volúmenes explícitos — sin bind-mounts de directorios del host.
7. `read_only: true` para filesystem del contenedor donde sea posible.
8. SBOM por imagen en cada release.

## Consecuencias

**Positivo:**
- Desktop continúa siendo un ZIP portable sin dependencias de sistema.
- Local Agent instalable por usuarios no técnicos.
- Service completamente reproducible en cualquier VPS con Docker.

**Negativo:**
- Desktop y Service no comparten el mismo runtime — diferencias de entorno posibles.
- Tests E2E de Service requieren Docker en CI.
