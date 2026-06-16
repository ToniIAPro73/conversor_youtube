# Portables — Final Report

Date: 2026-06-16
Branch: `feat/anclora-filestudio-local-conversion-suite`

## Summary

| Item | Status |
|------|--------|
| Build orchestrator (`build-portables.sh`) | ✅ Created |
| Linux build script (complete rewrite) | ✅ Done |
| Linux artifact (tar.zst + sha256) | ✅ Built |
| Linux verification (43 checks) | ✅ PASS |
| Linux smoke test | ✅ PASS |
| Smoke false-positive fix (both platforms) | ✅ Fixed |
| Windows build script | Pending (has empty version vars) |
| Windows artifact | Pending |
| Docs (7 markdown files) | ✅ Done |

## Linux artifact

```
dist/linux/Anclora-FileStudio-Linux-x64.tar.zst  (14 MB)
dist/linux/Anclora-FileStudio-Linux-x64.tar.zst.sha256
SHA-256: b16192e13543c31fad27bef00fa4dda1a4a4fd5e48467eea25d02be4b93ae571
```

## Security constraints met

- [x] App listens only on 127.0.0.1 (verified in all 3 launchers)
- [x] No 0.0.0.0 binding
- [x] No .env.local, .pem, .key files in package
- [x] No .git directory in package
- [x] No developer paths in launcher scripts
- [x] No Windows .dll files in Linux package
- [x] better_sqlite3.node validated as ELF x86-64
- [x] sharp.node validated as ELF x86-64
- [x] No Git operations in any build script

## Key technical decisions

### Whitelist copy instead of standalone mirror
The `.next/standalone` directory mirrors the full `outputFileTracingRoot` (repo root), including workspace subdirs (`apps/`, `packages/`, `scripts/`) and root files. Using `cp -r "$STANDALONE/." "$app/"` copies everything including developer artifacts. Fixed by explicitly copying only what the runtime needs: `server.js`, `.next/`, `node_modules/`, `public/`.

### Tool version extraction via Python subprocess
Shell variable expansion of multi-line tool version strings (`ffmpeg --version` outputs 3 lines) broke Python heredoc string literals. Fixed by writing tool manifest to a temp JSON file via a separate Python script that uses `subprocess.run()`.

### zstd availability
`zstd` is not available via `apt` without sudo on this system. Built v1.5.6 from source, installed to `~/.local/bin/zstd`. Build scripts detect it by checking `~/.local/bin/zstd` before falling back to system PATH.

### Next.js build artifact paths
`server.js` and `required-server-files.json` inevitably contain `outputFileTracingRoot: "/home/toni/projects/anclora-fileStudio"`. These are excluded from smoke test developer-path scans via `--exclude` flags on `grep`.

## Pending work

1. Fix `scripts/build-windows-portable.sh` — pin `NODE_WINDOWS_VERSION` and `YTDLP_WINDOWS_VERSION`
2. Fix `scripts/toolchain.lock.json` — pin versions, add SHA-256 hashes
3. Run Windows build from WSL
4. Execute Windows structural smoke test
5. Runtime smoke test on clean Linux machine (no developer tools in PATH)
