# Cross-Platform Conversion Acceptance

This suite exercises the real portable API rather than importing engines directly.
It generates fixtures, extracts a portable into a clean directory outside the repo
with spaces and Unicode in the path, starts the bundled runtime, discovers
capabilities through `/api/capabilities`, runs advertised conversions through
`/api/jobs`, downloads outputs, and validates the resulting files.

## Commands

- `pnpm test:acceptance:fixtures`
- `pnpm test:acceptance:linux`
- `pnpm test:acceptance:windows`
- `pnpm test:acceptance:compare`

Windows runs the suite with `runtime\node.exe` from the extracted ZIP. Linux runs
with `runtime/node` from the extracted tarball.

## Artifacts

Reports are written under `artifacts/acceptance`:

- `fixture-manifest.json`
- `<platform>/conversion-manifest.generated.json`
- `<platform>/conversion-results.json`
- `<platform>/conversion-results.md`
- `<platform>/junit.xml`
- `platform-parity.json`
- `platform-parity.md`

Downloaded conversion outputs are intentionally ignored by Git.

## Regression Gates

The runner fails when:

- `/api/health` contains `sudo apt`;
- Windows does not report `runtime.effectivePlatform = "windows"`;
- Windows LibreOffice is not available with a version;
- Windows LibreOffice diagnostics do not mention `soffice.com`;
- advertised conversions fail at execution time.
