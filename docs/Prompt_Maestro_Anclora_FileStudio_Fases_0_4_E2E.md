# Prompt maestro end-to-end — Anclora FileStudio Universal Conversion Suite

> Implementación full-stack, mobile-first y empaquetado portable completo para Windows  
> Repo de referencia: `toniiapro73/conversor_youtube`  
> Baseline analizada: commit `8a5edab`, 15 de junio de 2026  
> Ejecución objetivo actual: portátil/escritorio Windows 10/11 x64  
> Preparación futura: adaptación móvil sin implementar todavía una app nativa

---

## 1. Rol del agente

Actúa como un equipo senior coordinado de:

- Arquitectura full-stack TypeScript y Next.js.
- Ingeniería de motores de conversión local.
- UX/UI mobile-first y accesibilidad.
- Seguridad de procesos y archivos.
- QA automatizado, pruebas E2E y validación de artefactos.
- Empaquetado portable para Windows.
- Documentación técnica y control Git.

Tu misión es implementar de extremo a extremo las mejoras descritas en este prompt. No debes limitarte
a crear clases, mocks o tests unitarios aislados. La funcionalidad se considerará terminada únicamente
cuando pueda utilizarse desde la interfaz, cree un job real, ejecute el motor correcto, valide el
resultado y permita descargar el archivo convertido.

No declares una fase como `DONE` basándote solo en compilación, tipos o tests unitarios.

---

## 2. Objetivo principal

Transformar Anclora FileStudio en un conversor universal local, coherente y realmente operativo, manteniendo:

1. La conversión desde enlaces de YouTube para contenido autorizado.
2. La conversión de archivos multimedia locales.
3. La conversión de imágenes, documentos, hojas de cálculo, presentaciones, PDF, datos y archivos.
4. La conversión de ebooks mediante Calibre.
5. OCR de imágenes y PDF mediante Tesseract y un adaptador PDF compatible.
6. Procesamiento por lotes.
7. Diagnóstico de todas las herramientas.
8. Experiencia visual premium y mobile-first.
9. Procesamiento local y privado.
10. Un ZIP portable de Windows con todos los runtimes y binarios necesarios.

La implementación actual se realizará para navegador local en portátil/escritorio. No se debe convertir
el proyecto en Electron, Tauri, React Native, Capacitor ni PWA durante esta tarea.

---

## 3. Fuentes de verdad y orden de prioridad

Aplica este orden:

1. Código real del repo y comportamiento comprobado.
2. Este prompt.
3. `Anclora FileStudio_Analisis_Completo.md`, si está disponible en el repo o contexto.
4. Documentación existente en `README.md`, `AGENTS.md`, `CLAUDE.md` y `docs/audits/`.
5. Comentarios o memorias antiguas, solo si coinciden con el código actual.

Cuando la documentación contradiga el código, documenta la divergencia y corrige la documentación.
No conserves afirmaciones obsoletas como que una funcionalidad está terminada cuando no funciona desde
la interfaz.

---

## 4. Estado inicial verificado

El baseline contiene una base sólida:

- Next.js 16, React 19, TypeScript, Tailwind CSS 4 y shadcn/ui.
- Persistencia SQLite con `better-sqlite3`.
- Detección universal de archivos.
- Registro de motores con `ConversionEngine`.
- Motores existentes para Sharp, datos estructurados, QPDF, 7-Zip, Pandoc y LibreOffice.
- Seguridad de procesos con `spawn`, `shell: false`, timeouts y saneamiento de nombres.
- Tokens de descarga hasheados.
- Scripts iniciales para distribución portable de Windows.

También contiene fallos críticos que deben resolverse:

1. El selector de archivos excluye documentos y otros formatos.
2. La API de análisis contiene listas incompletas y duplicadas.
3. El frontend no modela correctamente `kind: "universal-file"`.
4. La página envía siempre el descriptor multimedia legado.
5. El panel de análisis solo entiende multimedia.
6. El panel de compatibilidad usa el tipo legado `enabled`.
7. La API de jobs solo admite formatos multimedia.
8. Los jobs universales no se enrutan al registro de motores.
9. FFmpeg sigue fuera del registro común.
10. El progreso de FFmpeg y de los motores documentales no está unificado.
11. Diagnóstico y health-check solo cubren parcialmente las herramientas.
12. La limpieza de base de datos y archivos no está coordinada.
13. Los errores visibles son demasiado genéricos.
14. La interfaz mezcla textos y no dispone de una capa mínima de i18n.
15. El pipeline portable tiene rutas locales hardcodeadas y tolera ausencia de tests.
16. El ZIP actual no incluye todas las herramientas de los motores universales.

---

## 5. Reglas no negociables

### 5.1 Integridad y seguridad

