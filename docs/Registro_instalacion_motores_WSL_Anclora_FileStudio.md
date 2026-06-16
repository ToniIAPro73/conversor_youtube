# Registro de instalación de motores en WSL para Anclora FileStudio

> Entorno: Ubuntu sobre WSL  
> Equipo: `ES-L302590`  
> Usuario WSL: `toni`  
> Fecha del proceso: 15 de junio de 2026  
> Objetivo: preparar los motores locales de conversión documental, ebooks y OCR para Anclora FileStudio.

---

## 1. Resumen del estado

| Componente | Uso en Anclora FileStudio | Método | Estado |
| --- | --- | --- | --- |
| Pandoc | Conversión entre Markdown, HTML, DOCX, ODT, RST, LaTeX y TXT | `apt` | Instalación indicada |
| LibreOffice | Conversión Office/ODF y generación de PDF en modo headless | `apt` | Instalación indicada |
| Fuentes DejaVu | Sustitución y renderizado de fuentes | `apt` | Instalación indicada |
| Fuentes Liberation | Compatibilidad con fuentes habituales de Microsoft Office | `apt` | Instalación indicada |
| Calibre 9.9.0 | Conversión de ebooks mediante `ebook-convert` | Binario oficial manual | Instalado y validado |
| `libopengl0` | Dependencia gráfica requerida por Calibre | `apt` | Instalado |
| `libegl1` | Dependencia EGL requerida por Calibre | `apt` | Instalado |
| `libxcb-cursor0` | Dependencia Qt/XCB requerida por Calibre | `apt` | Instalado |
| `libxcb-xinerama0` | Dependencia Qt/XCB complementaria | `apt` | Instalado |
| Tesseract OCR | OCR de imágenes y páginas rasterizadas de PDF | `apt` | Recomendado, no confirmado |
| Idioma OCR español | OCR en español, código `spa` | `apt` | Recomendado, no confirmado |
| Idioma OCR inglés | OCR en inglés, código `eng` | `apt` | Recomendado, no confirmado |
| Tesseract OSD | Detección de orientación y escritura | `apt` | Recomendado, no confirmado |
| Poppler Utils | Conversión de páginas PDF a imagen para OCR | `apt` | Recomendado, no confirmado |

> Nota: Calibre quedó confirmado como operativo. En la conversación no se aportó una salida de terminal
> que confirme la instalación efectiva de Tesseract y Poppler. Por tanto, no se documentan como
> instalados hasta ejecutar las verificaciones incluidas al final.

---

## 2. Instalación de Pandoc y LibreOffice headless

### 2.1 Paquetes instalados o indicados

```bash
sudo apt update

sudo apt install -y \
  pandoc \
  libreoffice \
  fonts-dejavu-core \
  fonts-liberation
```

LibreOffice no necesita un paquete separado llamado `headless`. El modo sin interfaz gráfica se activa
mediante el argumento:

```text
--headless
```

### 2.2 Verificación

```bash
pandoc --version | head -n 3
libreoffice --version

command -v pandoc
command -v libreoffice
command -v soffice
```

Las rutas habituales son:

```text
/usr/bin/pandoc
/usr/bin/libreoffice
/usr/bin/soffice
```

### 2.3 Prueba de Pandoc

```bash
mkdir -p /tmp/anclora-filestudio-pandoc-test

cat > /tmp/anclora-filestudio-pandoc-test/prueba.md <<'DOC'
# Documento de prueba

Conversión realizada con Pandoc desde WSL.

- Elemento uno
- Elemento dos
DOC

pandoc \
  /tmp/anclora-filestudio-pandoc-test/prueba.md \
  --from markdown \
  --to docx \
  --output /tmp/anclora-filestudio-pandoc-test/prueba.docx
```

Validación:

```bash
file /tmp/anclora-filestudio-pandoc-test/prueba.docx
ls -lh /tmp/anclora-filestudio-pandoc-test/prueba.docx
```

### 2.4 Prueba de LibreOffice headless

Se recomienda utilizar un perfil temporal y aislado por conversión para evitar bloqueos entre procesos:

