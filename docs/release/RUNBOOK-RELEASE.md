# Runbook de Release — Anclora FileStudio

> **Audiencia**: mantenedores con acceso al repositorio y al destino de publicación.
> **Alcance**: portables `windows-x64` y `linux-x64`. El despliegue Vercel (web) sigue su propio pipeline CI.

---

## Pre-requisitos

| Herramienta | Versión mínima | Notas |
|---|---|---|
| Node.js | ≥ 20 | `node --version` |
| pnpm | ≥ 10 | `pnpm --version` |
| bash | ≥ 4 | macOS: `brew install bash` |
| python3 | ≥ 3.9 | Para manipulación de JSON en scripts |
| sha256sum / shasum | cualquiera | sha256sum en Linux, shasum en macOS |
| curl | cualquiera | Para validación remota de artefactos |
| yt-dlp | reciente | Solo para smoke E2E externo |
| ffprobe | cualquiera | Solo para smoke E2E en modo descarga |
| jq | cualquiera (opcional) | Los scripts usan python3 como fallback |

Verificar entorno antes de empezar:

```bash
node --version
pnpm --version
python3 --version
sha256sum --version 2>/dev/null || shasum --version
curl --version | head -1
```

---

## Paso 1 — Construir artefactos

### 1a. Build del bundle Next.js (modo desktop/standalone)

```bash
cd /home/toni/projects/anclora-fileStudio

# Build desktop (genera .next/standalone)
pnpm build:desktop
```

> Si `build:desktop` no existe como script, usar el build estándar con la variable de entorno:
> ```bash
> ANCLORA_FILESTUDIO_DEPLOYMENT_TARGET=desktop pnpm build
> ```

Verificar que `.next/standalone/server.js` existe antes de continuar:

```bash
ls -la .next/standalone/server.js
```

### 1b. Construir portables

```bash
# Ambas plataformas
bash scripts/build-portables.sh --all

# Solo Linux
bash scripts/build-portables.sh --linux

# Solo Windows (requiere ejecutarse en Linux con las herramientas de packaging)
bash scripts/build-portables.sh --windows
```

Artefactos resultantes:

| Plataforma | Ruta esperada |
|---|---|
| Linux x64 | `dist/linux/Anclora-FileStudio-Linux-x64.tar.zst` |
| Windows x64 | `dist/windows/Anclora-FileStudio-Windows-x64-Core.zip` |

---

## Paso 2 — Verificar artefactos localmente

```bash
# Verificar portable Linux
bash scripts/verify-linux-portable.sh

# Verificar portable Windows (desde Linux con herramientas compatibles)
bash scripts/verify-windows-portable-v2.sh

# Verificar bundle Vercel (no empaqueta herramientas nativas)
node scripts/verify-vercel-bundle.mjs
```

Opcionalmente, ejecutar smoke tests de portables:

```bash
bash scripts/smoke-linux-portable.sh
bash scripts/smoke-windows-portable.sh
```

---

## Paso 3 — Publicar en destino aprobado

> **ATENCIÓN**: Este paso requiere autorización explícita del responsable de release.
> No publicar en GitHub Releases, Vercel Blob, ni ningún CDN sin aprobación previa.

Los artefactos aprobados se publican en el destino acordado por el equipo.
Ejemplos de destinos posibles (a determinar por cada release):

- GitHub Releases en el repositorio oficial
- Servidor VPS configurado en `deploy/vps/`
- Bucket de almacenamiento privado con acceso controlado

Tras la publicación, anotar las URLs de descarga para el Paso 4.

---

## Paso 4 — Actualizar release-manifest.json

Ejecutar `update-release-manifest.sh` para cada artefacto publicado:

```bash
# Linux x64
bash scripts/update-release-manifest.sh \
  --platform linux-x64 \
  --file dist/linux/Anclora-FileStudio-Linux-x64.tar.zst \
  --download-url "https://<destino-aprobado>/Anclora-FileStudio-Linux-x64.tar.zst"

# Windows x64
bash scripts/update-release-manifest.sh \
  --platform windows-x64 \
  --file dist/windows/Anclora-FileStudio-Windows-x64-Core.zip \
  --download-url "https://<destino-aprobado>/Anclora-FileStudio-Windows-x64-Core.zip"
```

