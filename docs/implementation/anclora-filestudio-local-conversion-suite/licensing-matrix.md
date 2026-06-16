# Matriz de licencias — Anclora FileStudio

## Dependencias Node.js (npm/pnpm)

| Paquete | Licencia | Redistribución | Notas |
|---|---|---|---|
| next | MIT | Libre | |
| react | MIT | Libre | |
| react-dom | MIT | Libre | |
| better-sqlite3 | MIT | Libre | Requiere recompilación por ABI |
| sharp | Apache 2.0 | Libre | Incluye libvips (LGPL 2.1+) |
| zod | MIT | Libre | |
| sonner | MIT | Libre | |
| lucide-react | ISC | Libre | |
| tailwindcss | MIT | Libre | |
| vitest | MIT | Libre | Solo devDep |
| @playwright/test | Apache 2.0 | Libre | Solo devDep |

## Herramientas externas (binarios del sistema)

| Herramienta | Licencia SPDX | Redistribución | Estrategia |
|---|---|---|---|
| FFmpeg | GPL-2.0-or-later (builds comunes) | Con código fuente o enlace | Bundled (builds GPL disponibles) |
| FFprobe | GPL-2.0-or-later | Con código fuente o enlace | Bundled junto a FFmpeg |
| yt-dlp | Unlicense | Libre | Bundled |
| QPDF | Apache-2.0 | Libre | Bundled |
| 7-Zip | LGPL-2.1 + unRAR-restriction | Binario redistribuible, RAR solo extracción | Bundled (núcleo LGPL) |
| Pandoc | GPL-2.0-or-later | Redistribución binaria con notice | Pack opcional o bundled |
| LibreOffice | LGPL-3.0 | Con código fuente o enlace | Pack opcional (tamaño) |
| Calibre | GPL-3.0 | Con código fuente | Pack opcional |
| Tesseract | Apache-2.0 | Libre | Bundled o system |
| Poppler | GPL-2.0 | Redistribución con código fuente | System o pack |
| Node.js runtime | MIT | Libre | Bundled en distribución portable |

## Reglas de distribución por artefacto

### Windows Full ZIP

Incluir como mínimo:

- `THIRD_PARTY_NOTICES.txt` con todos los notices
- `licenses/` con texto completo de cada licencia
- Enlace a código fuente de GPL/LGPL o código fuente bundled

No incluir:

- Calibre (GPL-3) en el ZIP base — incluir en Ebook Pack con notice separado
- LibreOffice en ZIP base si hace el tamaño inmanejable — incluir en Office Pack

### Windows Core ZIP

Herramientas con licencias permisivas únicamente:

- FFmpeg/FFprobe (builds GPL con notice y enlace a fuentes)
- yt-dlp (Unlicense)
- QPDF (Apache-2.0)
- 7-Zip (LGPL — binario redistribuible)
- Tesseract (Apache-2.0)

### Packs opcionales

| Pack | Herramientas | Licencias | Instalación |
|---|---|---|---|
| Office Pack | LibreOffice, Pandoc | LGPL-3, GPL-2 | Descarga desde fuente oficial |
| OCR Pack | Tesseract langs spa+eng, Poppler | Apache-2, GPL-2 | Descarga desde fuente oficial |
| Ebook Pack | Calibre | GPL-3 | Descarga desde fuente oficial |
| Vision Pack | ONNX Runtime, modelo BG removal | MIT / modelo verificado | Bundled con hash fijado |

## Modelo ONNX para background removal

**Requisitos de licencia del modelo:**

- Licencia explícita: MIT, Apache-2.0, CC-BY-4.0 o similar permisiva
- Permite uso comercial
- Permite redistribución
- No requiere atribución en interfaz (o atribución documentable)
- No depende de APIs externas en inferencia

**Candidatos a evaluar (verificar antes de integrar):**

- `RMBG-1.4` (BRIA AI) — Verificar términos: restricciones comerciales posibles
- `u2net` — Apache-2.0 — Candidato preferido
- `isnet-general-use` — MIT — Candidato alternativo

**Proceso de verificación obligatorio:**

1. Leer licencia completa del modelo (no solo del repositorio wrapper)
2. Verificar que permite redistribución en distribuciones portables
3. Fijar hash SHA256 del archivo del modelo
4. Registrar en `toolchain.lock.json`
5. Incluir en `THIRD_PARTY_NOTICES.txt`

## Verificación de compliance

Antes de cada release de distribución, ejecutar:

```bash
pnpm audit:licenses
```

El script debe verificar:

- Todas las dependencias npm tienen licencia identificada
- Ninguna dependencia tiene licencia incompatible con redistribución
- `THIRD_PARTY_NOTICES.txt` incluye todos los componentes
- `SBOM.cdx.json` está actualizado