- No usar `shell: true`.
- No concatenar comandos con datos del usuario.
- Usar `spawn(binary, args, { shell: false, windowsHide: true })`.
- Validar todas las rutas con `path.resolve()` y `path.relative()`.
- Sustituir comprobaciones sensibles basadas solo en `startsWith()`.
- No escribir fuera de los directorios de datos, temporales y salida autorizados.
- Sanitizar nombres y limitar longitudes.
- Limitar tamaño, duración, número de páginas, número de archivos y tiempo de ejecución.
- Aplicar timeouts y cancelación por job.
- No incluir secretos, `.env.local`, `.git`, claves ni rutas del desarrollador en el ZIP.
- Escuchar solo en `127.0.0.1`.
- No abrir acceso LAN.
- No ejecutar macros de documentos.
- Ejecutar LibreOffice en modo headless con perfil aislado por job.
- Renderizar previews HTML o Markdown únicamente después de sanitizarlos.
- Proteger contra ZIP bombs, path traversal al extraer y archivos excesivamente anidados.

### 5.2 Git

- No usar `git reset --hard`, `git clean -fd`, `git checkout -- .` ni operaciones destructivas.
- No sobrescribir cambios del usuario.
- Comprobar antes de empezar:

```bash
git status --short
git branch --show-current
git log --oneline -10
git remote -v
```

- Si existe `development`, usarla como base. En caso contrario, usar la rama estable actual indicada por
  el repo y documentar la decisión.
- Crear una rama nueva:

```text
feat/<agente>-anclora-filestudio-universal-e2e
```

- Sustituir `<agente>` por `codex`, `claude` u otro identificador real.
- Hacer commits pequeños y convencionales por fase.
- No fusionar ni promover a ramas permanentes sin una instrucción explícita del usuario.
- Al finalizar, dejar la rama feature limpia y subida al remoto si existe acceso.

### 5.3 Calidad

- No usar `--passWithNoTests`.
- No silenciar errores de lint, TypeScript, Playwright o Vitest.
- No reducir cobertura para conseguir verde.
- No cambiar versiones principales de dependencias sin necesidad y sin justificarlo.
- Mantener el lockfile.
- Evitar duplicar catálogos de formatos, MIME, extensiones o capacidades.
- Mantener `README.md` y documentación coherentes con lo realmente implementado.
- No declarar compatibilidad con una conversión que no tenga ruta ejecutable y prueba.
- No dejar `TODO` críticos ni rutas muertas.
- No aceptar una validación basada solo en que el archivo de salida existe.

### 5.4 UX mobile-first

Aunque el artefacto final sea para portátil, diseñar primero para 360 px:

- Sin scroll horizontal.
- Controles táctiles de al menos 44 × 44 px.
- Labels visibles en todos los campos.
- Navegación usable con teclado.
- Estados de foco visibles.
- Nada esencial dependiente únicamente de `hover`.
- Paneles que se apilen en móvil y aprovechen el ancho en escritorio.
- Comprobar 360, 390, 768, 1366 y 1920 px.
- Mantener contraste AA.
- Respetar `prefers-reduced-motion`.
- No bloquear una futura extracción del dominio a una app móvil.

---

## 6. Entregables obligatorios

Al finalizar deben existir, como mínimo:

1. Código funcional de todas las fases aceptadas.
2. Especificación y trazabilidad de tareas.
3. Tests unitarios, integración y E2E.
4. Fixtures de conversión pequeñas y redistribuibles.
5. Reporte de validación real.
6. Documentación de herramientas y licencias.
7. Scripts de build reproducibles.
8. ZIP portable completo:

```text
scripts/Anclora FileStudio-Windows-x64.zip
```

9. Hash:

```text
scripts/Anclora FileStudio-Windows-x64.zip.sha256
```

10. Manifiesto de componentes y versiones.
11. Informe final con ruta, tamaño y SHA-256.
12. Copia opcional en la carpeta Downloads de Windows, solo si se puede detectar de forma segura.

---

## 7. Fase 0 — Auditoría, baseline y especificación ejecutable

### 7.1 Inspección inicial

Localiza la raíz sin hardcodear rutas:

```bash
REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"
```

Revisa como mínimo:

- `package.json`
- `next.config.ts`
- `src/app/page.tsx`
- `src/app/api/inputs/analyze/route.ts`
- `src/app/api/capabilities/route.ts`
- `src/app/api/jobs/route.ts`
- `src/app/api/jobs/[jobId]/route.ts`
- `src/app/api/download/[jobId]/route.ts`
- `src/components/converter/`
- `src/components/diagnostics/`
- `src/lib/domain/`
- `src/lib/detection/`
- `src/lib/engines/`
- `src/lib/jobs/`
- `src/lib/media/`
- `src/lib/infrastructure/db/`
- `scripts/`
- `tests/`

### 7.2 Baseline obligatoria

Ejecuta y registra resultados reales:

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

No corrijas aún fallos funcionales antes de registrar el baseline.

### 7.3 Documentación SDD ligera

Crea:

```text
docs/implementation/anclora-filestudio-universal-e2e/
├── README.md
├── baseline.md
├── spec.md
├── tasks.md
├── test-matrix.md
├── portable-manifest.md
└── final-validation.md
```

`tasks.md` debe contener IDs trazables, dependencias, estado y evidencia. Ejemplo:

