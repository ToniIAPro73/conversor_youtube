# Portables — Baseline

Branch: `feat/anclora-filestudio-local-conversion-suite`
Date: 2026-06-16

## Starting point

| Component | State |
|-----------|-------|
| Next.js build | `output: "standalone"` configured in `next.config.ts` |
| Native modules | `better-sqlite3` + `sharp` available in `node_modules` |
| Node.js | v22.22.1 (ABI 127), linux-x64 |
| pnpm workspace | `apps/`, `packages/`, root app |

## Issues found in prior scripts

| File | Issue |
|------|-------|
| `run_portable_only.sh` | Hardcoded `REPO_DIR="/home/toni/projects/convertidor_youtube_mp3"` |
| `run_build_pipeline.sh` | Same hardcoded path; also had `git commit` and `--passWithNoTests` |
| `ESTADO_BUILD.md` | UNC path to developer machine |
| `scripts/smoke-linux-portable.sh` | `exit 0` when package absent → false positive in CI |
| `scripts/smoke-windows-portable.sh` | Same false positive |
| `scripts/verify-linux-portable.sh` | Only 12 lines, no real checks |

## Key design constraints

- No Git operations in any build script
- No Docker, Redis, PostgreSQL in portable
- App listens only on 127.0.0.1 (never 0.0.0.0)
- `shell: false` in all external process spawns
- No hardcoded developer paths
- Reproducible tar with `--sort=name --mtime=@SOURCE_DATE_EPOCH --owner=0 --group=0 --numeric-owner`

## Next.js standalone behavior

The `.next/standalone` directory mirrors the `outputFileTracingRoot` (repo root). This means it contains all workspace subdirectories (`apps/`, `packages/`, `scripts/`) and root files. The build script uses a **whitelist copy** strategy: only `server.js`, `.next/`, `node_modules/`, `public/`, and `package.json` are copied to `app/` in the package.

Paths that inevitably contain the build machine's path:
- `app/server.js` — `outputFileTracingRoot` baked in by Next.js
- `app/.next/required-server-files.json` — same

These are excluded from developer-path smoke checks as they are not user-modifiable.
