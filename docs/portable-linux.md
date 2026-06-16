# Distribución portable Linux — Anclora FileStudio

## Artefacto

| Artefacto | Descripción |
|---|---|
| `Anclora-FileStudio-Linux-x64.tar.zst` | Paquete portable comprimido con Zstandard |
| `Anclora-FileStudio-Linux-x64.tar.zst.sha256` | Checksum SHA-256 |
| `install-anclora-filestudio.sh` | Instalador idempotente para el sistema |

## Instalación desde tar.zst

```bash
# Verificar integridad
sha256sum -c Anclora-FileStudio-Linux-x64.tar.zst.sha256

# Extraer
tar -I zstd -xf Anclora-FileStudio-Linux-x64.tar.zst

# Iniciar
cd Anclora-FileStudio-Linux-x64
./start-anclora-filestudio.sh
```

## Instalación asistida

```bash
bash install-anclora-filestudio.sh
```

El instalador:

1. Detecta la distribución Linux (Ubuntu, Debian, Fedora, Arch, etc.)
2. Comprueba arquitectura x64
3. Instala las dependencias del sistema (pide confirmación antes de `sudo`)
4. Extrae la aplicación en `~/.local/share/anclora-filestudio/` (sin root)
5. Crea un lanzador de escritorio (opcional)
6. Verifica el resultado con diagnóstico automático

## Dependencias del sistema

Para Ubuntu/Debian:

```bash
sudo apt install \
  ffmpeg \
  qpdf \
  p7zip-full \
  pandoc \
  tesseract-ocr \
  tesseract-ocr-spa \
  tesseract-ocr-eng \
  poppler-utils \
  zstd
```

yt-dlp requiere instalación separada:

```bash
pip install yt-dlp
# o
curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o ~/.local/bin/yt-dlp
chmod +x ~/.local/bin/yt-dlp
```

LibreOffice y Calibre son opcionales:

```bash
sudo apt install libreoffice
# Para Calibre: https://calibre-ebook.com/download_linux
```

## Scripts incluidos

| Script | Función |
|---|---|
| `start-anclora-filestudio.sh` | Inicia la aplicación |
| `stop-anclora-filestudio.sh` | Detiene la aplicación |
| `diagnose-anclora-filestudio.sh` | Diagnóstico de herramientas |

## Estructura interna

```text
Anclora-FileStudio-Linux-x64/
├── start-anclora-filestudio.sh
├── stop-anclora-filestudio.sh
├── diagnose-anclora-filestudio.sh
├── LEEME.txt
├── VERSION.txt
├── manifest.json
├── THIRD_PARTY_NOTICES.txt
├── app/              # Aplicación Next.js compilada
├── data/             # Base de datos SQLite (no borrar al actualizar)
└── logs/             # Logs de ejecución
```

## Actualización

Las herramientas del sistema se gestionan con el gestor de paquetes de tu distribución.
La aplicación Next.js se actualiza extrayendo el nuevo tar.zst y copiando `data/`.

```bash
# Detener versión anterior
./stop-anclora-filestudio.sh

# Extraer nueva versión
tar -I zstd -xf Anclora-FileStudio-Linux-x64-NEW.tar.zst

# Copiar datos
cp -r Anclora-FileStudio-Linux-x64/data/ Anclora-FileStudio-Linux-x64-NEW/

# Renombrar
mv Anclora-FileStudio-Linux-x64 Anclora-FileStudio-Linux-x64-OLD
mv Anclora-FileStudio-Linux-x64-NEW Anclora-FileStudio-Linux-x64

# Iniciar nueva versión
cd Anclora-FileStudio-Linux-x64
./start-anclora-filestudio.sh
```
