# Matriz de tests — Anclora FileStudio

## Tests unitarios (`pnpm test`)

| Test | Archivo | Estado |
|---|---|---|
| Path safety — rutas válidas | tests/unit/path-safety.test.ts | ✅ |
| Path safety — path traversal bloqueado | tests/unit/path-safety.test.ts | ✅ |
| Capability matrix — formatos compatibles | tests/unit/capability-matrix.test.ts | ✅ |
| Capability matrix — upscaling bloqueado | tests/unit/capability-matrix.test.ts | ✅ |
| URL normalization YouTube | tests/youtube-normalize-url.test.ts | ✅ |

## Tests de integración (`pnpm test:integration`)

| Caso | Motor | Entrada | Salida | Estado |
|---|---|---|---|---|
| Audio WAV → MP3 | FFmpeg | sample.wav | sample.mp3 | pendiente |
| Vídeo MP4 → WebM | FFmpeg | sample.mp4 | sample.webm | pendiente |
| Imagen PNG → WebP | Sharp | sample.png | sample.webp | pendiente |
| Datos JSON → YAML | Data Engine | sample.json | sample.yaml | pendiente |
| PDF → PDF linealizado | QPDF | sample.pdf | linear.pdf | pendiente |
| ZIP → extracción segura | 7-Zip | sample.zip | extracted/ | pendiente |
| Markdown → DOCX | Pandoc | sample.md | sample.docx | pendiente |
| DOCX → PDF | LibreOffice | sample.docx | sample.pdf | pendiente |
| EPUB → AZW3 | Calibre | sample.epub | sample.azw3 | pendiente |
| PNG → TXT (OCR) | Tesseract | sample-scan.png | sample.txt | pendiente |
| PDF escaneado → TXT | Poppler+Tesseract | scan.pdf | scan.txt | pendiente |
| Batch (3 archivos) | Orquestador | 3 inputs | 3 outputs | pendiente |

## Tests de motores (`pnpm test:engines`)

| Motor | Probe real | Versión validada | Estado |
|---|---|---|---|
| FFmpeg | ✅ spawn -version | regex validado | pendiente |
| FFprobe | ✅ spawn -version | regex validado | pendiente |
| Sharp | ✅ require + version | semver | pendiente |
| QPDF | ✅ spawn --version | regex validado | pendiente |
| 7-Zip | ✅ spawn i | regex validado | pendiente |
| Pandoc | ✅ spawn --version | regex validado | pendiente |
| LibreOffice | ✅ spawn --version | regex validado | pendiente |
| Calibre | ✅ spawn --version | regex validado | pendiente |
| Tesseract | ✅ spawn --version | regex validado | pendiente |
| Poppler/pdftoppm | ✅ spawn -v | regex validado | pendiente |
| Data Engine | ✅ (TypeScript puro) | — | pendiente |

## Tests de seguridad (`pnpm test:security`)

| Caso | Descripción | Estado |
|---|---|---|
| Path traversal | `../../../etc/passwd` bloqueado | pendiente |
| Zip bomb | ratio > 100x bloqueado | pendiente |
| Archivo corrupto | no crash, error controlado | pendiente |
| Token usado dos veces | segundo uso rechazado | pendiente |
| Token expirado | rechazado tras 15 min | pendiente |
| Nombre de archivo malicioso | sanitizado correctamente | pendiente |
| Unicode en ruta | procesado sin error | pendiente |
| Symlink fuera de sandbox | bloqueado | pendiente |
| Archivo con doble extensión | MIME real validado | pendiente |
| Magic bytes incorrectos | rechazado | pendiente |

## Tests E2E (`pnpm test:e2e`)

| Caso | Estado |
|---|---|
| Flujo golden path: subir PNG → convertir a WebP → descargar | pendiente |
| Subir URL YouTube → convertir a MP3 → descargar | pendiente |
| Ver historial de jobs | pendiente |
| Ver panel de diagnóstico | pendiente |
| Cancelar job en progreso | pendiente |

## Tests de operaciones avanzadas (`pnpm test:operations`)

| Operación | Estado |
|---|---|
| Fusionar PDFs | pendiente |
| Dividir PDF por rangos | pendiente |
| PDF → PNG por páginas | pendiente |
| SVG → PNG | pendiente |
| Generar favicon | pendiente |
| Cortar audio/vídeo | pendiente |
| Normalizar EBU R128 | pendiente |
| Comprimir a tamaño objetivo | pendiente |

## Tests de automatización (`pnpm test:automation`)

| Caso | Estado |
|---|---|
| Crear receta y reutilizar | pendiente |
| Batch con pausa y reanudación | pendiente |
| Watcher sin bucle | pendiente |
| Cancelación de cola | pendiente |
| Informe CSV de batch | pendiente |

## Tests de background removal (`pnpm test:background-removal`)

| Fixture | Modo | Resultado esperado | Estado |
|---|---|---|---|
| Fondo blanco uniforme | determinista | Canal alfa limpio | pendiente |
| Fondo negro | determinista | Canal alfa limpio | pendiente |
| Tablero 8×8 | determinista | Canal alfa, no tablero en output | pendiente |
| Tablero 16×16 | determinista | Canal alfa, no tablero en output | pendiente |
| Tablero antialias | determinista | Canal alfa | pendiente |
| Logotipo con huecos internos | determinista | Huecos conservados | pendiente |
| Objeto blanco sobre fondo blanco | determinista | Objeto conservado | pendiente |
| Cabello | IA local | Canal alfa con bordes suaves | pendiente |
| Sombras | IA local | Sombra parcialmente conservada | pendiente |
| PNG ya con alfa | determinista | Procesado sin error | pendiente |
| Imagen sin fondo eliminable | determinista | Warning, sin cambios | pendiente |
| Archivo corrupto | cualquiera | Error controlado | pendiente |
| Imagen grande (>20 MB) | determinista | Completado sin OOM | pendiente |
| Batch mixto (5 imágenes) | determinista | 5 outputs con alfa | pendiente |

## Tests de canal alfa (`pnpm test:alpha-channel`)

| Verificación | Estado |
|---|---|
| PNG RGBA: modo verificado | pendiente |
| PNG: píxel transparente existe | pendiente |
| PNG: magic bytes correctos | pendiente |
| PNG: tablero no exportado | pendiente |
| WebP RGBA: modo verificado | pendiente |
| WebP: píxel transparente existe | pendiente |
| WebP: magic bytes correctos | pendiente |

## Tests de portable (`pnpm smoke:portable:*`)

| Plataforma | Caso | Estado |
|---|---|---|
| Windows | Extraer ZIP y ejecutar diagnóstico | pendiente |
| Windows | Arrancar + health check | pendiente |
| Windows | Conversión real por familia | pendiente |
| Windows | Cierre limpio sin procesos huérfanos | pendiente |
| Linux | Extraer tar.zst y ejecutar instalador | pendiente |
| Linux | Arrancar + health check | pendiente |
| Linux | Conversión real | pendiente |
| Linux | Cierre limpio | pendiente |