```bash
PROFILE_DIR="$(mktemp -d)"

libreoffice \
  --headless \
  --nologo \
  --nodefault \
  --nofirststartwizard \
  --norestore \
  "-env:UserInstallation=file://$PROFILE_DIR" \
  --convert-to pdf \
  --outdir /tmp/anclora-filestudio-pandoc-test \
  /tmp/anclora-filestudio-pandoc-test/prueba.docx

rm -rf "$PROFILE_DIR"
```

Validación:

```bash
file /tmp/anclora-filestudio-pandoc-test/prueba.pdf
ls -lh /tmp/anclora-filestudio-pandoc-test/prueba.pdf
```

---

## 3. Preparación de Calibre

### 3.1 Dependencias base indicadas

```bash
sudo apt update

sudo apt install -y \
  wget \
  xz-utils \
  xdg-utils \
  python3 \
  ca-certificates
```

### 3.2 Primer bloqueo: `libOpenGL.so.0`

El instalador oficial mostró:

```text
You are missing the system library libOpenGL.so.0
```

Se corrigió instalando:

```bash
sudo apt update

sudo apt install -y \
  libopengl0 \
  libegl1
```

Verificación opcional:

```bash
ldconfig -p | grep -E 'libOpenGL\.so\.0|libEGL\.so\.1'
```

### 3.3 Segundo bloqueo: `libxcb-cursor.so.0`

El instalador mostró:

```text
You are missing the system library libxcb-cursor.so.0
```

Se corrigió con:

```bash
sudo apt update

sudo apt install -y \
  libxcb-cursor0 \
  libxcb-xinerama0
```

Verificación opcional:

```bash
ldconfig -p | grep -E \
  'libxcb-cursor\.so\.0|libxcb-xinerama\.so\.0|libOpenGL\.so\.0|libEGL\.so\.1'
```

### 3.4 Bloqueo del instalador automático

Se intentó el instalador oficial:

```bash
sudo -v && \
wget -nv -O- https://download.calibre-ebook.com/linux-installer.sh \
  | sudo sh /dev/stdin
```

La descarga inicial del script funcionó, pero la descarga interna del tarball falló con:

```text
ssl.SSLCertVerificationError:
certificate verify failed: unable to get local issuer certificate
```

También se comprobó que:

```bash
python3 - <<'PY'
import urllib.request

url = "https://download.calibre-ebook.com/"
with urllib.request.urlopen(url, timeout=20) as response:
    print("HTTPS correcto:", response.status)
PY
```

devolvía:

```text
HTTPS correcto: 200
```

Sin embargo, el endpoint de metadatos usado durante la instalación respondió con `403 Forbidden`.

Por este motivo se optó por la instalación binaria manual oficial.

---

## 4. Instalación manual de Calibre 9.9.0

### 4.1 Archivo descargado

El tarball oficial se descargó en Windows:

```text
C:\Users\antonio.ballesterosa\Downloads\calibre-9.9.0-x86_64.txz
```

Ruta equivalente desde WSL:

```text
/mnt/c/Users/antonio.ballesterosa/Downloads/calibre-9.9.0-x86_64.txz
```

El archivo fue verificado como existente:

```text
-rwxrwxrwx 1 toni toni 184M Jun 15 08:33
/mnt/c/Users/antonio.ballesterosa/Downloads/calibre-9.9.0-x86_64.txz
```

### 4.2 Variable utilizada

```bash
CALIBRE_TARBALL="/mnt/c/Users/antonio.ballesterosa/Downloads/calibre-9.9.0-x86_64.txz"
```

### 4.3 Copia preventiva de una instalación anterior

Antes de instalar se protegió cualquier contenido previo de `/opt/calibre`:

```bash
if [ -d /opt/calibre ] && \
   [ -n "$(sudo find /opt/calibre -mindepth 1 -maxdepth 1 -print -quit)" ]; then
  sudo mv \
    /opt/calibre \
    "/opt/calibre.backup-$(date +%Y%m%d-%H%M%S)"
fi
```

### 4.4 Extracción e instalación

```bash
sudo mkdir -p /opt/calibre

sudo tar \
  -xJf "$CALIBRE_TARBALL" \
  -C /opt/calibre

sudo /opt/calibre/calibre_postinstall
```

### 4.5 Resultado

El proceso creó correctamente los enlaces simbólicos en `/usr/bin`, incluyendo:

```text
/usr/bin/ebook-convert
/usr/bin/ebook-meta
/usr/bin/ebook-polish
/usr/bin/calibre
/usr/bin/calibredb
/usr/bin/calibre-server
/usr/bin/ebook-viewer
```

El ejecutable requerido por Anclora FileStudio quedó enlazado así:

```text
/usr/bin/ebook-convert -> /opt/calibre/ebook-convert
```

### 4.6 Warning no bloqueante

Durante `calibre_postinstall` se mostró:

```text
xdg-desktop-menu: No writable system menu directory found.
```

Y posteriormente:

```text
Setting up desktop integration failed
```

Este warning afecta únicamente a la integración gráfica de Calibre con un escritorio Linux.

No afecta a:

- `ebook-convert`.
- Conversión headless.
- Uso desde Anclora FileStudio.
- Ejecución mediante API o procesos Node.js.

El instalador terminó creando también:

```text
/usr/bin/calibre-uninstall
```

### 4.7 Verificación de Calibre

```bash
command -v ebook-convert
ebook-convert --version
/opt/calibre/ebook-convert --version
```

Ruta esperada:

```text
/usr/bin/ebook-convert
```

Versión esperada:

```text
ebook-convert (calibre 9.9.0)
```

### 4.8 Prueba real de conversión

```bash
mkdir -p /tmp/anclora-filestudio-calibre-test

cat > /tmp/anclora-filestudio-calibre-test/prueba.html <<'DOC'
<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <title>Prueba Anclora FileStudio</title>
</head>
<body>
  <h1>Calibre operativo</h1>
  <p>Conversión HTML a EPUB ejecutada desde WSL.</p>
</body>
</html>
DOC

ebook-convert \
  /tmp/anclora-filestudio-calibre-test/prueba.html \
  /tmp/anclora-filestudio-calibre-test/prueba.epub
```

Validación:

```bash
file /tmp/anclora-filestudio-calibre-test/prueba.epub
unzip -t /tmp/anclora-filestudio-calibre-test/prueba.epub
ls -lh /tmp/anclora-filestudio-calibre-test/prueba.epub
```

El usuario confirmó que la instalación y la prueba funcionaron correctamente.

---

## 5. Tesseract OCR y Poppler

### 5.1 Instalación recomendada

La instalación propuesta fue:

```bash
sudo apt update

sudo apt install -y \
  tesseract-ocr \
  tesseract-ocr-spa \
  tesseract-ocr-eng \
  tesseract-ocr-osd \
  poppler-utils
```

### 5.2 Función de cada paquete

| Paquete | Función |
| --- | --- |
| `tesseract-ocr` | Motor OCR |
| `tesseract-ocr-spa` | Modelo OCR para español |
| `tesseract-ocr-eng` | Modelo OCR para inglés |
| `tesseract-ocr-osd` | Orientación y detección de escritura |
| `poppler-utils` | `pdftoppm`, `pdfinfo` y utilidades para PDF |

### 5.3 Verificación pendiente

```bash
command -v tesseract
command -v pdftoppm
command -v pdfinfo

tesseract --version | head -n 1
tesseract --list-langs
pdftoppm -v 2>&1 | head -n 1
```

Los idiomas esperados son:

```text
eng
osd
spa
```

### 5.4 Prueba OCR sobre imagen

```bash
tesseract \
  "/ruta/a/imagen.png" \
  "/tmp/resultado-ocr" \
  -l spa+eng \
  --oem 1 \
  --psm 3
```

Resultado:

```text
/tmp/resultado-ocr.txt
```

### 5.5 OCR de PDF

Tesseract no debe recibir el PDF directamente. Primero se rasterizan sus páginas:

```bash
mkdir -p /tmp/anclora-filestudio-ocr-pages

pdftoppm \
  -png \
  -r 300 \
  "/ruta/al/documento.pdf" \
  "/tmp/anclora-filestudio-ocr-pages/pagina"
```

Después se aplica OCR página por página:

```bash
for image in /tmp/anclora-filestudio-ocr-pages/pagina-*.png; do
  output="${image%.png}"

  tesseract \
    "$image" \
    "$output" \
    -l spa+eng \
    --oem 1 \
    --psm 3
done
```

