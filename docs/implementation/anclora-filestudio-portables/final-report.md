# Portables — Final Report

Date: 2026-06-16
Branch: `build/anclora-filestudio-portables`

## Summary

| Item | Status |
| --- | --- |
| Build orchestrator (`build-portables.sh`) | Done |
| Linux build script (complete rewrite) | Done |
| Linux artifact (tar.zst + sha256) | Done (51MB) |
| Linux structural verification (53 checks) | PASS |
| Linux Sharp libvips fix | PASS |
| Linux runtime smoke (9/9) | PASS |
| Windows build script (complete rewrite) | Done |
| Windows artifact (zip + sha256) | Done (250MB) |
| Windows structural smoke (39/39) | PASS |
| Windows runtime smoke | PASS |
| Windows path-with-spaces startup regression | PASS |
| Windows BAT startup from Downloads path with spaces | PASS |
| Docs (7 markdown files) | Done |

## Linux artifact

```text
dist/linux/Anclora-FileStudio-Linux-x64.tar.zst  (51 MB)
dist/linux/Anclora-FileStudio-Linux-x64.tar.zst.sha256
SHA-256: 719bd5e88518400e6385ccadcf8d230e3f1876d41e1be7799049562cfb60dd79
```

Bundled Node.js v22.22.1 (ELF x86-64, ABI 127) — no system Node required.

Runtime smoke results:

```text
[PASS] Launcher: bundled node v22.22.1 starts server in background
[PASS] Health: node=v22.22.1, tools=10/10 available
[PASS] Frontend HTTP 200
[PASS] History endpoint: SQLite working
[PASS] Analyze JSON: kind=universal-file
[PASS] Analyze PNG: kind=universal-file
[PASS] PID file exists
[PASS] Stop script: clean shutdown
[PASS] Restart + persistence
```

## Windows artifact

```text
dist/windows/Anclora-FileStudio-Windows-x64-Core.zip  (250 MB)
dist/windows/Anclora-FileStudio-Windows-x64-Core.zip.sha256
SHA-256: fc5c9983fe597b2730547876c2d22564a919f78257a592b399652b36956f5344
```

Bundled Node.js v24.16.0 (ABI 137, win-x64) — no system Node required.

Structural verify: 91/91 PASS. Structural smoke: 39/39 PASS. Native acceptance: PASS.

### Windows external tool resolution

`start-anclora-filestudio.ps1` and `diagnose-anclora-filestudio.ps1` share
`internal\tool-resolution.ps1`. Resolution order:

1. Portable `tools\` path.
2. Valid `ANCLORA_FILESTUDIO_*` environment variable.
3. Standard Windows installation path.
4. `Get-Command` / `PATH`.

LibreOffice, Calibre, and Tesseract use existing full installations when found:

```text
C:\Program Files\LibreOffice\program\soffice.exe
C:\Program Files\Calibre2\ebook-convert.exe
C:\Program Files\Tesseract-OCR\tesseract.exe
C:\Program Files\Tesseract-OCR\tessdata
```

Tesseract also sets `ANCLORA_FILESTUDIO_TESSDATA_PREFIX` to the resolved
`tessdata` directory.

### Windows launcher path-with-spaces fix

**Root cause:** `start-anclora-filestudio.ps1` passed the absolute
`<portable>\app\server.js` path via `Start-Process -ArgumentList`. In Windows
PowerShell 5.1 this is converted into a command-line string, so paths such as
`C:\Users\...\Downloads\Prueba Anclora Windows ...\app\server.js` can be split
and Node receives only `C:\Users\...\Downloads\Prueba`.

**Fix:** The launcher now validates the absolute file path but starts Node with:

```text
WorkingDirectory = <portable>\app
ArgumentList = server.js
```

The PowerShell launcher also accepts `-SkipBrowser` for automation and no longer
calls `Read-Host`, which is incompatible with the BAT's `-NonInteractive`
PowerShell invocation. Error paths return `exit 1`; only the BAT can pause.

**Regression coverage:** `smoke-windows-portable.ps1` now extracts the package
to `%TEMP%\Prueba Anclora FileStudio Windows <id>`, launches
`internal\start-anclora-filestudio.ps1 -SkipBrowser`, validates the PID belongs
to the bundled `runtime\node.exe`, checks `/api/health` via `127.0.0.1`, asserts
`error.log` has no `MODULE_NOT_FOUND`, and stops the recorded PID. The shell
smoke also blocks `Read-Host`, `ArgumentList = @($ServerJs)`, and global Node
termination patterns.

### semver root cause and fix

**Root cause:** Next.js standalone traces `semver@7.8.1` as a stub (only `package.json`, no `index.js`) in the pnpm flat namespace because it uses its own bundled copy (`next/dist/compiled/semver`). The flat layer step materializes this stub into `app/node_modules/semver/`, but Sharp@0.35.1 requires `semver@^7.8.4` (full package) to load.

**Fix (build-windows-portable.sh):** After flattening node_modules and before removing `.pnpm`, detect if `app/node_modules/semver/index.js` is missing. If so, replace the stub with the full `semver@7.8.4` from `node_modules/.pnpm/semver@7.8.4/node_modules/semver/`. Validates 6 required files: `index.js`, `classes/semver.js`, `classes/range.js`, `functions/parse.js`, `internal/re.js`, `ranges/valid.js`.

### Native Windows acceptance (smoke-windows-portable.ps1)

Tests executed via `powershell.exe` from WSL. ZIP is copied to Windows TEMP first (avoids UNC execution path). PS1 uses string concatenation (no here-strings) for PS5 compatibility.

| Check | Result |
| --- | --- |
| RUNTIME_OK (win32, x64, v24.16.0, ABI 137) | PASS |
| SQLITE_OK (CREATE/INSERT/SELECT/close) | PASS |
| SHARP_OK (sharp=0.35.1 vips=8.18.3) | PASS |
| WEBP_OK (68 bytes, RIFF/WEBP magic) | PASS |
| Launcher from Windows TEMP path with spaces | PASS |
| PID belongs to bundled `runtime\node.exe` | PASS |
| Health via `http://127.0.0.1:<port>/api/health` | PASS |
| `error.log` has no `MODULE_NOT_FOUND` | PASS |
| Stop script releases port and leaves no server process | PASS |
| `INICIAR_ANCLORA_FILESTUDIO.bat` from Downloads path with spaces | PASS |
| NATIVE_ACCEPTANCE_WINDOWS_PASS | PASS |

