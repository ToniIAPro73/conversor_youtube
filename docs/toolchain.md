# Toolchain — Anclora FileStudio

Todas las herramientas externas están documentadas en `scripts/toolchain.lock.json`.
Este documento describe cada herramienta, su propósito y cómo verificar su estado.

## Herramientas del sistema

### FFmpeg + FFprobe

- **Versión fijada:** 4.4.2 (Ubuntu 22.04 LTS)
- **Licencia:** GPL-2.0-or-later
- **Uso:** Conversión de audio y vídeo, extracción de fotogramas, thumbnails, GIFs
- **Probe:** `ffmpeg -version` → debe coincidir con patrón `ffmpeg version (\S+)`
- **Redistribución:** Bundled. Requiere enlace a código fuente GPL en distribución portable.
- **Instalación:** `sudo apt install ffmpeg`

### yt-dlp

- **Versión fijada:** Última estable (actualizar frecuentemente)
- **Licencia:** Unlicense
- **Uso:** Descarga de contenido multimedia desde URLs de YouTube y plataformas compatibles
- **Probe:** `yt-dlp --version` → formato `YYYY.MM.DD`
- **Actualización:** Usar `ACTUALIZAR_YTDLP.bat` (Windows) o `pip install -U yt-dlp` (Linux)

### QPDF

- **Versión fijada:** 10.6.3
- **Licencia:** Apache-2.0
- **Uso:** Manipulación de PDFs: linearización, split, merge, extracción de páginas
- **Probe:** `qpdf --version`
- **Instalación:** `sudo apt install qpdf`

### 7-Zip

- **Versión fijada:** 26.01
- **Licencia:** LGPL-2.1 (núcleo)
- **Uso:** Compresión y extracción de archivos ZIP, 7Z, TAR, etc.
- **Probe:** `7z i` → extrae versión del encabezado
- **Instalación:** `sudo apt install p7zip-full`
- **Nota de seguridad:** El motor implementa límites de ratio de expansión (100x) y
  número de entradas (10 000) para prevenir zip bombs.

### Pandoc

- **Versión fijada:** 2.9.2.1
- **Licencia:** GPL-2.0-or-later
- **Uso:** Conversión de documentos: Markdown, HTML, RST, DOCX, ODT, LaTeX
- **Probe:** `pandoc --version`
- **Redistribución:** Pack opcional (Office Pack). Requiere notice GPL.
- **Instalación:** `sudo apt install pandoc` o `https://pandoc.org/installing.html`

### LibreOffice

- **Versión fijada:** 7.3.7.2
- **Licencia:** LGPL-3.0
- **Uso:** Conversión de formatos Office → PDF, ODF ↔ OOXML
- **Probe:** `libreoffice --version`
- **Redistribución:** Pack opcional (Office Pack). Gran footprint (~300 MB).
- **Nota:** Cada conversión usa un perfil aislado para evitar conflictos de lockfile.
- **Instalación:** `sudo apt install libreoffice`

### Calibre

- **Versión fijada:** 9.9.0
- **Licencia:** GPL-3.0
- **Uso:** Conversión de ebooks: EPUB ↔ MOBI/AZW3, HTML → EPUB
- **Probe:** `ebook-convert --version`
- **Redistribución:** Pack opcional (Ebook Pack). GPL-3 requiere fuentes.
- **Límite:** 50 MB por archivo de entrada.
- **Instalación:** `https://calibre-ebook.com/download_linux`

### Tesseract OCR

- **Versión fijada:** 4.1.1
- **Licencia:** Apache-2.0
- **Uso:** OCR: imagen → texto, imagen → PDF buscable
- **Probe:** `tesseract --version`
- **Paquetes de idioma:** `tesseract-ocr-spa` (español), `tesseract-ocr-eng` (inglés)
- **Instalación:** `sudo apt install tesseract-ocr tesseract-ocr-spa tesseract-ocr-eng`

### Poppler (pdftoppm)

- **Versión fijada:** 22.02.0
- **Licencia:** GPL-2.0
- **Uso:** Rasterización de PDF a imágenes, necesario para OCR de PDFs escaneados
- **Probe:** `pdftoppm -v`
- **Redistribución:** Pack opcional (OCR Pack).
- **Instalación:** `sudo apt install poppler-utils`

## Verificación de estado

```bash
pnpm check:deps
```

Esto verifica que todos los binarios existen, son accesibles y reportan una versión válida.

El panel de diagnóstico en la UI (`/` → pestaña Diagnósticos) muestra el estado en tiempo real
con probes reales ejecutados con `shell: false` y timeout de 8 segundos.

## Actualización de versiones

Cuando se actualice una herramienta:

1. Verificar que la nueva versión es compatible
2. Actualizar `version` en `scripts/toolchain.lock.json`
3. Actualizar `sha256` si el artefacto fue descargado directamente
4. Actualizar este documento
5. Verificar que los tests de integración siguen pasando con `pnpm test:integration`
