# Especificación — Anclora FileStudio Local Conversion Suite

## Identidad canónica

| Concepto | Valor |
|---|---|
| Nombre comercial | `Anclora FileStudio` |
| Slug / package name | `anclora-filestudio` |
| Prefijo de variables | `ANCLORA_FILESTUDIO_` |
| Rama de trabajo | `feat/anclora-filestudio-local-conversion-suite` |

---

## BRAND — Rebranding

| ID | Requisito | Criterio de verificación |
|---|---|---|
| BRAND-01 | Ningún archivo versionado contiene `Link2Media`, `link2media` o `LINK2MEDIA` | `grep -r "Link2Media" . --include="*.ts"...` devuelve 0 resultados |
| BRAND-02 | `package.json` tiene `"name": "anclora-filestudio"` | `jq .name package.json == "anclora-filestudio"` |
| BRAND-03 | Todas las variables de entorno usan prefijo `ANCLORA_FILESTUDIO_` | `grep LINK2MEDIA src/lib/env.ts` devuelve 0 resultados |
| BRAND-04 | Scripts bat/ps1 usan nombre canónico | `ls scripts/*.bat` solo muestra `*ANCLORA_FILESTUDIO*` |
| BRAND-05 | UI muestra `Anclora FileStudio` como nombre de producto | `grep "Anclora FileStudio" src/app/layout.tsx` > 0 |
| BRAND-06 | Título de ventana y metadata Next.js usan nombre canónico | `<title>` contiene `Anclora FileStudio` |

## REL — Fiabilidad y diagnóstico

| ID | Requisito | Criterio de verificación |
|---|---|---|
| REL-01 | `toolchain.lock.json` existe y tiene versión + SHA256 por herramienta | `jq .[].sha256 scripts/toolchain.lock.json` no vacío |
| REL-02 | Cada probe ejecuta el binario real con timeout y valida salida | Revisar código: `spawn(binary, versionArgs, {shell:false, timeout})` |
| REL-03 | Estados de probe: available, missing, version-mismatch, broken, timeout | Enum en `src/lib/engines/registry.ts` |
| REL-04 | Panel de diagnóstico agrupa: Runtime, Motores, Herramientas, Paquetes, Capacidades | Componente `ToolStatusPanel` implementa grupos |
| REL-05 | `/api/health` devuelve versión, plataforma, arch, build ID, toolchain ID | Test de integración de endpoint |
| REL-06 | `/api/capabilities` solo publica operaciones con dependencias resueltas | Unit test de filtrado |
| REL-07 | Poppler/pdftoppm tiene probe explícito visible | Aparece en panel diagnóstico |
| REL-08 | Cache de probes con TTL 5 min y refresh manual | Código documentado en registry.ts |

## DIST — Distribución

| ID | Requisito | Criterio de verificación |
|---|---|---|
| DIST-01 | `pnpm build:portable:windows` genera ZIP con hash SHA256 | Artefacto en `dist/windows/` |
| DIST-02 | `pnpm build:portable:linux` genera tar.zst con hash SHA256 | Artefacto en `dist/linux/` |
| DIST-03 | Distribución no contiene credenciales ni rutas del desarrollador | `grep -r "toni\|/home/" dist/` = 0 |
| DIST-04 | `manifest.json` incluye commit, fecha, plataforma, herramientas, hashes | Validado por schema |
| DIST-05 | `THIRD_PARTY_NOTICES.txt` y `licenses/` presentes en cada distribución | `ls dist/windows/Anclora-FileStudio/licenses/` |
| DIST-06 | Distribución escucha solo en `127.0.0.1` | Config hardcodeado o validado |
| DIST-07 | Smoke test Windows ejecuta conversión real y cierra limpio | Script `pnpm smoke:portable:windows` |
| DIST-08 | Smoke test Linux ejecuta conversión real y cierra limpio | Script `pnpm smoke:portable:linux` |
| DIST-09 | `SBOM.cdx.json` generado y válido | `pnpm generate:sbom` sin errores |

## PDF — Toolkit PDF

| ID | Requisito | Criterio de verificación |
|---|---|---|
| PDF-01 | Fusionar PDFs | Test con 2 fixtures PDF |
| PDF-02 | Dividir por rangos de páginas | Test: extraer páginas 1-3 de un PDF de 5 |
| PDF-03 | Rotar páginas | Test: rotar 90° y verificar metadatos |
| PDF-04 | Imágenes → PDF | Test: PNG array → PDF |
| PDF-05 | PDF → PNG/JPEG | Test: página 1 extraída correctamente |
| PDF-06 | OCR a PDF buscable | Requiere Tesseract; test con imagen escaneada |
| PDF-07 | Redacción permanente de regiones | Validar que el texto redactado no es extraíble |

## IMG — Toolkit imagen

| ID | Requisito | Criterio de verificación |
|---|---|---|
| IMG-01 | Conversión entre JPEG, PNG, WebP, AVIF, TIFF, GIF | Matriz de conversión cubierta en tests |
| IMG-02 | SVG → PNG / PDF | Test con fixture SVG |
| IMG-03 | Generación de favicon (.ico multirresolución) | Output contiene tamaños 16, 32, 48 |
| IMG-04 | Resize, recorte, rotación, corrección EXIF | Tests unitarios |
| IMG-05 | Eliminación de metadatos | `exiftool output.png` no muestra GPS |
| IMG-06 | Procesamiento batch de carpeta | Test con 3 imágenes |

