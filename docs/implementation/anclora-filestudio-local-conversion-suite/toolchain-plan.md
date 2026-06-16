# Plan de toolchain — Anclora FileStudio

## Objetivo

Fijar versiones, hashes y fuentes de todas las herramientas externas para garantizar
builds reproducibles y auditoría de supply chain.

## Estructura de `toolchain.lock.json`

Cada entrada sigue el esquema:

```json
{
  "id": "ffmpeg",
  "displayName": "FFmpeg",
  "version": "x.y.z",
  "platform": "linux",
  "arch": "x64",
  "sourceUrl": "URL_OFICIAL_INMUTABLE",
  "sha256": "HASH_ESPERADO",
  "license": "GPL-2.0-or-later",
  "licenseUrl": "https://ffmpeg.org/legal.html",
  "binaryRelativePath": "tools/ffmpeg/bin/ffmpeg",
  "versionArgs": ["-version"],
  "versionPattern": "ffmpeg version (\\S+)",
  "requiredFor": ["audio", "video", "gif", "thumbnail"],
  "redistribution": "bundled"
}
```

## Herramientas requeridas por plataforma

### Linux (desarrollo y distribución)

| ID | displayName | Instalación | requiredFor |
|---|---|---|---|
| node | Node.js | Sistema / nvm | runtime |
| pnpm | pnpm | npm global | build |
| ffmpeg | FFmpeg | apt / binario oficial | audio, video |
| ffprobe | FFprobe | apt (junto a ffmpeg) | analysis |
| ytdlp | yt-dlp | pip / release oficial | youtube |
| qpdf | QPDF | apt | pdf |
| sevenzip | 7-Zip | apt (p7zip-full) | archive |
| pandoc | Pandoc | release oficial | document |
| libreoffice | LibreOffice | apt | office |
| calibre | Calibre | apt / release oficial | ebook |
| tesseract | Tesseract | apt | ocr |
| tesseract-spa | Tesseract datos ES | apt (tesseract-ocr-spa) | ocr |
| tesseract-eng | Tesseract datos EN | apt (tesseract-ocr-eng) | ocr |
| poppler | Poppler utils | apt (poppler-utils) | ocr, pdf |
| sharp | Sharp (libvips) | pnpm install | image |

### Windows (distribución portable)

| ID | displayName | Redistribución | Pack |
|---|---|---|---|
| node | Node.js | MIT | Core |
| ffmpeg | FFmpeg | GPL notice + fuentes | Core |
| ytdlp | yt-dlp | Unlicense | Core |
| qpdf | QPDF | Apache-2.0 | Core |
| sevenzip | 7-Zip | LGPL-2.1 | Core |
| tesseract | Tesseract | Apache-2.0 | Core |
| pandoc | Pandoc | GPL notice | Office Pack |
| libreoffice | LibreOffice | LGPL notice | Office Pack |
| calibre | Calibre | GPL-3 | Ebook Pack |
| poppler | Poppler | GPL notice | OCR Pack |
| onnxruntime | ONNX Runtime | MIT | Vision Pack |

## Política de versiones

- Nunca usar `latest` como versión persistente en `toolchain.lock.json`
- Las versiones se fijan en el momento de integración
- Los SHA256 se calculan sobre el artefacto descargado directamente de la fuente oficial
- Las actualizaciones requieren PR específico con re-verificación de hash

## Proceso de verificación de herramienta

```bash
# 1. Descargar desde URL oficial
curl -L "$SOURCE_URL" -o tool-download

# 2. Calcular y verificar hash
sha256sum tool-download
# Comparar con sha256 en toolchain.lock.json

# 3. Verificar versión
./tool-download --version | grep "$VERSION_PATTERN"

# 4. Registrar en toolchain.lock.json
```

## Detección de actualizaciones

```bash
pnpm check:deps
```

El script `scripts/check-dependencies.mjs` verifica:

1. Que los binarios existen en las rutas configuradas
2. Que las versiones detectadas coinciden con `toolchain.lock.json`
3. Que los hashes de los artefactos descargados son correctos (cuando aplica)
4. Que las dependencias npm no tienen vulnerabilidades conocidas

## Scope del toolchain.lock.json

El archivo `scripts/toolchain.lock.json` es la fuente de verdad para:

- Qué versión de cada herramienta se usa
- De dónde se descarga para builds reproducibles
- Qué hash verificar tras la descarga
- Qué licencia aplica
- Para qué capacidades es necesaria
