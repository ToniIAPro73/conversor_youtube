# Windows Portable — Execution Report

Date: 2026-06-16
Build host: WSL2 Ubuntu 22.04
Target: Windows x64
Node.js: v24.16.0 (ABI 137, win-x64)

## Artifact

```
dist/windows/Anclora-FileStudio-Windows-x64-Core.zip
dist/windows/Anclora-FileStudio-Windows-x64-Core.zip.sha256
```

| Property | Value |
|----------|-------|
| Size | 250 MB |
| SHA-256 | e7151cc5f3ad5090b7ca9df6ca22bcc682c1202ff6e7734d23f1a4c0de19155a |
| Compression | ZIP DEFLATE (allowZip64) |

## Bundled runtime and tools (all from toolchain.lock.json)

| Component | Version | SHA-256 verified |
|-----------|---------|-----------------|
| Node.js win-x64 | v24.16.0 (ABI 137) | yes |
| yt-dlp.exe | 2026.06.09 | yes |
| FFmpeg (BtbN GPL) | master-latest | yes (hash at lockfile time) |
| better-sqlite3 | v12.10.1 (node-v137-win32-x64) | yes |
| @img/sharp-win32-x64 | v0.35.1 | yes |
| Pandoc | 3.6.4 | yes |
| QPDF | 11.10.0 | yes |
| 7-Zip | 26.01 | best-effort (no pinned SHA) |

## Structural smoke test (20/20 PASS)

```
[PASS] SHA-256 OK
[PASS] INICIAR_ANCLORA_FILESTUDIO.bat
[PASS] CERRAR_ANCLORA_FILESTUDIO.bat
[PASS] manifest.json / VERSION.txt / THIRD_PARTY_NOTICES.txt / SBOM.cdx.json
[PASS] runtime/node.exe
[PASS] tools/yt-dlp/yt-dlp.exe
[PASS] tools/ffmpeg/ffmpeg.exe + ffprobe.exe
[PASS] tools/pandoc/pandoc.exe + tools/qpdf/qpdf.exe
[PASS] internal/start-anclora-filestudio.ps1 + stop-anclora-filestudio.ps1
[PASS] app/server.js + app/.next/static
[PASS] app/node_modules/better-sqlite3/build/Release/better_sqlite3.node
[PASS] No developer paths (Next.js build artifacts excluded)
[PASS] manifest.platform=windows
```

better_sqlite3.node magic: `4d5a9000` — confirmed Windows PE (MZ header).

## Runtime smoke

NOT EXECUTED — requires actual Windows environment (PowerShell/cmd.exe with bundled node.exe).

To perform manually:

1. Extract `Anclora-FileStudio-Windows-x64-Core.zip` to a local folder
2. Double-click `INICIAR_ANCLORA_FILESTUDIO.bat`
3. Verify browser opens at `http://127.0.0.1:3847`
4. Check health: `http://127.0.0.1:3847/api/health`
5. Run `CERRAR_ANCLORA_FILESTUDIO.bat`

## Key changes from previous build script

| Issue | Fix |
|-------|-----|
| `resolve_node_version()` queried nodejs.org API | Read v24.16.0 from toolchain.lock.json |
| `resolve_ytdlp_version()` queried GitHub API | Read 2026.06.09 from toolchain.lock.json |
| `resolve_ffmpeg_version()` queried GitHub API | Fixed URL from toolchain.lock.json |
| better-sqlite3 version from package.json | Read v12.10.1 ABI 137 from toolchain.lock.json |
| No SHA-256 verification against lockfile | All downloads verified with verify_sha256() |
| `cp -a .next/standalone/.` (monorepo mirror) | Whitelist copy (server.js, .next/, node_modules/, public/) |
| .next/node_modules/ excluded from copy | Turbopack stubs now included (required at runtime) |
| sharp not installed | @img/sharp-win32-x64 v0.35.1 from npm tgz |
