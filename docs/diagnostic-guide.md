# Guía de Diagnóstico — Anclora FileStudio

## Tabla de estados del panel de Diagnóstico

| Color | Ícono | Significado | Qué hacer |
|---|---|---|---|
| **Verde** | ✓ | Herramienta disponible y lista | Nada — la función está operativa |
| **Ámbar** | ℹ | Herramienta opcional no instalada | Instalar solo si necesitas esa función específica |
| **Rojo** | ✗ | Componente requerido ausente | Reparar/reinstalar o contactar con soporte |

## Herramientas requeridas para el flujo YouTube

Las siguientes herramientas son **esenciales** para descargar y convertir vídeos de YouTube.
Si aparecen en rojo, la funcionalidad principal está afectada.

| Herramienta | Función | Estado esperado |
|---|---|---|
| **yt-dlp** | Descarga de vídeos de YouTube y otros sitios | Verde |
| **FFmpeg** | Conversión de audio/vídeo, mezcla de streams | Verde |
| **FFprobe** | Análisis de metadatos y validación de salida | Verde |

## Herramientas opcionales

Las siguientes herramientas amplían las capacidades de Anclora FileStudio pero **no son necesarias
para YouTube ni para las conversiones de audio/vídeo básicas**. Si aparecen en ámbar, es
comportamiento normal en el portable base.

| Herramienta | Función habilitada | Cómo instalar |
|---|---|---|
| **LibreOffice** | Conversión de documentos Office (DOCX, XLSX, PPTX → PDF) | [libreoffice.org](https://libreoffice.org) |
| **Calibre** | Conversión de libros electrónicos (EPUB, MOBI) | [calibre-ebook.com](https://calibre-ebook.com) |
| **Tesseract OCR** | Reconocimiento de texto en imágenes (OCR) | `apt install tesseract-ocr` / [tesseract-ocr.github.io](https://tesseract-ocr.github.io) |
| **Poppler** | Conversión de PDF a imagen (pdftoppm) | `apt install poppler-utils` / incluido en portable Windows |

## Calidad de vídeo 4K y resoluciones altas

### ¿Por qué usar "Máxima calidad original"?

YouTube distribuye contenido 1440p y 2160p (4K) **exclusivamente en formato WebM/VP9 o AV1**.
Si solicitas MP4 compatible, la app buscará streams H.264 que pueden estar limitados a 1080p.

| Perfil | Contenedor | Resolución máxima | Recodificación |
|---|---|---|---|
| **Máxima calidad original** | MKV/WebM (preserva source) | Hasta 4K/8K según fuente | No — solo merge/remux |
| **MP4 compatible** | MP4 (H.264 + AAC) | Generalmente hasta 1080p | Solo si no existe stream MP4 nativo |

### ¿Qué significan los datos de calidad entregada?

Después de cada conversión de vídeo, la app verifica el archivo con **ffprobe** y muestra:

- **Resolución entregada**: altura × anchura real del vídeo descargado
- **FPS reales**: fotogramas por segundo verificados (puede diferir del FPS nominal)
- **Códecs**: vídeo y audio del archivo final
- **Contenedor**: formato del archivo (mp4, mkv, webm)
- **Remux / Recodificación**: si se realizó alguna conversión

Si la resolución entregada es inferior a la solicitada y no hay confirmación del usuario, el job
se marca como **fallido** con el motivo exacto.

## Troubleshooting

### yt-dlp en rojo

1. Verificar que el portable está descomprimido completamente.
2. En Windows: comprobar que `yt-dlp.exe` está en la carpeta `tools/`.
3. En Linux: verificar que las variables de entorno del launcher están configuradas.
4. Actualizar yt-dlp: usar `ACTUALIZAR_YTDLP.bat` (Windows) o `yt-dlp -U` (Linux).

### FFmpeg/FFprobe en rojo

1. No deben faltar en el portable — indican corrupción de la instalación.
2. Descomprimir el portable de nuevo desde el artefacto original.
3. Verificar el SHA-256 del artefacto contra el `release-manifest.json`.

### La descarga de YouTube da resolución inferior a la pedida

1. Verificar que el vídeo realmente ofrece esa resolución (analizar metadatos primero).
2. Usar perfil **"Máxima calidad original"** para 1440p/2160p.
3. Si se usa "MP4 compatible" para 4K, la app avisará que puede requerir recodificación.
4. Actualizar yt-dlp — YouTube cambia sus formatos frecuentemente.