## MEDIA — Toolkit audio y vídeo

| ID | Requisito | Criterio de verificación |
|---|---|---|
| MEDIA-01 | Cortar por tiempo con `-ss` y `-to` | Test: extraer primeros 5 segundos |
| MEDIA-02 | Extraer audio de vídeo | Test: MP4 → MP3 |
| MEDIA-03 | Normalización EBU R128 | FFmpeg loudnorm aplicado correctamente |
| MEDIA-04 | Comprimir a tamaño objetivo | Output dentro del ±20% del objetivo |
| MEDIA-05 | Incrustar/extraer subtítulos SRT/VTT | Tests con fixtures |
| MEDIA-06 | Generar thumbnail y GIF | Tests con fixture vídeo corto |

## AUTO — Automatización

| ID | Requisito | Criterio de verificación |
|---|---|---|
| AUTO-01 | Recetas reutilizables con esquema versionado | Schema en `src/lib/domain/recipes.ts` |
| AUTO-02 | Cola con pausa, reanudación y cancelación | Tests de estado de cola |
| AUTO-03 | Carpetas vigiladas sin bucles (archivos de la propia app excluidos) | Test anti-bucle |
| AUTO-04 | Informes CSV y JSON de resultados batch | Test: 3 archivos → report.json |
| AUTO-05 | Reanudación tras reinicio cuando sea seguro | Test: reinicio con jobs pendientes |

## BG — Background removal y canal alfa

| ID | Requisito | Criterio de verificación |
|---|---|---|
| BG-01 | Motor `background-removal` implementado | `src/lib/engines/background/background-removal-engine.ts` existe |
| BG-02 | Modo determinista: flood fill desde bordes, protección de interiores | Test con tablero 8×8 |
| BG-03 | Modo IA local con modelo ONNX (licencia compatible) | Modelo en Vision Pack con hash fijado |
| BG-04 | Output PNG con canal alfa real verificado | Parser valida: modo RGBA, píxel transparente |
| BG-05 | Output WebP con canal alfa real verificado | Parser valida: modo RGBA, píxel transparente |
| BG-06 | Tablero de preview es CSS/Canvas, no píxeles exportados | Test: output no tiene patrón periódico gris/blanco |
| BG-07 | Batch: múltiples imágenes con mismo preset | Test: 3 imágenes procesadas en lote |
| BG-08 | Validación post-job: alpha existe, píxel transparente, magic bytes | Código en universal-job-processor.ts |
| BG-09 | Fallback al modo determinista si falla el modo IA | Test con modelo ausente |

## SEC — Seguridad

| ID | Requisito | Criterio de verificación |
|---|---|---|
| SEC-01 | Todos los `spawn` usan `shell: false` | `grep "shell: true" src/` = 0 resultados |
| SEC-02 | Path traversal bloqueado con `path.resolve` + `path.relative` | Test con `../../../etc/passwd` |
| SEC-03 | Límites de tamaño, páginas, duración, ratio de expansión | Tests de hardening |
| SEC-04 | Tokens de descarga rotativos con SHA-256 en DB | Test: token solo válido una vez |
| SEC-05 | No se exponen rutas internas en mensajes de error al usuario | Test: error handling oculta rutas |

## TEST — Testing

| ID | Requisito | Criterio de verificación |
|---|---|---|
| TEST-01 | `pnpm test` (unitarios) pasa sin `--passWithNoTests` | Exit code 0 |
| TEST-02 | `pnpm test:integration` pasa con binarios reales | Exit code 0 |
| TEST-03 | `pnpm test:engines` cubre los 9 motores | Exit code 0 |
| TEST-04 | `pnpm test:security` cubre SEC-02, SEC-03, SEC-04 | Exit code 0 |
| TEST-05 | `pnpm test:e2e` pasa flujo golden path en browser | Exit code 0 |
| TEST-06 | `pnpm test:background-removal` cubre BG-02 a BG-09 | Exit code 0 |
| TEST-07 | `pnpm test:alpha-channel` verifica canal alfa real en salidas | Exit code 0 |

## DOC — Documentación

| ID | Requisito | Criterio de verificación |
|---|---|---|
| DOC-01 | `README.md` describe Anclora FileStudio, instalación y uso | Sin referencias al nombre anterior |
| DOC-02 | `docs/format-matrix.md` refleja los 50+ formatos actuales | Actualizado en cada fase |
| DOC-03 | `docs/user-guide.md` documenta flujo completo | Revisado y actualizado |
| DOC-04 | `docs/toolchain.md` describe cada herramienta con versión y licencia | Nuevo archivo en Fase 1 |
| DOC-05 | `docs/security.md` documenta modelo de seguridad | Nuevo archivo en Fase 1 |
| DOC-06 | `docs/portable-windows.md` documenta distribución Windows | Nuevo archivo en Fase 2 |
| DOC-07 | `docs/portable-linux.md` documenta distribución Linux | Nuevo archivo en Fase 2 |
