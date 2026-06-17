# Portables — Build Matrix

## Artifacts

| Artifact | Path | Platform | Status |
|----------|------|----------|--------|
| `Anclora-FileStudio-Linux-x64.tar.zst` | `dist/linux/` | Linux x64 | ✅ Built |
| `Anclora-FileStudio-Linux-x64.tar.zst.sha256` | `dist/linux/` | Linux x64 | ✅ Built |
| `Anclora-FileStudio-Windows-x64-Core.zip` | `dist/windows/` | Windows x64 | Pending |
| `Anclora-FileStudio-Windows-x64-Core.zip.sha256` | `dist/windows/` | Windows x64 | Pending |

Windows Full is only generated when ALL announced tools are present and validated.

## Build commands

```bash
# Orchestrator
bash scripts/build-portables.sh --linux
bash scripts/build-portables.sh --windows
bash scripts/build-portables.sh --all

# Per-platform scripts (also callable directly)
bash scripts/build-linux-portable.sh
bash scripts/build-windows-portable.sh

# Verification
bash scripts/verify-linux-portable.sh
bash scripts/smoke-linux-portable.sh
bash scripts/smoke-windows-portable.sh
```

## Package contents (Linux)

```
Anclora-FileStudio-Linux-x64/
├── start-anclora-filestudio.sh    (executable)
├── stop-anclora-filestudio.sh     (executable)
├── diagnose-anclora-filestudio.sh (executable)
├── manifest.json                  (capabilities, versions)
├── VERSION.txt
├── LEEME.txt
├── THIRD_PARTY_NOTICES.txt
├── SBOM.cdx.json
├── app/
│   ├── server.js                  (Next.js standalone entry)
│   ├── package.json               (minimal)
│   ├── node_modules/              (traced deps: next, react, better-sqlite3, sharp)
│   ├── .next/
│   │   ├── server/                (server RSC bundles)
│   │   ├── static/                (client JS/CSS)
│   │   └── *.json                 (manifests)
│   └── public/
├── data/                          (SQLite DB, created at runtime)
├── temp/                          (temp files, created at runtime)
├── logs/                          (app logs, created at runtime)
├── tools/                         (placeholder; system tools used from PATH)
├── licenses/
└── models/
```

## Build time (approximate)

| Phase | Time |
|-------|------|
| Next.js build (standalone) | ~2 min (skipped if exists) |
| Staging preparation | ~30s |
| zstd -T0 -19 compression | ~30s |
| **Total** | **~3 min** |

## Size

| Uncompressed | Compressed (zstd -19) |
|---|---|
| ~44 MB | ~14 MB |