```text
L2M-P0-001 | Selector universal | done | test + captura + E2E
```

### Gate de salida de fase 0

- Baseline guardada.
- Riesgos y divergencias documentados.
- Rama feature creada.
- Árbol de trabajo limpio antes de implementar.
- Matriz de pruebas definida antes de tocar el código.

---

## 8. Fase 1 — Contrato canónico de formatos y descriptores

El problema actual nace, en parte, de listas duplicadas. Crea una única fuente de verdad.

### 8.1 Catálogo canónico

Crea un módulo como:

```text
src/lib/domain/format-catalog.ts
```

Debe definir, de forma tipada:

- ID de formato.
- Categoría.
- Extensiones de entrada.
- Extensión de salida.
- MIME.
- Operaciones posibles.
- Motor preferido.
- Si admite preview.
- Si admite batch.
- Límites aplicables.
- Portabilidad móvil.
- Estado experimental, si corresponde.

Debe generar o alimentar:

- El atributo `accept` del selector.
- La validación de extensiones de la API.
- Los schemas Zod.
- Los labels de UI.
- La resolución MIME.
- La extensión de salida.
- La matriz de pruebas.
- La verificación del ZIP.

No mantengas manualmente la misma lista en varios archivos.

### 8.2 Resultado de análisis unificado

Sustituye el modelo dual frágil por una unión discriminada clara, por ejemplo:

```typescript
type AnalysisResult =
  | RemoteUrlAnalysis
  | LocalMediaAnalysis
  | UniversalFileAnalysis;
```

Incluye siempre:

- `kind`
- `inputId` o referencia persistida segura
- `originalName`
- `storedRelativePath`, cuando corresponda
- `sizeBytes`
- `descriptor`
- `category`
- `detectedFormat`
- `confidence`
- `warnings`

No permitas que la UI haga casts ciegos de respuestas JSON.

### 8.3 Validación de entrada

La API debe:

- Validar tamaño antes y durante la escritura.
- Usar detección por contenido y no confiar solo en la extensión.
- Rechazar discrepancias peligrosas.
- Permitir discrepancias benignas con warning.
- Eliminar el archivo temporal si el análisis falla.
- Persistir el input con un ID estable.
- Devolver errores tipados.

### Gate de salida de fase 1

- No hay listas duplicadas de formatos relevantes.
- El selector y la API derivan del mismo catálogo.
- Tests del catálogo y de cada unión discriminada.
- Un `.md`, `.docx`, `.xlsx`, `.pptx`, `.pdf`, `.png`, `.json` y `.zip` llegan al descriptor correcto.

---

## 9. Fase 2 — Reparación P0 de la conversión universal end-to-end

### 9.1 Selector de archivos

Actualizar `SourceSelector` para:

- Mostrar todos los tipos realmente soportados.
- Aceptar drag-and-drop y selección manual.
- Validar antes de subir cuando sea posible.
- Mostrar feedback para tipos no admitidos.
- Permitir selección múltiple solo cuando se active modo batch.
- Actualizar el texto, aria-label y ayuda.
- No limitarse a audio y vídeo.

### 9.2 API de capacidades

La página debe enviar:

- `descriptor` para el flujo remoto o legado mientras exista.
- `universalDescriptor` para entradas universales.

La respuesta universal debe normalizarse al mismo contrato visual que la multimedia:

- `capabilities`
- `recommended`
- `state`
- `lossProfile`
- `warnings`
- `engineId`
- `mobilePortability`

No usar `enabled` en la UI universal.

### 9.3 API de jobs

Sustituir el enum limitado de formatos por schemas derivados del catálogo.

La petición debe incluir, como mínimo:

```typescript
{
  inputId?: string;
  url?: string;
  localFilePath?: string;
  capabilityId: string;
  presetId: string | null;
  options: Record<string, unknown>;
  rightsConfirmed: boolean;
}
```

No confíes en `engineId`, `operation`, formato o ruta arbitrarios enviados por el cliente. El servidor debe
resolver de nuevo la capability válida desde el descriptor persistido.

### 9.4 Procesador universal

Crea un orquestador común, por ejemplo:

```text
src/lib/jobs/universal-job-processor.ts
```

Responsabilidades:

1. Recuperar job e input.
2. Revalidar capability.
3. Resolver engine.
4. Generar plan.
5. Crear directorio aislado.
6. Ejecutar con progreso y cancelación.
7. Validar artefacto.
8. Persistir metadatos.
9. Crear token.
10. Coordinar limpieza.
11. Registrar logs redactados.
12. Marcar el job como completado solo después de validar.

### 9.5 Wiring de motores existentes

Conecta realmente desde UI hasta descarga:

- Sharp.
- Data engine.
- QPDF.
- 7-Zip.
- Pandoc.
- LibreOffice.

No basta con que estén registrados.

### 9.6 Componentes UI

Actualizar:

- `InputAnalysisCard`
- `CompatibilityPanel`
- `ArtifactResultCard`
- `JobProgressCard`
- `JobHistory`

