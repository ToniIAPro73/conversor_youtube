# Linux Portable — Execution Report

Date: 2026-06-16
Build host: WSL2 Ubuntu 22.04, x86-64
Node.js: v22.22.1 (ABI 127)

## Artifact

```
dist/linux/Anclora-FileStudio-Linux-x64.tar.zst
dist/linux/Anclora-FileStudio-Linux-x64.tar.zst.sha256
```

| Property | Value |
|----------|-------|
| Compressed size | 14 MB |
| Uncompressed size | ~44 MB |
| SHA-256 | b16192e13543c31fad27bef00fa4dda1a4a4fd5e48467eea25d02be4b93ae571 |
| Compression | zstd -T0 -19 |
| Reproducible tar | ✅ (--sort=name --mtime=@SOURCE_DATE_EPOCH --owner=0 --group=0 --numeric-owner) |

## Capabilities (12 total)

`data`, `image`, `history`, `audio`, `video`, `thumbnail`, `youtube`, `pdf`, `archive`, `document`, `ocr`, `ebook`

All capabilities are derived from ACTUALLY PRESENT system tools — no false advertising.

## Verification results

```
PASS: 43
WARN: 0
FAIL: 0
```

Checks performed:
1. Artifact existence (tar.zst + sha256 present)
2. SHA-256 checksum match
3. Required files and directories present (10 items)
4. Executable permissions on .sh scripts
5. JSON validity (manifest.json, SBOM.cdx.json)
6. Manifest fields (name, version, buildId, buildDate, commit, platform, arch, capabilities)
7. Native modules are ELF x86-64 (better_sqlite3.node, sharp.node)
8. No .dll files (Windows artifacts absent)
9. No secrets, no .git, no developer paths in launchers
10. Launcher binds to 127.0.0.1, NOT 0.0.0.0
11. License files present

## Smoke test results

```
[PASS] start-anclora-filestudio.sh
[PASS] stop-anclora-filestudio.sh
[PASS] manifest.json
[PASS] VERSION.txt
[PASS] app/server.js
[PASS] app/.next/static
[PASS] No developer paths (excl. Next.js build artifacts)
[PASS] SHA-256 OK
[PASS] manifest.json is valid JSON
=== Smoke test PASSED ===
```

## Runtime smoke

NOT EXECUTED — server launch requires installing target system dependencies.
Manual test: extract, run `./start-anclora-filestudio.sh`, check `http://127.0.0.1:3847/api/health`.

## Issues resolved during build

| Issue | Resolution |
|-------|-----------|
| Tool version strings with newlines broke Python heredoc | Switched to temp JSON file written by Python subprocess |
| Next.js standalone mirrors entire monorepo | Switched to whitelist copy (server.js, .next/, node_modules/, public/) |
| `dist/linux/*.tar.zst` already exists when rebuilding | Added `rm -f` before zstd invocation |
| Smoke test gave exit 0 when package absent | Changed to `exit 1` with explicit error message |
| `server.js` contains `outputFileTracingRoot` (build path) | Excluded from dev-path scan (known Next.js artifact) |
