# Baseline — Anclora FileStudio Universal E2E

> Fecha: 2026-06-15
> Rama base: `feat/claude-anclora-filestudio-universal-conversion-suite` (commit `aa50271`)
> Rama de trabajo: `feat/zai-anclora-filestudio-universal-e2e`

## Resultados del baseline

### Lint

- 0 errores, 4 warnings
- Warnings: unused vars en sevenzip-engine, pandoc-engine, qpdf-engine

### TypeCheck

- `tsc --noEmit` — **PASA** sin errores

### Tests

- 8 archivos de test, **103 tests pasan**
- 0 tests fallidos
- Archivos: libreoffice-engine (19), pandoc-engine (17), data-engine (13), sharp-engine (15), supported-conversions (15), path-safety (7), youtube-normalize-url (2), engine-registry (15)

### Build

- `next build` — **PASA**
- 11 rutas (1 estática, 10 dinámicas)
- Compilación en 3.9s, TypeScript en 3.1s

### Divergencias documentadas

1. El agente anterior declaró 153 tests; el baseline real muestra 103. Diferencia de 50 tests no localizados.
2. Pandoc y LibreOffice engines están implementados en backend pero NO conectados al frontend.
3. El selector de archivos (`accept`) solo permite audio/video.
4. La API de analyze carece de extensiones Office (.docx, .xlsx, .pptx, etc.).
5. El frontend no maneja `kind: "universal-file"`.
6. El sistema dual legacy/universal causa incompatibilidad de tipos.
7. El parser de progreso solo cubre yt-dlp.
8. Diagnósticos solo muestran yt-dlp/FFmpeg/FFprobe.

## Riesgos identificados

- **R1**: Migración de FFmpeg al registry puede causar regresiones en conversiones multimedia.
- **R2**: LibreOffice headless no está disponible en este entorno; tests de ejecución serán skip.
- **R3**: Pandoc no está disponible en este entorno; tests de ejecución serán skip.
- **R4**: El ZIP portable Windows no se puede verificar sin acceso a Windows.
- **R5**: Calibre y Tesseract requieren instalación adicional.
