# Linux Portable — Execution Report

Date: 2026-06-16
Build host: WSL2 Ubuntu 22.04
Node.js (bundled): v22.22.1 (ELF x86-64, ABI 127)
Sharp: 0.35.1 / libvips 8.18.3

## Artifact

```text
dist/linux/Anclora-FileStudio-Linux-x64.tar.zst
dist/linux/Anclora-FileStudio-Linux-x64.tar.zst.sha256
```

| Property    | Value                                                            |
|-------------|------------------------------------------------------------------|
| Size        | 51 MB                                                            |
| SHA-256     | 8160c05fc4170e408459dd3e30d995fa3c9b41964b40e05be8d76a8598376738 |
| Compression | zstd level 19                                                    |

## Issues fixed in this build

### Fix 1 — Turbopack `.next/node_modules/` stubs (prior build)

Next.js standalone copies external module stubs (better-sqlite3, sharp) into `.next/node_modules/`.
The previous build script excluded that directory, causing runtime failures.
Fixed by removing `! -name "node_modules"` from the `.next/` copy filter.

### Fix 2 — libvips-cpp.so.8.18.3 missing (this build)

**Root cause:** Next.js standalone output traces JS files but NOT binary `.so` files.
`@img+sharp-libvips-linux-x64@1.3.0/lib/` in standalone only contains `index.js` —
`libvips-cpp.so.8.18.3` (17MB) is absent.

Additionally, the standalone omits the pnpm intra-package symlink
`@img+sharp-linux-x64@0.35.1/node_modules/@img/sharp-libvips-linux-x64`
which is required by the RPATH `$ORIGIN/../../sharp-libvips-linux-x64/lib/` embedded
in `sharp-linux-x64-0.35.1.node`.

**Fix:**

1. Copy complete `lib/` from `node_modules/.pnpm/@img+sharp-libvips-linux-x64@1.3.0` into package
2. Recreate the missing `sharp-libvips-linux-x64` symlink in `@img+sharp-linux-x64@0.35.1`
3. Build hard-fails if either file is missing or not ELF x86-64
4. `ldd` check confirms no unresolved dependencies before packaging

### Fix 3 — Sharp engine version reporting

`sharp-engine.ts` was reporting `sharp@8.18.3` (libvips version) as the Sharp version.
Fixed to report `sharp@0.35.1` (Sharp npm package version) with libvips in `binaryPath`.

## Verification results (53/53 PASS, 0 WARN, 0 FAIL)

```text
[PASS] tar.zst exists: 51M
[PASS] sha256 file exists
[PASS] SHA-256 OK: 8160c05fc4170e408459dd3e30d995fa3c9b41964b40e05be8d76a8598376738
[PASS] start-anclora-filestudio.sh
[PASS] stop-anclora-filestudio.sh
[PASS] diagnose-anclora-filestudio.sh
[PASS] manifest.json / VERSION.txt / LEEME.txt / THIRD_PARTY_NOTICES.txt / SBOM.cdx.json
[PASS] app/server.js / app/.next/static / runtime/node
[PASS] dir: app / data / temp / logs
[PASS] executable: *.sh (3/3)
[PASS] Valid JSON: manifest.json / SBOM.cdx.json
[PASS] manifest.name / version / buildId / buildDate / commit / platform / arch / capabilities
[PASS] platform=linux / arch=x64
[PASS] runtime/node: ELF x86-64 — v22.22.1
[PASS] Launcher uses bundled node
[PASS] better_sqlite3.node is ELF x86-64 / dynamic deps OK
[PASS] sharp-linux-x64-0.35.1.node is ELF x86-64
[PASS] @img/sharp-libvips-linux-x64@1.3.0 directory exists
[PASS] libvips-cpp.so.8.18.3 is a real file (not symlink)
[PASS] libvips-cpp.so.8.18.3 is ELF x86-64
[PASS] libvips-cpp.so.8.18.3 size OK (17MB)
[PASS] No broken symlinks in sharp@0.35.1 pnpm tree
[PASS] sharp .node dynamic deps OK (ldd)
[PASS] Sharp loads with bundled node: sharp=0.35.1 vips=8.18.3
[PASS] No .dll files (Windows artifacts absent)
[PASS] No secrets / no .git / no developer paths in launchers
[PASS] Launcher binds to 127.0.0.1 / does not bind to 0.0.0.0
[PASS] THIRD_PARTY_NOTICES.txt / SBOM.cdx.json present
```

## Smoke test results (PASS)

```text
[PASS] start-anclora-filestudio.sh / stop-anclora-filestudio.sh
[PASS] manifest.json / VERSION.txt / app/server.js / app/.next/static
[PASS] No developer paths (excl. Next.js build artifacts)
[PASS] SHA-256 OK
[PASS] manifest.json is valid JSON
[PASS] Sharp PNG→WebP: OK width=4 height=4 size=68 (output 68 bytes)
```

## Independent validation (`~/Downloads/Prueba Anclora Linux Corregida/`)

| Check | Result |
| --- | --- |
| SHA-256 match | PASS |
| runtime/node version | PASS - v22.22.1 ELF x86-64 |
| libvips-cpp.so.8.18.3 (real file, 18MB, ELF x86-64) | PASS |
| Sharp loads: sharp=0.35.1, vips=8.18.3 | PASS |
| PNG-to-WebP conversion (8x8, 70 bytes output) | PASS |
| Health endpoint: ok=true, nodeVersion=v22.22.1 | PASS |
| History endpoint (SQLite) | PASS |

## Security constraints met

- App listens only on 127.0.0.1 (loopback), port range 3847-3857
- No 0.0.0.0 binding
- No `.env`, `.pem`, `.key` files in package
- No `.git` directory in package
- No developer paths in launcher scripts
- `better_sqlite3.node`: ELF x86-64 (Linux)
- `sharp-linux-x64-0.35.1.node`: ELF x86-64 (Linux)
- `libvips-cpp.so.8.18.3`: ELF x86-64, real file (not symlink), 17MB
- No Git operations in build script
- All binary downloads verified against toolchain.lock.json SHA-256
