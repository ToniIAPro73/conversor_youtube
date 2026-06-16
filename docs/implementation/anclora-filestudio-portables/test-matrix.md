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
| PNG-to-WebP via /api/jobs     | runtime E2E                    | PASS   | 16x16 = 772 bytes, RIFF/WEBP magic confirmed           |
| Independent SHA-256           | manual                         | PASS   | 719bd5e8... matches                                    |
| Independent Sharp load        | manual                         | PASS   | sharp=0.35.1, vips=8.18.3                              |
| Independent health            | manual                         | PASS   | ok=true, nodeVersion=v22.22.1                          |

## Windows

| Test | Script | Status | Notes |
| --- | --- | --- | --- |
| Structural verify (80 checks) | `verify-windows-portable-v2.sh` | PASS | 80/80 — semver, DLLs, manifest, security |
| Structural smoke (31 checks) | `smoke-windows-portable.sh` | PASS | 31/31 — semver@7.8.4, native modules, no dev paths, launcher regression guards |
| Native acceptance (Windows) | `smoke-windows-portable.ps1` via smoke.sh | PASS | runtime win32/x64/v24.16.0/ABI 137, SQLITE_OK, SHARP_OK 0.35.1/8.18.3, WEBP_OK 68B RIFF/WEBP |
| Path with spaces startup | `smoke-windows-portable.ps1` via smoke.sh | PASS | extracts to `%TEMP%\Prueba Anclora FileStudio Windows <id>`, launches internal PS1 with `-SkipBrowser`, health OK |
| BAT startup from Downloads path with spaces | manual native Windows command | PASS | `INICIAR_ANCLORA_FILESTUDIO.bat` exit 0, health 200, browser open attempted, stop BAT released port |
| Launcher argument regression | `smoke-windows-portable.sh` + PS1 smoke | PASS | blocks `ArgumentList = @($ServerJs)`, requires `server.js` + `WorkingDirectory = <portable>\app` |
| NonInteractive compatibility | `smoke-windows-portable.sh` | PASS | `internal/start-anclora-filestudio.ps1` contains no `Read-Host` |
| PID-scoped stop | `smoke-windows-portable.ps1` | PASS | PID belongs to bundled `runtime\node.exe`; stop releases port and leaves no server process |
| semver stub fix | `build-windows-portable.sh` | PASS | stub 7.8.1 replaced with full 7.8.4 before .pnpm removal |
| Sharp load (bundled node.exe) | `smoke-windows-portable.ps1` | PASS | sharp=0.35.1 vips=8.18.3 confirmed in Windows TEMP |
| PNG->WebP (win32 native) | `smoke-windows-portable.ps1` | PASS | 68 bytes, magic RIFF/WEBP confirmed |
| better-sqlite3 CRUD | `smoke-windows-portable.ps1` | PASS | CREATE, INSERT, SELECT, close — no error |
| SHA-256 match | smoke + verify | PASS | 43f99986... |

## CI gate requirement

Before merging to `main`:

- [x] Linux structural verify passes (exit 0)
- [x] Linux smoke passes (exit 0)
- [x] Linux runtime smoke: server starts with bundled node, SQLite works, clean stop
- [x] Windows structural verify passes (exit 0)
- [x] Windows structural smoke passes (exit 0)
- [x] Windows native acceptance: runtime, SQLite, Sharp, PNG→WebP — all PASS
- [x] Windows startup from a local path with spaces: launcher, PID, health, stop — all PASS
- [x] Windows BAT startup from Downloads path with spaces: start, health, stop — PASS
- [x] Neither smoke gives false positive when artifact is absent (exit 1)

## Known non-issues

- `server.js` and `required-server-files.json` contain `outputFileTracingRoot: "/home/toni/projects/anclora-fileStudio"` — this is baked in by Next.js build; excluded from dev-path grep scans with `--exclude` flags.
- Health `ok: false` in clean-PATH environment: expected when yt-dlp/7z are not in PATH. The server is running; the status reflects tool availability, not server health.
- `.next/node_modules/` must NOT be excluded from copy — Turbopack places external module stubs (`better-sqlite3-hash`, `sharp-hash`) there; required at runtime.
- The BAT owns user pauses. Internal PowerShell launchers are called with `-NonInteractive` and must return exit codes instead of calling `Read-Host`.

## Smoke test false-positive fix

Both smoke scripts previously had `exit 0` when the package was not found. Fixed to `exit 1` with an explicit error message.
