# Decisiones de arquitectura — Anclora FileStudio

## ADR-01: Motor como interfaz canónica

**Decisión:** Todos los motores implementan la interfaz `ConversionEngine` de `src/lib/domain/engines.ts`.

**Motivo:** Permite añadir nuevos motores sin modificar el orquestador.
Cada motor es testeable de forma independiente.

**Consecuencias:** El registro `registry.ts` es el único punto de entrada.
Ningún componente de UI importa motores directamente.

---

## ADR-02: SQLite con WAL y migraciones idempotentes

**Decisión:** `better-sqlite3` en modo WAL con `INSERT OR IGNORE` en cada migración.

**Motivo:** Next.js lanza hasta 7 workers en build. Sin idempotencia las migraciones
paralelas corrompen el schema.

**Consecuencias:** El archivo `data/anclora-filestudio.db` NO debe eliminarse entre actualizaciones.
Las migraciones son aditivas; nunca destructivas sin versión de esquema explícita.

---

## ADR-03: Tokens de descarga rotativos

**Decisión:** El procesador genera un token bruto; la DB almacena solo el SHA-256.
El cliente llama a `GET /api/jobs/:id/token` para obtener un token de un solo uso (15 min).

**Motivo:** Evita que un token interceptado sirva indefinidamente.

**Consecuencias:** Sin caché de tokens en el cliente. Cada descarga requiere una petición previa.

---

## ADR-04: Path safety con resolve+relative

**Decisión:** `ensurePathSafety()` usa `path.resolve()` + `path.relative()` + comprobación
de que el resultado no empiece por `..` ni sea una ruta absoluta.

**Motivo:** `startsWith()` es inseguro con Unicode y rutas normalizadas.

**Consecuencias:** Toda escritura en disco pasa por `ensurePathSafety()`.

---

## ADR-05: shell: false en todos los spawns

**Decisión:** Todos los `spawn()` usan `shell: false` y `windowsHide: true`.

**Motivo:** Previene inyección de comandos a través de nombres de archivo
o parámetros manipulados.

**Consecuencias:** Los argumentos deben pasarse como array, nunca concatenados como string.

---

## ADR-06: Variables de entorno con prefijo ANCLORA_FILESTUDIO_

**Decisión:** Todas las variables de entorno del proyecto usan el prefijo `ANCLORA_FILESTUDIO_`.

**Motivo:** Evita colisiones con otras aplicaciones Node.js y facilita el filtrado
en entornos con múltiples procesos.

**Consecuencias:** La distribución portable configura estas variables en el script de inicio.
El `.env.example` documenta todas las variables disponibles.

---

## ADR-07: Modo local-first, sin APIs externas

**Decisión:** Ninguna funcionalidad de conversión, procesamiento o análisis
envía datos a servicios externos.

**Motivo:** Privacidad del usuario y funcionamiento offline.

**Consecuencias:** Todos los binarios deben ser locales. El modo IA de background removal
usa inferencia local (ONNX Runtime) sin llamadas a red.
La única excepción es la descarga de YouTube a través de yt-dlp, que por definición
requiere conexión.

---

## ADR-08: Fase 5 excluida permanentemente

**Decisión:** No se implementa eliminación de marcas de agua en ninguna forma.

**Motivo:** Consideraciones legales y éticas. La funcionalidad podría usarse
para eludir protecciones de derechos de autor.

**Consecuencias:** Ningún componente, mensaje de UI, documentación o roadmap
hace referencia a esta funcionalidad.