El script automáticamente:
- Calcula SHA-256 y tamaño en bytes
- Rellena `version` desde `package.json` (si estaba PENDING)
- Rellena `commit` con `git rev-parse --short HEAD` (si estaba PENDING)
- Rellena `buildDate` con timestamp UTC (si estaba PENDING)
- Actualiza `status` de `pending` a `draft`

Revisar el manifest resultante:

```bash
cat release-manifest.json
```

Marcar como publicado cuando todo esté validado (Paso 6):

```bash
python3 -c "
import json
with open('release-manifest.json') as f:
    m = json.load(f)
m['status'] = 'published'
for p in m['platforms'].values():
    p['published'] = True
with open('release-manifest.json', 'w') as f:
    json.dump(m, f, indent=2)
    f.write('\n')
print('Manifest status set to published')
"
```

---

## Paso 5 — Desplegar preview de Vercel

El despliegue preview se activa automáticamente desde la rama de release a través de CI.
Si se necesita forzar manualmente:

```bash
# Requiere Vercel CLI instalado y autenticado
vercel --cwd . --env ANCLORA_FILESTUDIO_DEPLOYMENT_TARGET=vercel
```

Variables de entorno requeridas para el build de Vercel (ya configuradas en `vercel.json`):

```
ANCLORA_FILESTUDIO_DEPLOYMENT_TARGET=vercel
NEXT_PUBLIC_ANCLORA_FILESTUDIO_MODE=vercel-web
NEXT_PUBLIC_ENABLE_BROWSER_DATA_CONVERSIONS=true
ANCLORA_FILESTUDIO_ENABLE_SERVER_CONVERSIONS=false
ANCLORA_FILESTUDIO_ENABLE_CLOUD_UPLOADS=false
```

---

## Paso 6 — Validar desde preview

### 6a. Validar artefactos remotos con el script de validación

```bash
# Validar contra URLs de producción
bash scripts/validate-release-manifest.sh

# Validar contra preview (sustituir dominio)
ANCLORA_RELEASE_BASE_URL="https://preview-url.vercel.app" \
  bash scripts/validate-release-manifest.sh
```

El script descarga cada artefacto con `downloadUrl` no-null, compara SHA-256 y bytes. Reporta PASS/FAIL por plataforma.

### 6b. Smoke E2E externo (opt-in, solo con URL autorizada)

```bash
ANCLORA_FILESTUDIO_RUN_EXTERNAL_E2E=1 \
ANCLORA_FILESTUDIO_EXTERNAL_VIDEO_URL="<URL_VIDEO_AUTORIZADO>" \
ANCLORA_FILESTUDIO_EXTERNAL_EXPECTED_MIN_HEIGHT=2160 \
bash scripts/external-e2e-smoke.sh

# Con descarga y validación ffprobe
ANCLORA_FILESTUDIO_RUN_EXTERNAL_E2E=1 \
ANCLORA_FILESTUDIO_EXTERNAL_VIDEO_URL="<URL_VIDEO_AUTORIZADO>" \
ANCLORA_FILESTUDIO_EXTERNAL_EXPECTED_MIN_HEIGHT=2160 \
ANCLORA_FILESTUDIO_EXTERNAL_DOWNLOAD=1 \
bash scripts/external-e2e-smoke.sh
```

> **IMPORTANTE**: Este smoke test nunca debe ejecutarse en CI normal. Es opt-in exclusivo para
> validación manual antes de promoción a producción.

---

## Paso 7 — Promover a producción (REQUIERE AUTORIZACIÓN EXPLÍCITA)

> Este paso no puede automatizarse sin aprobación del responsable de release.

Una vez que todos los checks del Paso 6 pasan:

