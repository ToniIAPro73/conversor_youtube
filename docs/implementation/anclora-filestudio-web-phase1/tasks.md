# Web Phase 1 Tasks

## Audit

- [x] Read prompt and mandatory constraints.
- [x] Create branch `feat/vercel-web-phase1-images-pdf`.
- [x] Inspect Web/Desktop split, capabilities, health, Vercel verification, and
  current structured converter.
- [x] Check candidate licenses and versions.

## Implementation

- [ ] Add browser tool limits and shared helpers.
- [ ] Add Web capability model for images, PDF, and structured data.
- [ ] Refactor structured converter into `StructuredDataTool`.
- [ ] Add image conversion, resize, compression, EXIF read/strip, batch, and ZIP.
- [ ] Add PDF merge, split, reorder, rotate, and images-to-PDF.
- [ ] Update Web shell navigation: Images, PDF, More tools.
- [ ] Update `/api/capabilities` for browser execution metadata.
- [ ] Add tests and privacy guards.

## Validation

- [ ] `git diff --check`
- [ ] `pnpm install --frozen-lockfile`
- [ ] `pnpm lint`
- [ ] `pnpm typecheck`
- [ ] `pnpm test`
- [ ] `pnpm test:vercel`
- [ ] `pnpm build:vercel`
- [ ] `pnpm verify:vercel`
- [ ] Vercel Preview deployment and validation

## Guardrails

- [ ] Do not deploy Production.
- [ ] Do not merge PR.
- [ ] Keep Desktop-only native modules out of the Web graph.
