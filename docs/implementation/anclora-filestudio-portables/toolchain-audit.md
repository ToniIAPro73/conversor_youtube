# Portables — Toolchain Audit

Date: 2026-06-16 | System: WSL2 Ubuntu 22.04 | Arch: x64

## Runtime (bundled in package)

| Tool | Version | Source | Notes |
|------|---------|--------|-------|
| Node.js | v22.22.1 (ABI 127) | System PATH | Required on target machine |
| better-sqlite3 | bundled in node_modules | npm | ELF x86-64 validated |
| sharp | bundled in node_modules | npm | ELF x86-64 validated |

## System tools (detected at build time, required on target)

| Tool | Version on build machine | Capability enabled |
|------|------------------------|-------------------|
| ffmpeg | 4.4.2 | audio, video, thumbnail |
| ffprobe | 4.4.2 | media-analysis |
| yt-dlp | 2026.06.09 | youtube |
| qpdf | 10.6.3 | pdf |
| 7zz / 7z | 26.01 | archive |
| pandoc | 2.9.2.1 | document |
| tesseract | 4.1.1 | ocr |
| pdftoppm | 22.02.0 | ocr-pdf |
| calibredb | 9.x | ebook |

Linux portable does NOT bundle external tools — they must be installed on the target machine.

## Compression toolchain

| Tool | Version | Source | Notes |
|------|---------|--------|-------|
| zstd | 1.5.6 | Compiled from source | Installed at `~/.local/bin/zstd`; apt package requires sudo |

Build scripts detect zstd at `~/.local/bin/zstd`, `/usr/local/bin/zstd`, then `PATH`.

## Known issues / pending

| Issue | Status |
|-------|--------|
| `toolchain.lock.json` node version `>=20.0.0` (not pinned) | Pending fix |
| `toolchain.lock.json` yt-dlp version `latest-stable` (not pinned) | Pending fix |
| All `sha256: null` in toolchain.lock.json | Pending fix |
| Windows build: `NODE_WINDOWS_VERSION` / `YTDLP_WINDOWS_VERSION` empty | Pending fix |
