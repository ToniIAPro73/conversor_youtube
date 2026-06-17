# Vercel Web Final Report

## Architecture Decision

Anclora FileStudio on Vercel is `vercel-web`: a public Web surface with
browser-safe structured conversions. It does not run the universal Desktop
conversion engine.

## Implemented Scope

- Deployment target module.
- Vercel-specific `health` and `capabilities`.
- Desktop route blocking with `DESKTOP_REQUIRED`.
- Browser-only structured data conversion.
- Vercel configuration and bundle verification.
- Baseline, compatibility, architecture, security and operations docs.

## Validation Log

### Local

- `git diff --check`: PASS.
- `pnpm lint`: PASS.
- `pnpm typecheck`: PASS.
- `pnpm test`: 35 files, 552 tests passed.
- `pnpm test:vercel`: 2 files, 8 tests passed.
- `pnpm build:vercel`: PASS, no Desktop binary warnings.
- `pnpm verify:vercel`: PASS.
- `vercel build --yes`: PASS.
- `vercel build --prod --yes`: PASS.

### Portable Regression

- Linux build: PASS.
- Linux verify: PASS, 53 checks.
- Linux acceptance: 313 passed, 0 failed, 0 advertised-but-not-executable.
- Windows build: PASS.
- Windows verify: PASS, 91 checks.
- Windows acceptance: 313 passed, 0 failed, 0 advertised-but-not-executable.
- Platform compare: PASS, 0 discrepancies.

Artifacts:

- Linux SHA-256: `29fcc0f0ec4e7da51e5856edd3b99e4921e9aeecafa5fe26abd3b9391c5fea69`.
- Windows SHA-256: `787079b9b703873dc3cbf6e99fcf92573162ce20d6ef222a3b55706e69a6a5e6`.

### Preview

- URL: `https://anclora-filestudio-o1802vyc1-pmi140979-6354s-projects.vercel.app`.
- Deployment ID: `dpl_G2QrBvnKetVzjRZTgiUwrqqgAzc3`.
- API validation: PASS via `vercel curl`.
- Browser validation: blocked by Vercel Authentication on Preview.

### Production

- URL: `https://anclora-filestudio.vercel.app`.
- Deployment URL: `https://anclora-filestudio-6r7v6vlhj-pmi140979-6354s-projects.vercel.app`.
- Deployment ID: `dpl_87JfQJvPVi99GVvD5Ej54LxfbyZu`.
- `/api/health`: PASS.
- `/api/capabilities`: PASS.
- `/api/metadata`: PASS, `503 DESKTOP_REQUIRED`.
- Playwright browser smoke: PASS.
- Browser JSON to YAML conversion: PASS.
- Unicode preservation: PASS.
- API uploads during browser conversion: 0.
- Console errors: 0.

## Branch

- Branch: `deploy/vercel-web`.
- Commits:
  - `3f07254 feat(vercel): add web deployment mode`
  - `4bd1146 fix(portable): isolate desktop builds from vercel output`