Deben soportar todas las categorías y no asumir bitrate o resolución en documentos.

### Gate de salida de fase 2

Desde la UI, sin llamadas manuales a la API, deben funcionar como mínimo:

- Markdown → HTML.
- Markdown → DOCX.
- DOCX → PDF.
- JSON → YAML.
- PNG → WebP.
- PDF → una operación segura de QPDF.
- ZIP → inspección o extracción segura en un destino de job.
- Descarga final con token válido.
- Registro correcto en historial.

Cada caso debe tener una prueba E2E o integración real con evidencia.

---

## 10. Fase 3 — Unificación del motor multimedia

### 10.1 FFmpegEngine

Implementa `FFmpegEngine` con la interfaz `ConversionEngine`.

Debe cubrir las capacidades multimedia existentes sin regresión:

- Audio: MP3, M4A, WAV, FLAC y OGG.
- Vídeo: MP4, WebM y MKV.
- Extracción de audio.
- Recorte.
- Normalización, si ya está soportada.
- GIF corto, si ya está soportado.
- Frames o thumbnails, si ya están soportados.
- Subtítulos, si ya están soportados.

Regístralo como `ffmpeg-media`.

### 10.2 Entrada remota

Mantén yt-dlp como adaptador de adquisición autorizado. No lo mezcles de forma confusa con el dominio de
conversión.

Flujo recomendado:

```text
RemoteUrlSourceAdapter → input local temporal → FFmpegEngine → validación → artefacto
```

Preserva la normalización de URLs, límites y mensajes legales.

### 10.3 Migración segura

- No elimines el procesador legado hasta tener paridad.
- Añade tests de caracterización antes de migrar.
- Migra por operaciones.
- Elimina rutas muertas al demostrar paridad.
- Evita mantener dos fuentes de capabilities.

### 10.4 Progreso común

Define eventos comunes:

```typescript
type JobProgressEvent = {
  phase: "queued" | "acquiring" | "analyzing" | "converting" | "validating" | "packaging";
  progress: number;
  messageKey: string;
  details?: Record<string, string | number>;
};
```

Implementa:

- yt-dlp: porcentaje real.
- FFmpeg: progreso por duración con `-progress pipe:2` o salida equivalente estable.
- Pandoc: progreso por etapas.
- LibreOffice: progreso por etapas.
- Motores rápidos: etapas discretas.
- Batch: progreso agregado ponderado.

No inventes porcentajes continuamente cuando una herramienta no los exponga. Usa progreso indeterminado
o hitos discretos.

### Gate de salida de fase 3

- Toda conversión usa el orquestador común.
- FFmpeg aparece en diagnóstico y capabilities.
- No existe duplicidad funcional activa.
- Las conversiones multimedia anteriores siguen funcionando.
- El progreso de FFmpeg ya no queda estático.

---

## 11. Fase 4 — UX premium, mobile-first y accesible

### 11.1 Flujo de conversión

Diseña un flujo claro:

1. Elegir fuente.
2. Analizar.
3. Ver información y advertencias.
4. Elegir salida.
5. Ajustar opciones.
6. Confirmar derechos cuando aplique.
7. Convertir.
8. Ver progreso.
9. Descargar o iniciar otra conversión.

Evita mostrar todos los controles a la vez.

### 11.2 Capacidades y perfiles de pérdida

Mostrar badges consistentes:

- `lossless`
- `metadata-risk`
- `layout-risk`
- `lossy`
- `experimental`

Cada badge debe tener:

- Texto comprensible.
- Icono o patrón adicional al color.
- Tooltip accesible.
- Warning antes de conversiones destructivas.

### 11.3 Preview seguro

Implementar preview limitado para:

- Markdown.
- HTML.
- TXT.
- RST.
- LaTeX como texto.
- JSON, YAML, TOML, XML, CSV y TSV.
- Imagen.
- PDF, si se puede usar PDF.js sin comprometer el bundle.

Condiciones:

- Límite de bytes para preview.
- No ejecutar scripts.
- Sanitizar HTML.
- No cargar archivos completos enormes en el navegador.
- Mostrar claramente cuando el preview es parcial.

### 11.4 Drag-and-drop

- Estados `idle`, `drag-valid`, `drag-invalid`, `uploading` y `error`.
- Feedback inmediato.
- Lista de categorías, no una lista ilegible de extensiones.
- Errores específicos.
- Acceso por teclado.

### 11.5 Diagnóstico

Crear un panel unificado con:

- Motor.
- Herramienta.
- Versión.
- Ruta redactada.
- Estado.
- Capacidades.
- Acción recomendada.
- Botón de reintentar probe.
- Indicador de componente incluido en el ZIP.

Debe cubrir:

- Node.js.
- yt-dlp.
- FFmpeg.
- FFprobe.
- Sharp/libvips.
- QPDF.
- 7-Zip.
- Pandoc.
- LibreOffice.
- Calibre.
- Tesseract.
- Poppler, si se usa para PDF OCR.

### 11.6 i18n mínima y limpia

