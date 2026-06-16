# Windows Portable — Execution Report

Date: 2026-06-16
Build status: PENDIENTE

## Planned artifact

```
dist/windows/Anclora-FileStudio-Windows-x64-Core.zip
dist/windows/Anclora-FileStudio-Windows-x64-Core.zip.sha256
```

Windows Full distribution is only generated when ALL announced tools (Node.js, ffmpeg, yt-dlp) are genuinely present and verified.

## Known issues in `build-windows-portable.sh`

| Issue | Status |
|-------|--------|
| `NODE_WINDOWS_VERSION` variable empty | Pending fix |
| `YTDLP_WINDOWS_VERSION` variable empty | Pending fix |
| better-sqlite3 prebuilt must match ABI 127 (Node.js v22) | Pending |
| Cross-build from Linux: no .so can be included for Windows | Pending |

## Structural smoke

NOT EXECUTED — Windows smoke requires extracting the ZIP under WSL with 7z/7zz.

## Runtime smoke

NOT EXECUTED — requires Windows environment.

## Windows package structure (planned)

```
Anclora-FileStudio-Windows-x64-Core/
├── INICIAR_ANCLORA_FILESTUDIO.bat
├── CERRAR_ANCLORA_FILESTUDIO.bat
├── DIAGNOSTICO_ANCLORA_FILESTUDIO.bat
├── start-anclora-filestudio.ps1
├── stop-anclora-filestudio.ps1
├── manifest.json
├── VERSION.txt
├── LEEME.txt
├── THIRD_PARTY_NOTICES.txt
├── SBOM.cdx.json
├── app/
│   ├── node.exe                   (Node.js Windows runtime)
│   ├── server.js
│   ├── node_modules/              (win32-x64 native modules)
│   └── .next/
├── data/
├── temp/
├── logs/
└── tools/
    ├── ytdlp/
    │   └── yt-dlp.exe
    └── ffmpeg/
        ├── ffmpeg.exe
        └── ffprobe.exe
```
