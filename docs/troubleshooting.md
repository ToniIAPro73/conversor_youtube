# Troubleshooting

## Web version cannot process an advanced format

The Web version supports browser-local JPEG, PNG, WebP, PDF organization and
structured data conversions. Audio, video, Office, OCR, ebooks, archives,
encrypted PDFs and advanced image formats require Desktop.

If `/api/capabilities` reports `execution: "browser"`, the Web page must not
upload the file to the server. If a browser blocks image decoding or PDF loading,
try Desktop for that file.

## Local Agent cannot pair

Check server URL, clock skew, admin approval and that the pairing code has not expired.

## Local Agent requests re-pairing

The refresh token expired, was reused or the device was revoked.

## Service is healthy but not ready

Inspect PostgreSQL, Redis, storage root, JWT key volume and migrations.

## Windows portable fails from a folder with spaces

Symptom:

```text
Cannot find module 'C:\Users\...\Downloads\Prueba'
```

Cause: Windows PowerShell 5.1 builds a single command line for
`Start-Process -ArgumentList`. Passing an absolute `app\server.js` path through
`ArgumentList` can split the path at spaces.

Expected launcher contract:

```text
WorkingDirectory = <portable>\app
ArgumentList = server.js
```

The PowerShell launcher must not call `Read-Host`, because the BAT invokes it
with `-NonInteractive`. Error paths should write the error and return `exit 1`;
the BAT owns any final `pause`.

Regression coverage: `pnpm smoke:portable:windows` extracts the ZIP into a
Windows-local `%TEMP%` path containing spaces, starts
`internal\start-anclora-filestudio.ps1 -SkipBrowser`, verifies
`http://127.0.0.1:<port>/api/health`, checks `error.log` for
`MODULE_NOT_FOUND`, and stops the recorded PID.

## Windows portable reports missing LibreOffice, Calibre, or Tesseract

The portable first checks its bundled `tools\` directory, then valid
`ANCLORA_FILESTUDIO_*` environment variables, then standard Windows
installations, then `PATH`.

Expected standard locations:

```text
C:\Program Files\LibreOffice\program\soffice.exe
C:\Program Files\Calibre2\ebook-convert.exe
C:\Program Files\Tesseract-OCR\tesseract.exe
C:\Program Files\Tesseract-OCR\tessdata
```

If those installations exist, `INICIAR_ANCLORA_FILESTUDIO.bat` should print:

```text
[OK] LibreOffice encontrado
[OK] Calibre encontrado
[OK] Tesseract encontrado
```

For Tesseract, the launcher also sets
`ANCLORA_FILESTUDIO_TESSDATA_PREFIX` to the resolved `tessdata` directory.