Implementar una capa de mensajes:

```text
src/i18n/es.ts
src/i18n/en.ts
```

- Español por defecto.
- Inglés preparado y seleccionable.
- No mover nombres técnicos.
- No dejar mensajes de backend expuestos directamente.
- El backend devuelve `code` y detalles seguros.
- El frontend localiza el mensaje.

### 11.7 Validación responsive

Playwright debe verificar al menos:

- 360 × 800.
- 390 × 844.
- 768 × 1024.
- 1366 × 768.
- 1920 × 1080.

Comprobar:

- Ausencia de overflow horizontal.
- Controles visibles.
- Modales dentro del viewport.
- Navegación por teclado.
- Foco.
- Estados de error.
- Preferencia de movimiento reducido.

### Gate de salida de fase 4

- Flujo completo usable en 360 px.
- No hay textos cortados ni controles fuera de pantalla.
- No hay campos sin label visible.
- Diagnóstico completo.
- Errores localizados y accionables.
- Previews seguros.
- Auditoría básica de accesibilidad sin errores críticos.

---

## 12. Fase 5 — Errores, limpieza, persistencia y hardening

### 12.1 Modelo de errores

Crear códigos estables, por ejemplo:

```text
TOOL_NOT_AVAILABLE
INPUT_UNSUPPORTED
INPUT_CORRUPTED
CAPABILITY_NOT_AVAILABLE
OUTPUT_FORMAT_INVALID
PROCESS_TIMEOUT
PROCESS_CANCELLED
ARTIFACT_VALIDATION_FAILED
INSUFFICIENT_DISK_SPACE
ARCHIVE_UNSAFE
OCR_LANGUAGE_MISSING
BATCH_PARTIAL_FAILURE
```

Cada error debe incluir:

- Código.
- Mensaje localizable.
- Etapa.
- Motor.
- Reintento posible.
- Detalle técnico redactado para logs.

### 12.2 Limpieza coordinada

Unificar limpieza de base de datos y filesystem:

- Job expirado implica artefactos eliminados o pendientes de reintento.
- Archivo huérfano implica registro y limpieza.
- No borrar inputs usados por jobs activos.
- Limpieza idempotente.
- Lock o mecanismo para evitar dos limpiezas concurrentes.
- Métricas de elementos eliminados, fallidos y recuperados.
- Tests de reinicio e interrupción.

### 12.3 Espacio en disco

Antes de trabajos grandes:

- Estimar espacio.
- Comprobar espacio libre.
- Aplicar límites configurables.
- Detener con error específico.
- No dejar restos tras fallar.

### 12.4 Descarga

- Usar helper de path safety canónico.
- Token de un solo uso o política documentada.
- Invalidar token tras descarga si esa es la política elegida.
- Usar nombre seguro y MIME correcto.
- Validar que el artefacto pertenece al job.

### Gate de salida de fase 5

- Tests de traversal y symlinks.
- Tests de ZIP bomb y extracción segura.
- Tests de timeout y cancelación.
- Tests de limpieza tras fallo.
- Sin rutas sensibles en logs o respuestas.

---

## 13. Fase 6 — Calibre, OCR y procesamiento por lotes

### 13.1 CalibreEngine

Implementar `CalibreEngine` usando `ebook-convert`.

Capacidades iniciales controladas:

- EPUB → MOBI.
- EPUB → AZW3.
- EPUB → PDF.
- MOBI/AZW3 → EPUB cuando la herramienta lo soporte de forma fiable.
- HTML o DOCX → EPUB, solo si la matriz real y los tests lo validan.

Requisitos:

- No prometer preservación perfecta.
- Mostrar `layout-risk` o `metadata-risk`.
- Validar el contenedor de salida.
- Añadir límites de tamaño y timeout.
- Añadir pruebas con ebooks pequeños y libres.

### 13.2 TesseractEngine

Tesseract no debe recibir PDF directamente si la build no lo soporta.

Implementar:

- Imagen → TXT.
- Imagen → PDF buscable, solo si es fiable y probado.
- PDF → imágenes mediante Poppler → OCR por página → TXT o PDF buscable.

Requisitos:

- Idiomas iniciales `spa` y `eng`.
- Detección de paquetes de idioma.
- Límite de páginas.
- Límite de resolución.
- Procesamiento secuencial o concurrencia limitada.
- Limpieza de imágenes intermedias.
- Mensajes claros cuando falte un idioma.

### 13.3 Batch Processing

Usar las tablas existentes o migrarlas de forma segura.

UI:

- Selección múltiple.
- Una capability común o reglas por archivo.
- Lista de archivos.
- Progreso individual y global.
- Cancelar uno o todo.
- Reintentar fallidos.
- Descargar resultados individualmente.
- Generar un ZIP de resultados de forma segura.

Backend:

- Límite configurable de archivos.
- Concurrencia limitada.
- Estado agregado.
- Fallo parcial.
- Persistencia y reanudación razonable.
- No cargar todos los archivos en RAM.

### Gate de salida de fase 6

