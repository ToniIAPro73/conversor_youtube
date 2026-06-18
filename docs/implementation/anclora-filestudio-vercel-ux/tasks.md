# Anclora FileStudio Web UX — Task List

**Branch:** feat/vercel-web-ux-polish

| # | Task | Files | Status |
|---|---|---|---|
| 1 | Audit docs | docs/implementation/…/baseline.md, tasks.md, ux-decisions.md | ✅ |
| 2 | Brand module | src/lib/filestudio-brand.ts | 🔄 |
| 3 | Favicon icon | src/app/icon.png (copy from public/brand/) | 🔄 |
| 4 | Layout metadata | src/app/layout.tsx | 🔄 |
| 5 | Canonical matrix | src/lib/browser-conversion/capabilities.ts | 🔄 |
| 6 | External action link | src/components/web/external-action-link.tsx | 🔄 |
| 7 | Web file dropzone | src/components/converter/web-file-dropzone.tsx | 🔄 |
| 8 | Robust CSV/TSV | src/lib/browser-conversion/structured-data.ts | 🔄 |
| 9 | WebModeConverter redesign | src/components/converter/web-mode-converter.tsx | 🔄 |
| 10 | Health route | src/app/api/health/route.ts | 🔄 |
| 11 | i18n web strings | src/i18n/es.ts, src/i18n/en.ts | 🔄 |
| 12 | Tests | tests/vercel/, tests/unit/ | 🔄 |
| 13 | Gates + build | pnpm lint, typecheck, test, vercel build | 🔄 |
| 14 | Commit + PR | git, gh | 🔄 |

## Acceptance Criteria Checklist

- [ ] branding correcto
- [ ] favicon visible
- [ ] metadata corregida (no YouTube)
- [ ] drag & drop operativo
- [ ] selector por click
- [ ] formatos y límite visibles
- [ ] matriz canónica de 17 rutas
- [ ] categorías Desktop explicadas
- [ ] Windows/Linux operativos o deshabilitados
- [ ] Soporte operativo o deshabilitado
- [ ] cero `href="#"`
- [ ] CSV/TSV robustos
- [ ] copy comprensible
- [ ] ES/EN completos
- [ ] cero uploads
- [ ] Preview verde
- [ ] Production verde
- [ ] cero regresiones Desktop
- [ ] commits, push y PR
- [ ] PR no fusionado automáticamente