1. Obtener aprobación explícita del responsable de release
2. Promover el deployment de Vercel a producción:
   ```bash
   vercel promote <deployment-url> --scope <team>
   ```
3. Actualizar `release-manifest.json` con `status: "published"` y `published: true` en cada plataforma (ver Paso 4)
4. Crear el tag de git:
   ```bash
   git tag -a "v$(jq -r .version release-manifest.json)" -m "Release v$(jq -r .version release-manifest.json)"
   # NO hacer push sin aprobación
   ```
5. Hacer push del tag (con autorización):
   ```bash
   git push origin "v$(jq -r .version release-manifest.json)"
   ```

---

## Rollback

Si se detecta un problema crítico post-producción:

### Rollback Vercel

```bash
# Listar deployments recientes
vercel ls --scope <team>

# Promover el deployment anterior
vercel promote <previous-deployment-url> --scope <team>
```

### Rollback de artefactos portables

1. Revertir `release-manifest.json` al estado del release anterior:
   ```bash
   git show HEAD~1:release-manifest.json > release-manifest.json
   ```
2. Si los artefactos del release anterior siguen disponibles en el destino de distribución,
   comunicar la URL anterior a los usuarios afectados.
3. Si es necesario eliminar el artefacto defectuoso del destino de distribución,
   hacerlo manualmente según el proveedor elegido.

### Revertir manifest a borrador

```bash
python3 -c "
import json
with open('release-manifest.json') as f:
    m = json.load(f)
m['status'] = 'rollback'
with open('release-manifest.json', 'w') as f:
    json.dump(m, f, indent=2)
    f.write('\n')
print('Manifest status set to rollback')
"
```

---

## Scripts de referencia

| Script | Propósito |
|---|---|
| `scripts/build-portables.sh` | Orquestador de builds portables (Linux + Windows) |
| `scripts/build-linux-portable.sh` | Build del portable Linux x64 tar.zst |
| `scripts/build-windows-portable.sh` | Build del portable Windows x64 ZIP |
| `scripts/update-release-manifest.sh` | Calcular SHA-256/bytes y actualizar release-manifest.json |
| `scripts/validate-release-manifest.sh` | Descargar artefactos remotos y verificar SHA-256/bytes |
| `scripts/external-e2e-smoke.sh` | Smoke E2E externo opt-in (yt-dlp + ffprobe) |
| `scripts/verify-vercel-bundle.mjs` | Verificar que el bundle Next.js no incluye binarios nativos |
| `scripts/verify-linux-portable.sh` | Verificar estructura del portable Linux |
| `scripts/verify-windows-portable-v2.sh` | Verificar estructura del portable Windows |
| `scripts/smoke-linux-portable.sh` | Smoke test del portable Linux |
| `scripts/smoke-windows-portable.sh` | Smoke test del portable Windows |

---

## Variables de entorno relevantes

| Variable | Propósito | Scope |
|---|---|---|
| `ANCLORA_RELEASE_BASE_URL` | Sustituye dominio en URLs de `release-manifest.json` para validación | `validate-release-manifest.sh` |
| `ANCLORA_FILESTUDIO_RUN_EXTERNAL_E2E` | Habilita smoke E2E externo (debe ser `"1"`) | `external-e2e-smoke.sh` |
| `ANCLORA_FILESTUDIO_EXTERNAL_VIDEO_URL` | URL autorizada del video para smoke E2E | `external-e2e-smoke.sh` |
| `ANCLORA_FILESTUDIO_EXTERNAL_EXPECTED_MIN_HEIGHT` | Altura mínima esperada en píxeles (default: 2160) | `external-e2e-smoke.sh` |
| `ANCLORA_FILESTUDIO_EXTERNAL_DOWNLOAD` | Si `"1"`, descarga y valida con ffprobe | `external-e2e-smoke.sh` |
| `ANCLORA_FILESTUDIO_DEPLOYMENT_TARGET` | Target de despliegue (`vercel` o `desktop`) | Build |