- EPUB → AZW3 o MOBI real desde UI.
- Imagen → TXT real desde UI.
- PDF pequeño → TXT real, si Poppler está incluido.
- Batch de al menos tres categorías.
- Fallo parcial correctamente mostrado.
- ZIP de batch validado.

---

## 14. Fase 7 — Estrategia de pruebas y matriz mínima

### 14.1 Tipos de prueba

Implementar:

- Unitarias de dominio.
- Unitarias de validación.
- Integración de APIs.
- Integración de repositorio SQLite.
- Integración de engines.
- Pruebas reales de CLI.
- E2E Playwright.
- Smoke test del ZIP en Windows.

### 14.2 Fixtures

Crear fixtures pequeñas en:

```text
tests/fixtures/
```

Incluir únicamente archivos propios, generados o con licencia compatible:

- Audio WAV corto.
- Vídeo MP4 corto.
- PNG pequeño.
- Markdown.
- TXT.
- HTML seguro.
- DOCX.
- XLSX.
- PPTX.
- PDF.
- JSON.
- YAML.
- CSV.
- ZIP.
- EPUB.
- Imagen con texto español e inglés.
- PDF de dos páginas para OCR.

Documentar cómo se generaron.

### 14.3 Matriz mínima obligatoria

| ID | Entrada | Salida/operación | Motor | Validación |
|---|---|---|---|---|
| T01 | WAV | MP3 | FFmpeg | magic bytes + ffprobe |
| T02 | MP4 | WebM | FFmpeg | ffprobe |
| T03 | PNG | WebP | Sharp | metadata Sharp |
| T04 | JSON | YAML | Data | parse de salida |
| T05 | Markdown | HTML | Pandoc | parse + contenido |
| T06 | Markdown | DOCX | Pandoc | estructura ZIP DOCX |
| T07 | DOCX | PDF | LibreOffice | cabecera PDF |
| T08 | PDF | linearize | QPDF | `qpdf --check` |
| T09 | ZIP | inspección/extracción | 7-Zip | rutas y contenido |
| T10 | EPUB | AZW3/MOBI | Calibre | herramienta de inspección |
| T11 | PNG texto | TXT | Tesseract | contenido esperado |
| T12 | PDF texto | TXT | Poppler + Tesseract | contenido esperado |
| T13 | 3 archivos | batch | Orquestador | estados agregados |
| T14 | URL mock | MP3 | yt-dlp + FFmpeg | flujo sin red |
| T15 | UI móvil | DOCX/PDF | E2E | sin overflow |
| T16 | ZIP Windows | arranque | Portable | health + conversión |

### 14.4 Validación de artefactos

Nunca valides solo por extensión o tamaño.

Usa:

- Magic bytes.
- Parser específico.
- Herramienta de verificación del motor.
- MIME derivado del contenido.
- Tamaño no cero.
- Ruta dentro del root.
- Nombre y metadatos esperados.

### 14.5 Gates globales

Deben pasar:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm build
pnpm check:deps
```

No usar `--passWithNoTests`.

---

## 15. Fase 8 — ZIP portable completo para Windows

### 15.1 Objetivo

El usuario final debe poder:

1. Descargar un ZIP.
2. Extraerlo en una carpeta local.
3. Hacer doble clic en `INICIAR_ANCLORA_FILESTUDIO.bat`.
4. Usar todas las conversiones incluidas.
5. Cerrar con `CERRAR_ANCLORA_FILESTUDIO.bat`.
6. No instalar Node.js, Python, WSL, Docker ni herramientas externas.

### 15.2 Herramientas que debe incluir

El paquete completo debe incorporar versiones Windows x64 compatibles y redistribuibles de:

- Node.js LTS portable.
- yt-dlp.
- FFmpeg.
- FFprobe.
- QPDF.
- 7-Zip.
- Pandoc.
- LibreOffice portable/headless.
- Calibre portable o runtime permitido.
- Tesseract.
- Datos de idioma `spa` y `eng`.
- Poppler, si se usa para OCR de PDF.
- Dependencias nativas de Node para Windows, incluido `better_sqlite3.node`.
- Sharp/libvips para Windows, si el standalone no lo incorpora correctamente.

No descargues binarios desde mirrors desconocidos.

### 15.3 Versionado y supply chain

El build debe:

- Fijar versiones.
- Usar fuentes oficiales.
- Verificar SHA-256 cuando el proveedor lo publique.
- Calcular SHA-256 de todos los componentes.
- Registrar URL de origen.
- Registrar licencia.
- Registrar fecha de descarga.
- Fallar si una descarga no coincide.
- No depender de `latest` sin registrar la versión resuelta.

Crear:

```text
scripts/tool-versions.json
scripts/tool-checksums.json
```

Y dentro del ZIP:

```text
manifest.json
VERSION.txt
THIRD_PARTY_NOTICES.txt
licenses/
```

### 15.4 Estructura objetivo

```text
Anclora FileStudio-Windows-x64/
├── INICIAR_ANCLORA_FILESTUDIO.bat
├── CERRAR_ANCLORA_FILESTUDIO.bat
├── ACTUALIZAR_YTDLP.bat
├── DIAGNOSTICO_ANCLORA_FILESTUDIO.bat
├── LEEME.txt
├── VERSION.txt
├── THIRD_PARTY_NOTICES.txt
├── manifest.json
├── licenses/
├── runtime/
│   └── node.exe
├── app/
│   ├── server.js
│   ├── package.json
│   ├── .next/
│   ├── node_modules/
│   └── public/
├── tools/
│   ├── yt-dlp/
│   ├── ffmpeg/
│   ├── qpdf/
│   ├── sevenzip/
│   ├── pandoc/
│   ├── libreoffice/
│   ├── calibre/
│   ├── tesseract/
│   ├── tessdata/
│   └── poppler/
├── data/
├── temp/
├── logs/
└── internal/
    ├── start-anclora-filestudio.ps1
    ├── stop-anclora-filestudio.ps1
    ├── diagnose-anclora-filestudio.ps1
    ├── update-ytdlp.ps1
    └── portable-smoke-test.ps1
