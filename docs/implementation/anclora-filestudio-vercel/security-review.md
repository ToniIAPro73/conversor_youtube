# Vercel Web Security Review

## Result

`vercel-web` is a fail-closed Web profile. It does not initialize SQLite, spawn
processes, run binary probes, accept uploads, or advertise Desktop engines as
available.

## Checks

| Check | Status | Evidence |
| --- | --- | --- |
| No secrets in `NEXT_PUBLIC_*` | PASS | Only public URLs and mode flags are exposed. |
| No `.env` files deployed | PASS | `.vercelignore` excludes `.env*`. |
| No server uploads | PASS | `/api/inputs/analyze` returns `DESKTOP_REQUIRED`. |
| No PII/content logs | PASS | Browser converter does not log file content. |
| No external processes | PASS | `health` and `capabilities` skip probes in Vercel. |
| No local paths exposed | PASS | Vercel health omits local tool paths. |
| No SQLite | PASS | Vercel routes avoid DB imports at top level. |
| Honest capabilities | PASS | Binary engines are `desktop-required`. |
| Routes closed by default | PASS | Desktop routes return 503 in Vercel. |
| Security headers | PASS | `vercel.json` sets nosniff, referrer and permissions policy. |
| `shell: true` | PASS | No new shell execution added. |

## Residual Risks

- Browser conversion is intentionally limited to small structured data files.
- CSV/TSV parsing is simple and does not implement full RFC 4180 multiline
  semantics.
- Vercel Web is not a replacement for Desktop or the future VPS worker.
