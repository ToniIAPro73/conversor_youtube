# Anclora FileStudio Web UX — Decisions

## D1: Favicon source
**Decision:** Copy `public/brand/logo-anclora-fileStudio.png` to `src/app/icon.png`.  
Next.js App Router uses `app/icon.png` as the page icon automatically (no build step needed).  
The existing `src/app/favicon.ico` (default Next.js) remains as the legacy ICO fallback.

## D2: `href="#"` replacement strategy
**Decision:** Create `ExternalActionLink` component with two states:
- `enabled` → renders `<a href={url} target="_blank" rel="noopener noreferrer">`
- `disabled-unconfigured` → renders `<button type="button" disabled aria-disabled="true">` with tooltip

No `href="#"` anywhere. Empty URL = disabled button.

## D3: Canonical TARGETS matrix
**Decision:** Create `src/lib/browser-conversion/capabilities.ts` as single source of truth.  
Remove the duplicated `TARGETS` constant from both `web-mode-converter.tsx` and `browser-conversion/index.ts`.  
`index.ts` imports from `capabilities.ts`.

## D4: CSV/TSV parser
**Decision:** Replace naive `split(",")` / `split("\t")` with a proper RFC 4180 state-machine parser.  
Use `csv-parse/sync` (already installed) via a dynamic import with fallback to custom parser to avoid  
bundle-size issues. The implementation must strip UTF-8 BOM, handle CRLF/LF, quoted fields, embedded  
newlines, and escaped quotes.

## D5: WebModeConverter layout
**Decision:** Full redesign:
1. Brand header with logo + name + "Versión Web" badge
2. Subtitle in plain Spanish (no technical terms in primary view)
3. Drag & drop dropzone + click-to-select (separate component)
4. Conversion result with format + targets
5. "Para estas conversiones necesitas Desktop" section grouped by category
6. Privacy section with plain language + collapsible technical details
7. Download/Support buttons via `ExternalActionLink`

## D6: Health route
**Decision:** Return `"web-production"` when `process.env.VERCEL_ENV === "production"`.  
Return `"web-preview"` for all other Vercel environments (preview, development).

## D7: Desktop regression protection
**Decision:** Web changes are confined to:
- `src/components/converter/web-mode-converter.tsx` (Web only, not rendered in Desktop mode)
- `src/components/web/` (new, Web only)
- `src/components/converter/web-file-dropzone.tsx` (Web only)
- `src/lib/browser-conversion/` (browser-only, not imported by Desktop engines)
- `src/lib/filestudio-brand.ts` (safe metadata, no runtime side effects)
- `src/app/layout.tsx` (metadata only, no component logic)

Desktop page (`page.tsx` when `isWebMode === false`) is unchanged.

## D8: File size display
**Decision:** Show "1 MB máximo" in the dropzone before file selection. Show file size after selection.  
Error message uses plain language: "El archivo es demasiado grande. La versión Web admite hasta 1 MB."

## D9: Language
**Decision:** `<html lang="es">` (primary language is Spanish).  
English strings kept in `src/i18n/en.ts` for completeness but Web UI is Spanish-primary.