```

### 15.5 Configuración portable

El launcher debe resolver todo desde `%~dp0` o `$BaseDir`.

Debe establecer variables relativas para todos los binarios, por ejemplo:

```text
ANCLORA_FILESTUDIO_FFMPEG_PATH
ANCLORA_FILESTUDIO_FFPROBE_PATH
ANCLORA_FILESTUDIO_YTDLP_PATH
ANCLORA_FILESTUDIO_QPDF_PATH
ANCLORA_FILESTUDIO_7ZIP_PATH
ANCLORA_FILESTUDIO_PANDOC_PATH
ANCLORA_FILESTUDIO_LIBREOFFICE_PATH
ANCLORA_FILESTUDIO_CALIBRE_PATH
ANCLORA_FILESTUDIO_TESSERACT_PATH
ANCLORA_FILESTUDIO_TESSDATA_PREFIX
ANCLORA_FILESTUDIO_POPPLER_PATH
ANCLORA_FILESTUDIO_DATA_DIR
ANCLORA_FILESTUDIO_TEMP_DIR
```

La aplicación debe preferir estas rutas y después usar PATH como fallback en desarrollo.

### 15.6 Corrección del pipeline actual

Actualizar `run_build_pipeline.sh` para:

- Obtener la raíz con `git rev-parse --show-toplevel`.
- No usar `/home/toni/projects/convertidor_youtube_mp3`.
- No hacer `git checkout -B` que pueda resetear una rama.
- No crear commits automáticos con mensajes fijos mezclando cambios.
- No usar `--passWithNoTests`.
- Ejecutar todos los gates.
- Generar un log dentro de `scripts/build-reports/`.
- Salir con código distinto de cero ante cualquier fallo.
- Mostrar ruta, tamaño y hash únicamente tras verificación completa.

### 15.7 Verificación del ZIP

Actualizar `verify-windows-portable.sh` para comprobar:

- Existencia de todos los componentes.
- Hash del ZIP.
- Hashes internos.
- Ausencia de secretos.
- Ausencia de `.git`.
- Ausencia de binarios Linux.
- Native modules Windows PE.
- Sin rutas del desarrollador.
- Longitudes de ruta razonables.
- Lanzadores con rutas relativas.
- Versiones ejecutables.
- Health-check completo.
- Arranque y cierre.
- Conversión real de una fixture por cada familia de motor.
- Limpieza posterior.
- Inicio desde una ruta con espacios.
- Inicio desde una ruta con caracteres no ASCII, cuando el entorno lo permita.

No marques el smoke test de Windows como aprobado si fue omitido. En ese caso, el gate queda pendiente.

### 15.8 Smoke test Windows

Si `powershell.exe` y `cmd.exe` están disponibles desde WSL:

1. Copiar el ZIP a `%TEMP%`.
2. Extraerlo.
3. Ejecutar `portable-smoke-test.ps1`.
4. Arrancar en un puerto libre.
5. Esperar `/api/health`.
6. Verificar todos los engines.
7. Ejecutar conversiones locales pequeñas.
8. Verificar descargas.
9. Cerrar.
10. Comprobar que no queda proceso.
11. Borrar el entorno de prueba.

### 15.9 Artefactos finales

Generar:

```text
scripts/Anclora FileStudio-Windows-x64.zip
scripts/Anclora FileStudio-Windows-x64.zip.sha256
scripts/build-reports/<timestamp>-portable-build.md
scripts/build-reports/<timestamp>-portable-build.log
```

Si se detecta una carpeta Downloads de Windows de forma segura, copiar además:

```text
<Downloads>/Anclora FileStudio-Windows-x64.zip
<Downloads>/Anclora FileStudio-Windows-x64.zip.sha256
```

No hardcodear el nombre del usuario de Windows.

### Gate de salida de fase 8

- ZIP generado.
- SHA-256 correcto.
- Verificador completo verde.
- Smoke test Windows verde.
- Todos los motores incluidos responden.
- Al menos una conversión real de cada familia funciona desde el paquete extraído.
- El ZIP no depende del repo, WSL ni herramientas instaladas globalmente.

---

## 16. Fase 9 — Documentación, cierre Git y reporte

### 16.1 Documentación

Actualizar:

- `README.md`
- `AGENTS.md`
- `docs/audits/`
- Guía de usuario.
- Matriz de formatos.
- Diagnóstico.
- Solución de problemas.
- Licencias de terceros.
- Proceso de reconstrucción del ZIP.
- Límites conocidos.
- Estrategia futura para móvil.

No afirmar que el producto es una app móvil. Indicar:

```text
Arquitectura y UX mobile-first; distribución actual para Windows portátil/escritorio.
```

### 16.2 Preparación para móvil

Documentar la separación futura:

- Dominio y catálogo portables.
- UI web reusable.
- Adaptadores de filesystem.
- Adaptadores de procesos desktop-only.
- Motores reemplazables en móvil.
- Capabilities según plataforma.
- No exponer CLI desktop en capas de dominio.

Usar el campo `mobilePortability`:

- `portable-domain`
- `replace-adapter-on-mobile`
- `desktop-only`

### 16.3 Commits sugeridos

Ejemplo:

```text
docs: add Anclora FileStudio universal E2E implementation spec
refactor: centralize format catalog and analysis contracts
feat: connect universal engines to jobs and UI
feat: migrate media conversion to FFmpeg engine
feat: add unified diagnostics previews and localized errors
fix: coordinate job and artifact cleanup
feat: add calibre tesseract and batch conversion
test: add universal conversion integration and E2E matrix
build: package complete Windows portable distribution
docs: update user guide licenses and validation report
```

No fuerces commits si no hay cambios coherentes para ese bloque.

### 16.4 Reporte final obligatorio

El mensaje final del agente debe incluir exactamente estas secciones:

```markdown
## Resultado