Unión del texto:

```bash
cat /tmp/anclora-filestudio-ocr-pages/pagina-*.txt \
  > /tmp/anclora-filestudio-ocr-pages/documento-completo.txt
```

---

## 6. Variables recomendadas para Anclora FileStudio

En `.env.local`:

```env
ANCLORA_FILESTUDIO_PANDOC_PATH=/usr/bin/pandoc
ANCLORA_FILESTUDIO_LIBREOFFICE_PATH=/usr/bin/libreoffice
ANCLORA_FILESTUDIO_CALIBRE_PATH=/usr/bin/ebook-convert
ANCLORA_FILESTUDIO_TESSERACT_PATH=/usr/bin/tesseract
ANCLORA_FILESTUDIO_PDFTOPPM_PATH=/usr/bin/pdftoppm
ANCLORA_FILESTUDIO_PDFINFO_PATH=/usr/bin/pdfinfo
```

Antes de guardarlas, conviene obtener las rutas reales:

```bash
printf 'ANCLORA_FILESTUDIO_PANDOC_PATH=%s\n' "$(command -v pandoc)"
printf 'ANCLORA_FILESTUDIO_LIBREOFFICE_PATH=%s\n' "$(command -v libreoffice)"
printf 'ANCLORA_FILESTUDIO_CALIBRE_PATH=%s\n' "$(command -v ebook-convert)"
printf 'ANCLORA_FILESTUDIO_TESSERACT_PATH=%s\n' "$(command -v tesseract)"
printf 'ANCLORA_FILESTUDIO_PDFTOPPM_PATH=%s\n' "$(command -v pdftoppm)"
printf 'ANCLORA_FILESTUDIO_PDFINFO_PATH=%s\n' "$(command -v pdfinfo)"
```

Para comprobar qué variables reconoce actualmente el repositorio:

```bash
cd ~/projects/conversor_youtube

grep -RniE \
  'PANDOC|LIBREOFFICE|CALIBRE|EBOOK_CONVERT|TESSERACT|PDFTOPPM|POPPLER' \
  src .env.example 2>/dev/null
```

---

## 7. Validación consolidada del entorno

```bash
echo "=== Pandoc ==="
command -v pandoc
pandoc --version | head -n 1

echo
echo "=== LibreOffice ==="
command -v libreoffice
libreoffice --version

echo
echo "=== Calibre ==="
command -v ebook-convert
ebook-convert --version

echo
echo "=== Tesseract ==="
command -v tesseract || true
tesseract --version 2>/dev/null | head -n 1 || true
tesseract --list-langs 2>/dev/null || true

echo
echo "=== Poppler ==="
command -v pdftoppm || true
command -v pdfinfo || true
pdftoppm -v 2>&1 | head -n 1 || true
```

---

## 8. Estado final documentado

### Confirmado

- Calibre 9.9.0 instalado manualmente en `/opt/calibre`.
- `ebook-convert` enlazado en `/usr/bin/ebook-convert`.
- Dependencias de Calibre instaladas:
  - `libopengl0`.
  - `libegl1`.
  - `libxcb-cursor0`.
  - `libxcb-xinerama0`.
- Conversión de prueba de Calibre completada correctamente.
- Warning de integración gráfica identificado como no bloqueante.

### Instalación indicada previamente

- Pandoc.
- LibreOffice.
- Fuentes DejaVu.
- Fuentes Liberation.

### Pendiente de confirmar mediante terminal

- Tesseract OCR.
- Modelos `spa`, `eng` y `osd`.
- Poppler Utils.
- Rutas definitivas de estas herramientas.
- Prueba OCR de imagen y PDF.

---

## 9. Consideraciones para el ZIP portable de Windows

La instalación realizada en WSL sirve para desarrollo y validación local, pero estos binarios Linux no
se deben copiar al ZIP portable de Windows.

El empaquetado final de Anclora FileStudio para Windows deberá incluir versiones Windows x64 independientes de:

- Pandoc.
- LibreOffice.
- Calibre o `ebook-convert`.
- Tesseract.
- Datos de idioma `spa` y `eng`.
- Poppler.

El ZIP debe verificar que no contiene binarios Linux y resolver todas las rutas de herramientas de forma
relativa a la carpeta portable.
