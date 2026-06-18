# Anclora FileStudio Web UX — Baseline Audit

**Date:** 2026-06-18  
**Branch:** feat/vercel-web-ux-polish  
**Auditor:** Claude Sonnet 4.6

---

## 1. Branding

| Item | Current state | Issue |
|---|---|---|
| Page title | "Anclora FileStudio - Conversor de YouTube a MP3/MP4" | References YouTube — wrong product |
| Meta description | "Convierte vídeos de YouTube a MP3 o MP4…" | YouTube-specific, wrong |
| HTML lang | `lang="en"` | Should be `lang="es"` |
| Logo in Web UI | Not used | Header text only |
| Logo files | `public/brand/logo-anclora-fileStudio.webp`, `.png` | Exist but not wired into metadata or Web UI |
| Favicon | `src/app/favicon.ico` (default Next.js) | Generic, not brand favicon |
| OG metadata | Missing | Not set |
| Twitter card | Missing | Not set |
| metadataBase | Missing | Required for OG image URLs |

## 2. Assets Discovered

```
src/app/favicon.ico            — default Next.js favicon (generic)
public/brand/logo-anclora-fileStudio.webp
public/brand/logo-anclora-fileStudio.png
```

No `icon.png` in `src/app/` (Next.js App Router icon convention).

## 3. Download / External Links

| Button | Current value | Issue |
|---|---|---|
| Windows | `process.env.NEXT_PUBLIC_WINDOWS_DOWNLOAD_URL \|\| "#"` | `href="#"` — scroll-to-top, forbidden |
| Linux | `process.env.NEXT_PUBLIC_LINUX_DOWNLOAD_URL \|\| "#"` | same |
| Soporte | `process.env.NEXT_PUBLIC_SUPPORT_URL \|\| "#"` | same |

No disabled state. Clicking navigates to `#` (scroll to top).

## 4. Drag & Drop

Not implemented. Only `<input type="file">` exists. No keyboard or pointer fallback.

## 5. Conversion Matrix

Defined **twice** (duplicated constant `TARGETS`):
- `src/components/converter/web-mode-converter.tsx` line 8
- `src/lib/browser-conversion/index.ts` line 9

No single canonical source of truth.

Current matrix (17 routes):
- JSON → YAML, TOML, XML, CSV, TSV
- YAML → JSON, TOML, XML
- TOML → JSON, YAML, XML
- XML → JSON, YAML
- CSV → TSV, JSON
- TSV → CSV, JSON

## 6. CSV/TSV Parser

`parseDelimited()` in `structured-data.ts:88`:
```ts
const rows = text.trimEnd().split(/\r?\n/).map((line) => line.split(delimiter));
```

Issues:
- No RFC 4180 quoted-field support
- Fails on fields with commas inside quotes
- Fails on embedded newlines
- No BOM stripping
- No duplicate header detection
- No empty row handling

## 7. User Copy — Technical Jargon in Public Text

| Location | Text | Issue |
|---|---|---|
| Header subtitle | "…no sube tus archivos ni ejecuta motores binarios en Vercel." | "motores binarios", "Vercel" — technical |
| Privacy card | "…la descarga se genera con Blob. No se envían bytes a `/api/*`." | "Blob", "bytes", "`/api/*`" — technical |

## 8. Health Route

`src/app/api/health/route.ts` always returns `status: "web-preview"` in Vercel mode.  
Should return `"web-production"` when `VERCEL_ENV === "production"`.

## 9. File Size Limit

`BROWSER_CONVERSION_MAX_BYTES = 1_000_000` (1 MB).  
Not displayed anywhere in the UI before the user tries to convert. Error is thrown after reading.

## 10. Desktop Capabilities Section

No section explaining what requires Desktop. One line: "Audio, vídeo, Office…" with no structure.

## 11. i18n Gaps

ES strings exist for Desktop app flow (history, jobs, progress).  
No Web-specific strings for: dropzone states, matrix display, desktop required section, privacy plain-language.

## 12. Regression Risk

- `page.tsx` renders `<WebModeConverter />` when `isWebMode === true` — Desktop flow unchanged
- All Desktop API routes guard with `loadDesktopModule` — safe
- No shared mutable state between Web and Desktop paths
- Risk: modifying `structured-data.ts` could affect Desktop `data-engine.ts` if they share code — they do NOT (separate modules)