## Rama y commits

## Cambios implementados

## Validaciones ejecutadas

## Conversiones reales verificadas

## ZIP portable

- Ruta:
- Copia en Downloads:
- Tamaño:
- SHA-256:
- Versión:
- Herramientas incluidas:

## Incidencias o limitaciones pendientes

## Estado del árbol Git
```

Incluye resultados reales, no estimaciones.

---

## 17. Criterios finales de aceptación

La tarea solo se considera completada si se cumplen todos:

- [ ] Los documentos pueden seleccionarse desde el explorador.
- [ ] `universal-file` se maneja sin casts incorrectos.
- [ ] Las capabilities universales se muestran.
- [ ] Se puede crear un job universal desde la UI.
- [ ] Pandoc convierte y descarga.
- [ ] LibreOffice convierte y descarga.
- [ ] Sharp convierte y descarga.
- [ ] Data engine convierte y descarga.
- [ ] QPDF ejecuta y valida.
- [ ] 7-Zip ejecuta de forma segura.
- [ ] FFmpeg usa el registro común.
- [ ] YouTube autorizado no sufre regresiones.
- [ ] Calibre funciona desde la UI.
- [ ] OCR de imagen funciona desde la UI.
- [ ] OCR de PDF funciona si Poppler está incluido.
- [ ] Batch funciona con fallo parcial.
- [ ] Diagnóstico cubre todos los motores.
- [ ] Errores son granulares y localizados.
- [ ] Limpieza DB/filesystem está coordinada.
- [ ] No hay warnings de lint o TypeScript.
- [ ] Tests unitarios pasan.
- [ ] Tests de integración pasan.
- [ ] Playwright pasa en viewports definidos.
- [ ] Build standalone pasa.
- [ ] ZIP contiene todas las herramientas.
- [ ] ZIP no contiene secretos ni binarios Linux.
- [ ] Smoke test Windows pasa.
- [ ] El ZIP se inicia con doble clic.
- [ ] La app escucha solo en `127.0.0.1`.
- [ ] El usuario puede descargar el artefacto convertido.
- [ ] Se genera SHA-256.
- [ ] Documentación coincide con el comportamiento.
- [ ] El árbol Git termina limpio.

Si uno de los criterios P0, seguridad, descarga o ZIP falla, el estado final es `INCOMPLETO`.

---

## 18. Instrucción de ejecución autónoma

Ejecuta todas las fases de forma secuencial. No pidas confirmación entre fases para cambios normales,
reversibles y dentro del repo.

Detente únicamente ante:

- Riesgo de pérdida de datos.
- Necesidad de credenciales.
- Licencia que impida redistribuir un componente.
- Ausencia real de acceso a Windows para el smoke test final.
- Bloqueo externo que impida completar una conversión obligatoria.

En un bloqueo:

1. No ocultes el fallo.
2. Completa todo lo que no dependa de él.
3. Deja scripts y documentación preparados.
4. Marca el gate como pendiente.
5. Explica la acción manual exacta.
6. No declares la tarea completada.

Comienza ahora por la auditoría de fase 0 y continúa hasta generar y verificar el ZIP final.
