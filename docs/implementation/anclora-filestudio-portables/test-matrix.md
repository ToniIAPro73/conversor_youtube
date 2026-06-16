# Portables — Test Matrix

## Linux

| Test                          | Script                         | Status | Notes                                                  |
| ----------------------------- | ------------------------------ | ------ | ------------------------------------------------------ |
| Structural verify (53 checks) | `verify-linux-portable.sh`     | PASS   | 53/53, 0 WARN                                          |
| Smoke with PNG-to-WebP        | `smoke-linux-portable.sh`      | PASS   | artifact-absent = exit 1; real Sharp conversion        |
| Runtime smoke (9 checks)      | manual / inline                | PASS   | server starts, SQLite, analyze, restart, stop          |
| Health endpoint               | runtime smoke                  | PASS   | node=v22.22.1, tools=10/10                             |
| SQLite persistence            | runtime smoke                  | PASS   | history endpoint responds, data survives restart       |
| JSON analyze                  | runtime smoke                  | PASS   | kind=universal-file                                    |
| PNG analyze                   | runtime smoke                  | PASS   | kind=universal-file                                    |
| Clean stop                    | runtime smoke                  | PASS   | stop script, no residual processes                     |
| Bundled Node                  | verify + runtime               | PASS   | ELF x86-64, v22.22.1, SHA-256 verified from nodejs.org |
| libvips-cpp.so.8.18.3         | `verify-linux-portable.sh` s7b | PASS   | real file 17MB ELF x86-64, not symlink                 |
| Sharp ldd (no not found)      | `verify-linux-portable.sh` s7b | PASS   | all dynamic deps resolved                              |
| Sharp loads (bundled node)    | `verify-linux-portable.sh` s7b | PASS   | sharp=0.35.1 vips=8.18.3                               |
| PNG-to-WebP (bundled node)    | `smoke-linux-portable.sh`      | PASS   | 4x4 = 68 bytes WebP                                    |
| Independent SHA-256           | manual                         | PASS   | 8160c05f... matches                                    |
| Independent Sharp load        | manual                         | PASS   | sharp=0.35.1, vips=8.18.3                              |
| Independent health            | manual                         | PASS   | ok=true, nodeVersion=v22.22.1                          |

## Windows

| Test                         | Script                      | Status  | Notes                        |
| ---------------------------- | --------------------------- | ------- | ---------------------------- |
| Structural smoke (20 checks) | `smoke-windows-portable.sh` | PASS    | 20/20                        |
| Runtime smoke                | manual                      | PENDING | Requires Windows environment |

## CI gate requirement

Before merging to `main`:

- [x] Linux structural verify passes (exit 0)
- [x] Linux smoke passes (exit 0)
- [x] Linux runtime smoke: server starts with bundled node, SQLite works, clean stop
- [ ] Windows structural smoke passes when artifact exists
- [x] Neither smoke gives false positive when artifact is absent (exit 1)

## Known non-issues

- `server.js` and `required-server-files.json` contain `outputFileTracingRoot: "/home/toni/projects/anclora-fileStudio"` — this is baked in by Next.js build; excluded from dev-path grep scans with `--exclude` flags.
- Health `ok: false` in clean-PATH environment: expected when yt-dlp/7z are not in PATH. The server is running; the status reflects tool availability, not server health.
- `.next/node_modules/` must NOT be excluded from copy — Turbopack places external module stubs (`better-sqlite3-hash`, `sharp-hash`) there; required at runtime.

## Smoke test false-positive fix

Both smoke scripts previously had `exit 0` when the package was not found. Fixed to `exit 1` with an explicit error message.
