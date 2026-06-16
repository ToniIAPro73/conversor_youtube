# ADR-001: Shared Core Package

## Estado: Aceptado

## Contexto

FileStudio Desktop tiene su lógica de dominio entremezclada con Next.js API routes, SQLite y
componentes React. Añadir un Service independiente requiere reutilizar catálogo de formatos,
catálogo de operaciones, contratos de motores, estados de jobs y validaciones sin duplicar código.

## Decisión

Crear `packages/core` como paquete TypeScript puro, sin dependencias de framework, base de datos
ni binarios externos. Desktop y Service importan de `packages/core` vía workspace link.

## Consecuencias

**Positivo:**
- Catálogo de formatos/operaciones coherente en ambos modos.
- Contratos de motor y repositorio testeables en aislamiento.
- Migraciones entre Desktop y Service sin cambiar contratos.

**Negativo:**
- Requiere restructurar imports en `src/lib/domain/` y `src/lib/engines/`.
- Necesita configurar pnpm workspaces correctamente.

## Alternativas descartadas

- **Duplicar código:** Mantendría dos versiones desincronizadas del catálogo.
- **Publicar a npm:** Overhead de versioning innecesario para un monorepo privado.