## Security constraints met

- App listens only on 127.0.0.1 (verified in all launchers)
- No 0.0.0.0 binding
- No .env.local, .pem, .key files in package
- No .git directory in package
- No developer paths in launcher scripts
- No Linux .dll/.so files in Windows package; no Windows .dll in Linux package
- better\_sqlite3.node: ELF x86-64 (Linux), Windows PE MZ (Windows)
- No Git operations in any build script
- All versions, URLs, and SHA-256 hashes from `scripts/toolchain.lock.json`
- No dynamic version resolution (no API calls, no `latest` URLs without hash)

## Key technical decisions

### Toolchain lock

All binary versions, download URLs, and SHA-256 hashes are stored in `scripts/toolchain.lock.json`.
Every download is verified against the lockfile hash before staging. If the hash doesn't match, the build fails.

### Whitelist copy instead of standalone mirror

Next.js `output: "standalone"` mirrors the full `outputFileTracingRoot` (repo root) into `.next/standalone`.
Using `cp -r "$STANDALONE/." "$app/"` copies everything including developer artifacts.
Fixed by explicitly copying only what the runtime needs: `server.js`, `.next/`, `node_modules/`, `public/`.

### Turbopack `.next/node_modules/` stubs

Turbopack places external module stubs in `.next/node_modules/` (e.g. `better-sqlite3-hash`, `sharp-hash`).
These are distinct from the top-level `standalone/node_modules/` and MUST NOT be excluded from the copy.
The previous filter `! -name "node_modules"` when copying `.next/` accidentally excluded these stubs,
causing `better-sqlite3` and `sharp` to fail at runtime with "Cannot find module 'better-sqlite3-hash'".

### BUILD_ID requirement

Next.js standalone server crashes with "Could not find a production build" if `BUILD_ID` is missing.
Fixed by using `find "$STANDALONE/.next" -mindepth 1 -maxdepth 1 ! -name "cache"` instead of an
explicit file list — this ensures `BUILD_ID` and all other `.next/` contents are always included.

### Native module ABI compatibility

- Linux: Node.js v22.22.1 (ABI 127) — bundled `better_sqlite3.node` is the Linux ELF version from pnpm
- Windows: Node.js v24.16.0 (ABI 137) — `better-sqlite3-v12.10.1-node-v137-win32-x64.tar.gz` prebuilt from GitHub

### Next.js build artifact paths

`server.js` and `required-server-files.json` inevitably contain `outputFileTracingRoot: "/home/toni/..."`.
These are excluded from developer-path grep scans via `--exclude` flags.

### FFmpeg rolling build

BtbN FFmpeg builds are rolling — the "latest" URL resolves to a new binary periodically.
The SHA-256 in `toolchain.lock.json` is the hash recorded at lock time (2026-06-16).
When the SHA changes, the cached file must be deleted and the lockfile updated.

### Sharp libvips packaging

Next.js standalone output traces JS but not binary `.so` files. The pnpm intra-package symlink
`@img+sharp-linux-x64@0.35.1/node_modules/@img/sharp-libvips-linux-x64` (needed by the RPATH in
the `.node` file) is also absent from the standalone. Both are explicitly restored in the build script.

## Pending work

- Manual UI acceptance from a double-clicked BAT can still be repeated before a
  public release, but automated native startup coverage now exercises the same
  internal launcher from a Windows-local path with spaces.
